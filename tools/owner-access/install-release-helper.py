#!/usr/bin/env python3
"""Install a reviewed release helper and sign website releases as the owner.

Run as root on the server, next to the downloaded helper:
    python3 install-release-helper.py mark-dashboard-release.py
Undo everything this did:
    python3 install-release-helper.py --restore <backup folder it printed>

What it does:
- checks the new helper compiles and keeps the same server paths as the installed one
- refuses to run while a release is in progress
- backs up the installed helper, the release checkout's commit identity and its GitHub address
- installs the new helper
- signs future release commits as the owner instead of the original implementer
- points the release checkout at the owner's repository if it still uses the old,
  redirected address (the deploy key belongs to the repository, so pushes keep working)
- confirms the result read-only with `mark-dashboard-release operator history` and
  puts everything back if that check fails
"""
import datetime
import fcntl
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

OWNER_NAME = 'Mark Gerhart'
OWNER_EMAIL = '145999731+gerhartm@users.noreply.github.com'
OLD_OWNER = 'darshanahirrao/'
NEW_OWNER = 'gerhartm/'
TARGET = Path(os.environ.get('RELEASE_HELPER_TARGET', '/usr/local/sbin/mark-dashboard-release'))
BACKUPS = Path(os.environ.get('RELEASE_HELPER_BACKUPS', '/root/mark-v2-upgrades'))
SAME = ('EDITOR', 'BASE', 'COMPOSE', 'PROJECT', 'REPO', 'HISTORY', 'BACKUPS', 'LOCK', 'BRANCH')


def constants(text):
    return {name: value.strip() for name, value in re.findall(r'^([A-Z_]+) = (.+)$', text, re.M)}


def store_path(values):
    base = re.fullmatch(r"Path\('([^']+)'\)", values.get('BASE', ''))
    repo = re.fullmatch(r"BASE / '([^']+)'", values.get('REPO', ''))
    if not base or not repo:
        sys.exit('Could not find the release checkout in the helper. Nothing changed.')
    return Path(base.group(1)) / repo.group(1)


def lock_path(values):
    match = re.fullmatch(r"'([^']+)'", values.get('LOCK', ''))
    return Path(match.group(1)) if match else Path('/run/lock/mark-dashboard-release.lock')


def git(store, *args, check=True):
    done = subprocess.run(['git', '-C', str(store), *args], capture_output=True, text=True, timeout=120)
    if check and done.returncode:
        raise RuntimeError(done.stderr.strip() or f'git {" ".join(args)} failed')
    return done.stdout.strip()


def setting(store, name):
    return git(store, 'config', '--local', '--get', name, check=False) or None


def put(store, name, value):
    if value is None:
        git(store, 'config', '--local', '--unset', name, check=False)
    else:
        git(store, 'config', '--local', name, value)


def install(source, target):
    temporary = target.with_name('.' + target.name + '.new')
    shutil.copyfile(source, temporary)
    os.chmod(temporary, 0o755)
    if os.geteuid() == 0:
        os.chown(temporary, 0, 0)
    os.replace(temporary, target)


def restore(folder):
    folder = Path(folder)
    saved = json.loads((folder / 'settings.json').read_text())
    install(folder / 'mark-dashboard-release', TARGET)
    store = Path(saved['store'])
    for name, value in saved['settings'].items():
        put(store, name, value)
    print('Restored the previous release helper, commit identity and GitHub address.')


def verify(store):
    done = subprocess.run([str(TARGET), 'operator', 'history'], capture_output=True, text=True, timeout=180,
                          env={k: v for k, v in os.environ.items() if k != 'SSH_ORIGINAL_COMMAND'})
    try:
        result = json.loads(done.stdout)
    except json.JSONDecodeError:
        return None, (done.stderr.strip() or done.stdout.strip())[-300:]
    if result.get('status') != 'history':
        return None, str(result)[-300:]
    remote = git(store, 'ls-remote', 'origin', 'refs/heads/satoshi-dashboard').split()
    if not remote or remote[0] != result['current_commit']:
        return None, 'GitHub and the release ledger do not agree.'
    return result, ''


def main():
    if os.geteuid() != 0 and 'RELEASE_HELPER_TARGET' not in os.environ:
        sys.exit('Run this as root.')
    if len(sys.argv) == 3 and sys.argv[1] == '--restore':
        restore(sys.argv[2])
        return
    if len(sys.argv) != 2:
        sys.exit('Usage: python3 install-release-helper.py mark-dashboard-release.py')
    new_text = Path(sys.argv[1]).read_text()
    compile(new_text, sys.argv[1], 'exec')
    if 'def publish_docs' not in new_text or 'def operator_cli' not in new_text:
        sys.exit('That file is not the expected release helper. Nothing changed.')
    old_values, new_values = constants(TARGET.read_text()), constants(new_text)
    different = [name for name in SAME if old_values.get(name) != new_values.get(name)]
    if different:
        sys.exit('The new helper changes server paths (' + ', '.join(different) + '). Nothing changed.')
    store = store_path(old_values)
    names = ['user.name', 'user.email', 'remote.origin.url', 'remote.origin.pushurl']

    with open(lock_path(old_values), 'w') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            sys.exit('A website release is running right now. Try again when it has finished. Nothing changed.')
        stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
        folder = BACKUPS / f'release-helper-before-{stamp}'
        folder.mkdir(parents=True, mode=0o700)
        shutil.copy2(TARGET, folder / 'mark-dashboard-release')
        saved = {'store': str(store), 'settings': {name: setting(store, name) for name in names}}
        (folder / 'settings.json').write_text(json.dumps(saved, indent=2))
        os.chmod(folder / 'settings.json', 0o600)

        install(Path(sys.argv[1]), TARGET)
        put(store, 'user.name', OWNER_NAME)
        put(store, 'user.email', OWNER_EMAIL)
        moved = []
        for name in ('remote.origin.url', 'remote.origin.pushurl'):
            value = saved['settings'][name]
            if value and OLD_OWNER in value:
                put(store, name, value.replace(OLD_OWNER, NEW_OWNER))
                moved.append(name)
        fcntl.flock(lock, fcntl.LOCK_UN)

    result, problem = verify(store)
    if not result:
        restore(folder)
        sys.exit(f'The new helper did not pass its check ({problem}), so everything was put back.')
    print('Installed the new release helper.')
    print(f'Website release commits will now be signed as {OWNER_NAME}.')
    print('Release checkout now uses github.com/' + NEW_OWNER.rstrip('/') + ' directly.' if moved
          else 'Release checkout already used your repository address.')
    print(f"Live website commit: {result['current_commit'][:12]} (GitHub and the release ledger agree).")
    print(f'Undo if ever needed:  python3 {Path(sys.argv[0]).name} --restore {folder}')


if __name__ == '__main__':
    try:
        main()
    except RuntimeError as error:
        sys.exit(f'Stopped: {error}')
