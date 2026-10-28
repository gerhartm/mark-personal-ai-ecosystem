#!/usr/bin/env python3
"""Restricted host-side dashboard builds, GitHub releases and code-only restores.

Two entry points share one release path (checks, backup, versioned commit, deploy,
health check, automatic recovery and the release ledger):

- Satoshi's editor sends one JSON request on stdin through its restricted SSH key.
- An operator logged in to the host runs `mark-dashboard-release operator ...` to check
  or deploy a reviewed GitHub branch, restore a published version, or read the history.

Operator branches may also change the project's instructions and documentation
(CLAUDE.md, AGENTS.md, README.md and docs/). Documentation travels with a website release,
or on its own without rebuilding or restarting the website.
"""
import argparse
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
import uuid

EDITOR = Path('/var/lib/docker/volumes/27am3wgv7vkohkenprml4s3p_hermes-data/_data/dashboard-editor')
BASE = Path('/srv/mark-v2/crypto-dashboard')
COMPOSE = BASE / 'deploy/docker-compose.production.yml'
PROJECT = 'crypto-dashboard-20260905t095230z'
REPO = BASE / 'git-store'
HISTORY = BASE / 'release-history.json'
BACKUPS = Path('/root/mark-v2-upgrades')
LOCK = '/run/lock/mark-dashboard-release.lock'
BRANCH = 'satoshi-dashboard'
URL = 'https://github.com/gerhartm/mark-personal-ai-ecosystem'
SITE = 'https://crypto.forkedbrain.fyi'
SCHEMA = 'dashboard/server/src/db.ts'
OPERATOR_BRANCH = re.compile(r'(ux|operator|release)/[a-z0-9][a-z0-9._-]{0,63}')
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


def documentation(path):
    """Project instructions and docs that may be published without touching the website."""
    return path in ('CLAUDE.md', 'AGENTS.md', 'README.md') or path.startswith('docs/')


def apply_docs(commit, paths):
    """Stage documentation files exactly as they are in a reviewed commit."""
    present = set(git('ls-tree', '-r', '--name-only', commit, '--', *paths).splitlines()) if paths else set()
    for path in paths:
        if path in present:
            git('checkout', commit, '--', path)
        else:
            git('rm', '-q', '--ignore-unmatch', '--', path)


def version(source, message, docs=None):
    shutil.rmtree(REPO / 'dashboard')
    copy_source(source, REPO / 'dashboard')
    git('add', '-A', '--', 'dashboard')
    if docs:
        apply_docs(*docs)
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


def restore_target(history, target):
    published = [r for r in history['releases'] if r.get('status') in ('baseline', 'deployed', 'recovered')]
    if target == 'previous':
        if len(published) < 2: raise RuntimeError('There is no earlier published version.')
        target = published[-2]['commit']
    if not re.fullmatch('[0-9a-f]{40}', target or '') or target not in {r['commit'] for r in published}:
        raise RuntimeError('Restore target must be a full commit from published dashboard history.')
    if target == history['current_commit']: raise RuntimeError('That version is already current.')
    if git('diff', '--name-only', target, 'HEAD', '--', SCHEMA):
        raise RuntimeError('Database schema code differs; operator compatibility review required before restoring.')
    return target


def export_dashboard(commit, release, run_id):
    # Export only the recorded dashboard subtree; no checkout/reset of Git history.
    archive = subprocess.Popen(['git', '-C', str(REPO), 'archive', commit, 'dashboard'], stdout=subprocess.PIPE)
    staging = BASE / 'restore-sources' / run_id
    staging.mkdir(parents=True)
    cmd(['tar', '-x', '-C', str(staging)], stdin=archive.stdout)
    archive.stdout.close()
    if archive.wait(): raise RuntimeError('Failed to export restore source.')
    copy_source(staging / 'dashboard', release)
    shutil.rmtree(staging)


