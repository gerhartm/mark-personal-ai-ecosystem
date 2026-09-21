#!/usr/bin/env python3
"""Satoshi's asynchronous, model-pinned entry point into the native Hermes harness."""
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import uuid

ROOT = Path('/opt/data/dashboard-editor')
WORKSPACE = ROOT / 'workspace' / 'dashboard'
MODEL = 'gpt-6-astra'
EFFORT = 'high'


def manifest():
    result = {}
    for directory, folders, files in os.walk(WORKSPACE):
        folders[:] = [name for name in folders if name not in ('node_modules', 'dist', '.git', 'data', 'test-support')]
        for name in files:
            path = Path(directory) / name
            if path.is_file() and not path.is_symlink() and not name.endswith(('.log', '.tsbuildinfo')) and not name.startswith('._'):
                result[str(path.relative_to(WORKSPACE))] = hashlib.sha256(path.read_bytes()).hexdigest()
    return result


def save(path, value):
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(value, indent=2))
    temporary.replace(path)


def release(run_id, action, **extra):
    result = subprocess.run([
        'ssh', '-F', '/dev/null', '-i', str(ROOT / 'deploy-key'),
        '-o', 'BatchMode=yes', '-o', 'IdentitiesOnly=yes',
        '-o', f'UserKnownHostsFile={ROOT}/known_hosts', '-o', 'StrictHostKeyChecking=yes',
        '-o', 'ConnectTimeout=15', 'root@159.195.16.212',
    ], input=json.dumps({'run_id': run_id, 'action': action, **extra}) + '\n', text=True, capture_output=True, timeout=1800)
    folder = ROOT / 'runs' / run_id
    folder.mkdir(parents=True, exist_ok=True)
    (folder / f'{action}.log').write_text(result.stdout + result.stderr)
    (folder / 'release.log').write_text(result.stdout + result.stderr)
    if result.returncode:
        detail = result.stderr.strip().splitlines()[-1] if result.stderr.strip() else 'See the private release log.'
        raise RuntimeError('Dashboard operation failed: ' + detail[:600])
    return json.loads(result.stdout.strip().splitlines()[-1])


