#!/usr/bin/env python3
"""Restricted host-side dashboard builds, GitHub releases and code-only restores."""
import fcntl
import json
import os
from pathlib import Path
import re
import shutil
import sqlite3
import subprocess
import sys
import time
import urllib.request

EDITOR = Path('/var/lib/docker/volumes/27am3wgv7vkohkenprml4s3p_hermes-data/_data/dashboard-editor')
BASE = Path('/srv/mark-v2/crypto-dashboard')
COMPOSE = BASE / 'deploy/docker-compose.production.yml'
PROJECT = 'crypto-dashboard-20260905t095230z'
REPO = BASE / 'git-store'
HISTORY = BASE / 'release-history.json'
BRANCH = 'satoshi-dashboard'
URL = 'https://github.com/darshanahirrao/mark-personal-ai-ecosystem'
EXCLUDE = ('node_modules', 'dist', '.git', 'data', 'test-support', '.acceptance-checks', '.editor-tmp', '.npm', '.cache', 'acceptance', '*.log', '*.tsbuildinfo', '.env', '.env.*', '.DS_Store', '._*')


def cmd(args, **kwargs):
    return subprocess.run(args, check=True, text=True, **kwargs)


def output(args, **kwargs):
    return subprocess.check_output(args, text=True, **kwargs).strip()


def git(*args):
    return output(['git', '-C', str(REPO), *args])


def save(path, value):
    temp = path.with_suffix('.tmp')
    temp.write_text(json.dumps(value, indent=2))
    temp.replace(path)


def copy_source(source, target):
    for root, dirs, files in os.walk(source):
        dirs[:] = [d for d in dirs if d not in ('node_modules', 'dist', '.git', 'data', 'test-support', '.acceptance-checks', '.editor-tmp', '.npm', '.cache', 'acceptance')]
        for name in dirs + files:
            if (Path(root) / name).is_symlink():
                raise RuntimeError('Symlinks are not accepted in dashboard releases.')
    shutil.copytree(source, target, ignore=shutil.ignore_patterns(*EXCLUDE))


def current():
    history = json.loads(HISTORY.read_text())
    git('fetch', 'origin', BRANCH)
    if git('rev-parse', 'HEAD') != history['current_commit'] or git('rev-parse', f'origin/{BRANCH}') != history['current_commit']:
        raise RuntimeError('GitHub and the published release differ; operator reconciliation required.')
    if git('status', '--porcelain', '--untracked-files=no'):
        raise RuntimeError('Release checkout contains unfinished changes; operator reconciliation required.')
    return history


def fixture_setup(directory):
    shutil.copytree(EDITOR / 'test-support', directory / 'test-support')
    for name in ('Dockerfile.checks', 'Dockerfile.checks.dockerignore'):
        shutil.copy(EDITOR / name, directory / name)


def healthy():
    for _ in range(45):
        try:
            with urllib.request.urlopen('http://127.0.0.1:9330/api/health', timeout=4) as response:
                if response.status == 200:
                    return True
        except Exception:
            pass
        time.sleep(2)
    return False


def version(source, message):
    shutil.rmtree(REPO / 'dashboard')
    copy_source(source, REPO / 'dashboard')
    git('add', '-A', '--', 'dashboard')
    if not git('diff', '--cached', '--name-only'):
        raise RuntimeError('No dashboard code changes to version.')
    git('-c', 'core.hooksPath=/dev/null', 'commit', '-m', message)
    return git('rev-parse', 'HEAD')


def push_verified(commit, branch=BRANCH):
    git('push', 'origin', f'{commit}:refs/heads/{branch}')
    remote = git('ls-remote', 'origin', f'refs/heads/{branch}').split()[0]
    if remote != commit:
        raise RuntimeError('GitHub did not confirm the expected commit; dashboard was not promoted.')


def mirror():
    target = EDITOR / 'workspace/dashboard'
    replacement = EDITOR / 'workspace/dashboard-new'
    if replacement.exists(): shutil.rmtree(replacement)
    copy_source(REPO / 'dashboard', replacement)
    # Keep the synthetic baseline available for local agent tests.
    (replacement / 'data').mkdir()
    shutil.copy(EDITOR / 'test-support/baseline.db', replacement / 'data/crypto-intelligence.db')
    if target.exists(): shutil.rmtree(target)
    replacement.rename(target)