def build(release, run_id, kind):
    """Run the regression suite with networking disabled, then build the production image."""
    fixture_setup(release)
    check_image = f'mark-dashboard-checks:{run_id}'
    image = f'mark-crypto-dashboard:{kind}-{run_id}'
    cmd(['docker', 'build', '-f', 'Dockerfile.checks', '-t', check_image, '.'], cwd=release)
    cmd(['docker', 'run', '--rm', '--network', 'none', '--memory', '2g', '--cpus', '2', '--pids-limit', '256', check_image], timeout=600)
    cmd(['docker', 'build', '-t', image, '.'], cwd=release)
    return image


def publish(history, release, run_id, image, message, kind='editor', draft=False, target_commit=None, extra=None, docs=None):
    """Back up, version and push a checked release, then replace only the dashboard service."""
    old_commit = history['current_commit']
    old_compose = COMPOSE.read_text()
    old_image = output(['docker', 'inspect', 'crypto-dashboard', '--format', '{{.Config.Image}}'])
    match = re.search(r'(?m)^    image: mark-crypto-dashboard:[^\s]+$', old_compose)
    if not match: raise RuntimeError('Compose mapping changed; operator review required.')
    backup = BACKUPS / f'dashboard-{kind}-{run_id}'
    backup.mkdir(mode=0o700, parents=True)
    (backup / 'compose-before.yml').write_text(old_compose)
    (backup / 'image-before.txt').write_text(old_image)
    with sqlite3.connect(f'file:{BASE}/data/crypto-intelligence.db?mode=ro', uri=True) as db:
        with sqlite3.connect(backup / 'database-before.db') as destination: db.backup(destination)
    commit = version(release, message, docs)
    if draft:
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
        # Keep failures visible in history while restoring the old source (and any
        # documentation that travelled with it) with a new commit.
        git('restore', f'--source={old_commit}', '--staged', '--worktree', '--', '.')
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
    if extra: receipt.update(extra)
    history['current_commit'] = commit
    history['releases'].append(receipt)
    save(HISTORY, history)
    save(backup / 'release.json', receipt)
    mirror()
    return receipt