def worker(run_id):
    global WORKSPACE
    folder = ROOT / 'runs' / run_id
    task = json.loads((folder / 'request.json').read_text())
    state = {'run_id': run_id, 'status': 'queued', 'model': MODEL, 'reasoning_effort': EFFORT, 'started_at': time.time()}
    status = folder / 'status.json'
    save(status, state)
    with (ROOT / 'editor.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        agent = None
        try:
            if task.get('action') == 'revert':
                state['status'] = 'reverting'; save(status, state)
                state['release'] = release(run_id, 'revert', target=task['target'])
                state['status'] = 'deployed'
                state['summary'] = 'Previous dashboard code restored; research data retained.'
                return
            state['status'] = 'editing'; save(status, state)
            prepared = release(run_id, 'prepare')
            state['base_commit'] = prepared.get('base_commit')
            WORKSPACE = ROOT / 'workspaces' / run_id / 'dashboard'
            before = manifest()
            save(folder / 'source-before.json', before)
            os.environ['TERMINAL_CWD'] = str(WORKSPACE)
            os.chdir(WORKSPACE)
            sys.path.insert(0, '/opt/hermes')
            from hermes_cli.runtime_provider import resolve_runtime_provider
            from hermes_constants import parse_reasoning_effort
            from run_agent import AIAgent
            runtime = resolve_runtime_provider(requested='openai-api', target_model=MODEL)
            if runtime['provider'] != 'openai-api':
                raise RuntimeError('The dashboard editor requires the configured OpenAI API route.')
            instructions = (ROOT / 'EDITOR.md').read_text().replace('{{WORKSPACE}}', str(WORKSPACE))
            agent = AIAgent(
                model=MODEL, provider=runtime['provider'], api_key=runtime['api_key'],
                base_url=runtime['base_url'], api_mode=runtime.get('api_mode'),
                reasoning_config=parse_reasoning_effort(EFFORT), fallback_model=[],
                enabled_toolsets=['terminal', 'file'], max_iterations=100,
                quiet_mode=True, skip_memory=True, skip_background_review=True,
                skip_context_files=True, ephemeral_system_prompt=instructions,
                session_id=f'dashboard-edit-{run_id}', run_budget_seconds=1800,
            )
            # Inspect the actual outgoing body, not just the requested configuration.
            requests = []
            def enforce(request):
                if request.method != 'POST' or not request.url.path.endswith(('/responses', '/chat/completions')):
                    return
                body = json.loads(request.content)
                effort = (body.get('reasoning') or {}).get('effort') or body.get('reasoning_effort')
                if body.get('model') != MODEL or effort != EFFORT:
                    raise RuntimeError('Refusing an editor request that is not GPT-6 Astra High.')
                requests.append({'model': body['model'], 'reasoning_effort': effort, 'time': time.time()})
                save(folder / 'model-requests.json', requests)
            # Hermes may create a short-lived SDK client for each stream. Guard the
            # transport in this isolated worker process so those clients are covered too.
            import httpx
            original_send = httpx.Client.send
            def guarded_send(client, request, *args, **kwargs):
                enforce(request)
                return original_send(client, request, *args, **kwargs)
            httpx.Client.send = guarded_send
            result = agent.run_conversation(task['request'])
            if not result.get('completed') or not requests:
                raise RuntimeError('The native editor did not finish a verified Astra High run.')
            final = result.get('final_response') or ''
            (folder / 'summary.txt').write_text(final)
            report = json.loads(final.strip().removeprefix('```json').removeprefix('```').removesuffix('```').strip())
            after = manifest()
            changed = sorted(path for path in before.keys() | after.keys() if before.get(path) != after.get(path))
            state.update(changed_files=changed, summary=report.get('summary'))
            if report.get('status') != 'ready':
                state.update(status='blocked', error=report.get('summary') or 'The editor needs input before it can complete this change.')
                return
            if not changed:
                state.update(status='unchanged', api_requests=len(requests))
                return
            state.update(status='checking', api_requests=len(requests)); save(status, state)
            agent.close(); agent = None
            if task.get('publish'):
                state['release'] = release(run_id, 'deploy')
            else:
                state['release'] = release(run_id, 'check')
            state['status'] = 'deployed' if task.get('publish') else 'checked'
        except Exception as error:
            state.update(status='failed', error=str(error)[:700])
        finally:
            if agent is not None:
                agent.close()
            state['finished_at'] = time.time()
            save(status, state)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    start = commands.add_parser('start')
    start.add_argument('--request-file', required=True)
    start.add_argument('--publish', action='store_true', help='Publish after the requested edit passes all checks.')
    revert = commands.add_parser('revert')
    revert.add_argument('--to', default='previous', help='previous or a full published commit from history')
    commands.add_parser('history')
    status = commands.add_parser('status'); status.add_argument('run_id')
    work = commands.add_parser('_worker'); work.add_argument('run_id')
    args = parser.parse_args()
    if args.command == 'history':
        print(json.dumps(release(uuid.uuid4().hex, 'history'), indent=2))
        return
    if args.command in ('start', 'revert'):
        request = Path(args.request_file).read_text().strip() if args.command == 'start' else ''
        if args.command == 'start' and (not request or len(request) > 40_000):
            raise SystemExit('Provide a request containing 1 to 40,000 characters.')
        if args.command == 'revert' and args.to != 'previous' and (len(args.to) != 40 or any(c not in '0123456789abcdef' for c in args.to)):
            raise SystemExit('Use previous or a full published commit SHA.')
        run_id = uuid.uuid4().hex
        folder = ROOT / 'runs' / run_id; folder.mkdir(parents=True, mode=0o700)
        save(folder / 'request.json', {'request': request, 'publish': getattr(args, 'publish', True), 'action': args.command, 'target': getattr(args, 'to', None)})
        save(folder / 'status.json', {'run_id': run_id, 'status': 'starting', 'model': MODEL, 'reasoning_effort': EFFORT})
        with (folder / 'worker.log').open('w') as log:
            process = subprocess.Popen([sys.executable, __file__, '_worker', run_id], stdin=subprocess.DEVNULL, stdout=log, stderr=log, start_new_session=True)
        print(json.dumps({'run_id': run_id, 'pid': process.pid, 'status': 'started', 'model': MODEL, 'reasoning_effort': EFFORT}))
    else:
        if len(args.run_id) != 32 or any(c not in '0123456789abcdef' for c in args.run_id):
            raise SystemExit('Invalid editor run ID.')
        if args.command == '_worker':
            worker(args.run_id)
        else:
            print((ROOT / 'runs' / args.run_id / 'status.json').read_text())
            summary = ROOT / 'runs' / args.run_id / 'summary.txt'
            if summary.exists(): print(summary.read_text())


if __name__ == '__main__':
    main()