def perform(request):
    action, run_id = request.get('action'), request.get('run_id', '')
    if action not in ('history', 'prepare', 'check', 'deploy', 'revert') or not re.fullmatch('[0-9a-f]{32}', run_id):
        raise RuntimeError('Invalid dashboard release request.')
    history = current()
    if action == 'history':
        return {'status': 'history', **history, 'repository': URL, 'branch': BRANCH}
    folder = EDITOR / 'runs' / run_id
    state = json.loads((folder / 'status.json').read_text())
    if action == 'prepare':
        if state.get('status') != 'editing': raise RuntimeError('Editor must be starting a new edit.')
        work = EDITOR / 'workspaces' / run_id
        work.mkdir(parents=True)
        copy_source(REPO / 'dashboard', work / 'dashboard')
        (work / 'dashboard/data').mkdir()
        shutil.copy(EDITOR / 'test-support/baseline.db', work / 'dashboard/data/crypto-intelligence.db')
        frozen = work / '.work/crypto-v2/dashboard-handoff-20260803T010000Z'
        shutil.copytree(EDITOR / 'test-support/frozen', frozen)
        # Native Hermes tools run as uid/gid 10000, not docker-exec root.
        for directory, dirs, files in os.walk(work):
            os.chown(directory, 10000, 10000)
            for name in files: os.chown(Path(directory) / name, 10000, 10000)
        save(folder / 'base.json', {'commit': history['current_commit']})
        return {'status': 'prepared', 'base_commit': history['current_commit']}
    release = BASE / 'releases' / f'editor-{run_id}'
    if release.exists(): raise RuntimeError('This run already has a release snapshot; use a new run.')
    target_commit = None
    if action == 'revert':
        if state.get('status') != 'reverting': raise RuntimeError('No active revert request.')
        target_commit = request.get('target', 'previous')
        published = [r for r in history['releases'] if r.get('status') in ('baseline', 'deployed', 'recovered')]
        if target_commit == 'previous':
            if len(published) < 2: raise RuntimeError('There is no earlier published version.')
            target_commit = published[-2]['commit']
        if not re.fullmatch('[0-9a-f]{40}', target_commit or '') or target_commit not in {r['commit'] for r in published}:
            raise RuntimeError('Restore target must be a full commit from published dashboard history.')
        if target_commit == history['current_commit']: raise RuntimeError('That version is already current.')
        if git('diff', '--name-only', target_commit, 'HEAD', '--', 'dashboard/server/src/db.ts'):
            raise RuntimeError('Database schema code differs; operator compatibility review required before restoring.')
        # Export only the recorded dashboard subtree; no checkout/reset of Git history.
        archive = subprocess.Popen(['git', '-C', str(REPO), 'archive', target_commit, 'dashboard'], stdout=subprocess.PIPE)
        staging = BASE / 'restore-sources' / run_id
        staging.mkdir(parents=True)
        cmd(['tar', '-x', '-C', str(staging)], stdin=archive.stdout)
        archive.stdout.close()
        if archive.wait(): raise RuntimeError('Failed to export restore source.')
        copy_source(staging / 'dashboard', release)
        shutil.rmtree(staging)
    else:
        if state.get('model') != 'gpt-6-astra' or state.get('reasoning_effort') != 'high' or state.get('status') != 'checking':
            raise RuntimeError('Only a completed Astra High editor run may request a release.')
        verified = json.loads((folder / 'model-requests.json').read_text())
        if not verified or any(r.get('model') != 'gpt-6-astra' or r.get('reasoning_effort') != 'high' for r in verified):
            raise RuntimeError('Missing verified model requests.')
        if json.loads((folder / 'base.json').read_text())['commit'] != history['current_commit']:
            raise RuntimeError('Dashboard changed since this edit started; create a new edit against the current version.')
        copy_source(EDITOR / 'workspaces' / run_id / 'dashboard', release)
    fixture_setup(release)
    check_image = f'mark-dashboard-checks:{run_id}'
    image = f'mark-crypto-dashboard:editor-{run_id}'
    cmd(['docker', 'build', '-f', 'Dockerfile.checks', '-t', check_image, '.'], cwd=release)
    cmd(['docker', 'run', '--rm', '--network', 'none', '--memory', '2g', '--cpus', '2', '--pids-limit', '256', check_image], timeout=600)
    cmd(['docker', 'build', '-t', image, '.'], cwd=release)
    old_commit = history['current_commit']
    old_compose = COMPOSE.read_text()
    old_image = output(['docker', 'inspect', 'crypto-dashboard', '--format', '{{.Config.Image}}'])
    match = re.search(r'(?m)^    image: mark-crypto-dashboard:[^\s]+$', old_compose)
    if not match: raise RuntimeError('Compose mapping changed; operator review required.')
    backup = Path('/root/mark-v2-upgrades') / f'dashboard-editor-{run_id}'
    backup.mkdir(mode=0o700, parents=True)
    (backup / 'compose-before.yml').write_text(old_compose)
    (backup / 'image-before.txt').write_text(old_image)
    with sqlite3.connect(f'file:{BASE}/data/crypto-intelligence.db?mode=ro', uri=True) as db:
        with sqlite3.connect(backup / 'database-before.db') as destination: db.backup(destination)
    message = f'Restore dashboard to {target_commit[:12]}' if target_commit else f'Dashboard edit {run_id[:12]}: {str(state.get("summary", "Requested update"))[:160]}'
    commit = version(release, message)
    if action == 'check':
        draft_branch = f'satoshi-dashboard-drafts/{run_id}'
        try:
            push_verified(commit, draft_branch)
        finally:
            # Detach draft work from the published branch without changing its history.
            git('checkout', '--detach', old_commit)
            git('branch', '-f', BRANCH, old_commit)
            git('checkout', BRANCH)
        return {'status': 'checked', 'run_id': run_id, 'commit': commit, 'commit_url': f'{URL}/commit/{commit}', 'branch': draft_branch, 'image': image}
    compose = ['docker', 'compose', '-p', PROJECT, '-f', str(COMPOSE), 'up', '-d', '--no-deps', 'crypto-dashboard']
    promotion_started = False
    try:
        push_verified(commit)
        promotion_started = True
        COMPOSE.write_text(old_compose[:match.start()] + f'    image: {image}' + old_compose[match.end():])
        cmd(compose)
        if not healthy() or output(['docker', 'inspect', 'crypto-dashboard', '--format', '{{.Config.Image}}']) != image:
            raise RuntimeError('Dashboard failed its post-deployment checks.')
    except Exception as failure:
        if promotion_started:
            COMPOSE.write_text(old_compose)
            cmd(compose)
            if not healthy(): raise RuntimeError('Deployment and automatic recovery failed; operator required.') from failure
        # Keep failures visible in history while restoring the old source with a new commit.
        git('restore', f'--source={old_commit}', '--staged', '--worktree', '--', 'dashboard')
        git('-c', 'core.hooksPath=/dev/null', 'commit', '-m', f'Recover previous dashboard after failed release {run_id[:12]}')
        recovery = git('rev-parse', 'HEAD')
        push_verified(recovery)
        history['current_commit'] = recovery
        history['releases'].append({'status': 'recovered', 'commit': recovery, 'image': old_image, 'run_id': run_id, 'failed_commit': commit, 'time': time.time()})
        save(HISTORY, history)
        mirror()
        raise RuntimeError(f'Publication failed; previous dashboard preserved. Recovery commit {recovery}.') from failure
    receipt = {'status': 'deployed', 'image': image, 'previous_image': old_image, 'run_id': run_id, 'health': 'passed', 'backup': str(backup), 'commit': commit, 'previous_commit': old_commit, 'commit_url': f'{URL}/commit/{commit}', 'branch': BRANCH, 'time': time.time()}
    if target_commit: receipt['restored_from'] = target_commit
    history['current_commit'] = commit
    history['releases'].append(receipt)
    save(HISTORY, history)
    save(backup / 'release.json', receipt)
    mirror()
    return receipt


def main():
    request = json.loads(sys.stdin.readline(4096))
    with open('/run/lock/mark-dashboard-release.lock', 'w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        print(json.dumps(perform(request)))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(json.dumps({'status': 'failed', 'error': str(error)}), file=sys.stderr)
        sys.exit(1)