def publish_docs(history, commit, paths, message, extra=None):
    """Version documentation-only changes without rebuilding or restarting the website."""
    old_commit = history['current_commit']
    try:
        apply_docs(commit, paths)
        if not git('diff', '--cached', '--name-only'):
            raise RuntimeError('No documentation changes to publish.')
        git('-c', 'core.hooksPath=/dev/null', 'commit', '-m', message)
        new = git('rev-parse', 'HEAD')
        push_verified(new)
    except Exception:
        git('reset', '-q', '--hard', old_commit)
        raise
    receipt = {'status': 'documented', 'commit': new, 'previous_commit': old_commit, 'commit_url': f'{URL}/commit/{new}',
               'branch': BRANCH, 'changed_files': paths[:50], 'website': 'unchanged', 'time': time.time()}
    if extra: receipt.update(extra)
    history['current_commit'] = new
    history['releases'].append(receipt)
    save(HISTORY, history)
    return receipt


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
        # Give native file-edit verification a real local diff without exposing
        # the host repository, GitHub credentials or remote publishing rights.
        dashboard = work / 'dashboard'
        cmd(['git', 'init', '-q', str(dashboard)])
        (dashboard / '.git/info/exclude').write_text('data/\nnode_modules/\ndist/\ntest-support/\n.editor-tmp/\n.acceptance-checks/\n.npm/\n.cache/\n._*\n*.tsbuildinfo\n')
        cmd(['git', '-C', str(dashboard), 'add', '-A'])
        cmd(['git', '-C', str(dashboard), '-c', 'user.name=Dashboard editor', '-c', 'user.email=editor@localhost', '-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'Published dashboard baseline ' + history['current_commit']])
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
        target_commit = restore_target(history, request.get('target', 'previous'))
        export_dashboard(target_commit, release, run_id)
    else:
        if state.get('model') != 'gpt-6-astra' or state.get('reasoning_effort') != 'high' or state.get('status') != 'checking':
            raise RuntimeError('Only a completed Astra High editor run may request a release.')
        verified = json.loads((folder / 'model-requests.json').read_text())
        if not verified or any(r.get('model') != 'gpt-6-astra' or r.get('reasoning_effort') != 'high' for r in verified):
            raise RuntimeError('Missing verified model requests.')
        if json.loads((folder / 'base.json').read_text())['commit'] != history['current_commit']:
            raise RuntimeError('Dashboard changed since this edit started; create a new edit against the current version.')
        copy_source(EDITOR / 'workspaces' / run_id / 'dashboard', release)
    image = build(release, run_id, 'editor')
    message = f'Restore dashboard to {target_commit[:12]}' if target_commit else f'Dashboard edit {run_id[:12]}: {str(state.get("summary", "Requested update"))[:160]}'
    return publish(history, release, run_id, image, message, draft=action == 'check', target_commit=target_commit)


def operator_source(history, branch, commit, allow_schema=False):
    """Validate a reviewed GitHub branch before anything is built or changed."""
    if not OPERATOR_BRANCH.fullmatch(branch or ''):
        raise RuntimeError('Release branches must be named ux/..., operator/... or release/... in lowercase letters, digits, dots and dashes.')
    if not re.fullmatch('[0-9a-f]{40}', commit or ''):
        raise RuntimeError('Give the full 40-character commit ID to release.')
    try:
        git('fetch', 'origin', f'+refs/heads/{branch}:refs/remotes/origin/{branch}')
    except subprocess.CalledProcessError:
        raise RuntimeError(f'Could not fetch {branch} from GitHub; check the branch name.') from None
    tip = git('rev-parse', f'refs/remotes/origin/{branch}')
    if tip != commit:
        raise RuntimeError(f'{branch} on GitHub is at {tip[:12]}, not {commit[:12]}; confirm which commit to release.')
    base = history['current_commit']
    if subprocess.run(['git', '-C', str(REPO), 'merge-base', '--is-ancestor', base, commit]).returncode:
        raise RuntimeError(f'{branch} is not based on the published dashboard ({base[:12]}); update the branch from {BRANCH} first.')
    changed = git('diff', '--name-only', base, commit).splitlines()
    outside = [path for path in changed if not path.startswith('dashboard/') and not documentation(path)]
    if outside:
        raise RuntimeError('Operator releases may only change dashboard/ and documentation (CLAUDE.md, AGENTS.md, '
                           'README.md, docs/); this branch also changes ' + ', '.join(outside[:5]))
    if not changed:
        raise RuntimeError('No changes between the published release and this commit.')
    if SCHEMA in changed and not allow_schema:
        raise RuntimeError('Database schema code changed; review compatibility, then rerun with --allow-schema-change.')
    return changed


def confirm(question, word, assume_yes, ask=None):
    """Require the operator to type a word before production changes; stdout stays JSON."""
    if assume_yes: return
    if ask is None:
        if not sys.stdin.isatty():
            raise RuntimeError('Confirmation needed: run this from an interactive login or add --yes.')
        def ask(prompt):
            sys.stderr.write(prompt); sys.stderr.flush()
            return sys.stdin.readline()
    sys.stderr.write(question + '\n')
    if ask(f'Type {word} to continue: ').strip().lower() != word:
        raise RuntimeError('Cancelled; nothing was changed.')


def operator(args, ask=None):
    history = current()
    if args.command == 'history':
        return {'status': 'history', 'current_commit': history['current_commit'], 'repository': URL, 'branch': BRANCH, 'recent_releases': history['releases'][-10:]}
    if args.command in ('deploy', 'revert') and not (os.environ.get('TMUX') or os.environ.get('STY')):
        raise RuntimeError('Start tmux first (tmux new -s release) so a dropped connection cannot interrupt the release, then rerun this command.')
    run_id = uuid.uuid4().hex
    release = BASE / 'releases' / f'operator-{run_id}'
    if args.command == 'revert':
        target = restore_target(history, args.to)
        files = git('diff', '--name-only', history['current_commit'], target, '--', 'dashboard').splitlines()
        confirm(f'Restore {SITE} to {target[:12]} ({len(files)} files differ from the live version). Research data is not touched.', 'restore', args.yes, ask)
        export_dashboard(target, release, run_id)
        image = build(release, run_id, 'operator')
        return publish(history, release, run_id, image, f'Restore dashboard to {target[:12]}', kind='operator', target_commit=target, extra={'operator': True})
    changed = operator_source(history, args.branch, args.commit, args.allow_schema_change)
    docs = [path for path in changed if documentation(path)]
    summary = ' '.join((args.summary or '').split()) or args.branch
    source = {'operator': True, 'source_branch': args.branch, 'source_commit': args.commit}
    if len(docs) == len(changed):
        if args.command == 'check':
            return {'status': 'checked', 'deployed': False, 'documentation_only': True, 'branch': args.branch, 'commit': args.commit,
                    'changed_files': changed[:50], 'changed_count': len(changed)}
        confirm(f'Publish documentation from {args.branch} at {args.commit[:12]} ({len(docs)} changed files). '
                f'The website at {SITE} is not rebuilt or restarted.', 'deploy', args.yes, ask)
        return publish_docs(history, args.commit, docs, f'Operator docs {args.branch}@{args.commit[:12]}: {summary[:160]}', extra=source)
    if args.command == 'deploy':
        confirm(f'Deploy {args.branch} at {args.commit[:12]} ({len(changed)} changed files) to {SITE}. The database is backed up first, and the previous version comes back automatically if the health check fails.', 'deploy', args.yes, ask)
    export_dashboard(args.commit, release, run_id)
    image = build(release, run_id, 'operator')
    if args.command == 'check':
        shutil.rmtree(release)
        return {'status': 'checked', 'deployed': False, 'branch': args.branch, 'commit': args.commit, 'changed_files': changed[:50], 'changed_count': len(changed), 'image': image}
    message = f'Operator release {args.branch}@{args.commit[:12]}: {summary[:160]}'
    return publish(history, release, run_id, image, message, kind='operator', extra=source, docs=(args.commit, docs) if docs else None)


def operator_cli(argv, ask=None):
    if os.environ.get('SSH_ORIGINAL_COMMAND'):
        raise RuntimeError('Operator commands run only from an interactive server login, not through a restricted key.')
    parser = argparse.ArgumentParser(prog='mark-dashboard-release operator', description='Release a reviewed GitHub branch through the dashboard release gate.')
    commands = parser.add_subparsers(dest='command', required=True)
    for name, text in (('check', 'Run the full checks and build without deploying.'), ('deploy', 'Check, back up, deploy and verify a branch.')):
        sub = commands.add_parser(name, help=text)
        sub.add_argument('--branch', required=True, help='GitHub branch, for example ux/layout-pass-1')
        sub.add_argument('--commit', required=True, help='full 40-character commit ID at the tip of that branch')
        sub.add_argument('--summary', default='', help='short description for the release record')
        sub.add_argument('--allow-schema-change', action='store_true', help='allow changes to dashboard/server/src/db.ts after review')
        sub.add_argument('--yes', action='store_true', help='skip the typed confirmation')
    restore = commands.add_parser('revert', help='Restore a previously published version.')
    restore.add_argument('--to', default='previous', help='previous, or a full published commit ID')
    restore.add_argument('--yes', action='store_true', help='skip the typed confirmation')
    commands.add_parser('history', help='Show the live commit and recent releases.')
    args = parser.parse_args(argv)
    with open(LOCK, 'w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        return operator(args, ask)


def main():
    if len(sys.argv) > 1 and sys.argv[1] == 'operator':
        print(json.dumps(operator_cli(sys.argv[2:]), indent=2))
        return
    request = json.loads(sys.stdin.readline(4096))
    with open(LOCK, 'w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        print(json.dumps(perform(request)))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(json.dumps({'status': 'failed', 'error': str(error)}), file=sys.stderr)
        sys.exit(1)
