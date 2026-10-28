#!/usr/bin/env python3
"""Remove one SSH key from root's authorized_keys, safely.

Usage (as root on the server):  python3 remove-root-key.py SHA256:<fingerprint>

Refuses to remove the key the current session logged in with, refuses to
leave root without another unrestricted key, keeps a backup next to the
file and asks for a typed confirmation before changing anything.
"""
import datetime
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

KEYS = Path(os.environ.get('OWNER_KEYS_FILE', '/root/.ssh/authorized_keys'))
LOGIN = re.compile(r'Accepted publickey for \S+ from (\S+) port (\d+) \S+: \S+ (SHA256:[A-Za-z0-9+/=]+)')
# Service keys keep running but are no way for a person to get back in.
SERVICE_KEYS = {'SHA256:NbVcUQpvqbg3Z5GiduyKXuWah31QLTJXPvdss/LOi4k'}
KEY_TYPE = re.compile(r'(?:^|\s)(?:ssh-(?:ed25519|rsa|dss)|ecdsa-sha2-nistp\d+|sk-\S+@openssh\.com)\s+[A-Za-z0-9+/=]+')


def fingerprint(line):
    done = subprocess.run(['ssh-keygen', '-lf', '/dev/stdin'], input=line + '\n', capture_output=True,
                          text=True, timeout=10, start_new_session=True)
    parts = done.stdout.split()
    return (parts[1], ' '.join(parts[2:-1])) if done.returncode == 0 and len(parts) >= 3 else (None, '')


def session_key():
    """Fingerprint of the key this SSH session used, from the login logs."""
    connection = os.environ.get('SSH_CONNECTION', '').split()
    if len(connection) < 2:
        return None
    done = subprocess.run(['journalctl', '--no-pager', '-q', '--since', '-3 days', '-t', 'sshd', '-t', 'sshd-session'],
                          capture_output=True, text=True, timeout=120, start_new_session=True,
                          stdin=subprocess.DEVNULL)
    lines = done.stdout.splitlines()
    auth = Path('/var/log/auth.log')
    if auth.exists():
        lines += auth.read_text(errors='replace').splitlines()
    for line in reversed(lines):
        match = LOGIN.search(line)
        if match and match.group(1) == connection[0] and match.group(2) == connection[1]:
            return match.group(3)
    return None


def main():
    if len(sys.argv) != 2 or not sys.argv[1].startswith('SHA256:'):
        sys.exit('Usage: python3 remove-root-key.py SHA256:<fingerprint>')
    target = sys.argv[1]
    if os.geteuid() != 0 and 'OWNER_KEYS_FILE' not in os.environ:
        sys.exit('Run this as root.')
    lines = KEYS.read_text().splitlines(keepends=True)
    keep, remove, unrestricted = [], [], []
    for raw in lines:
        line = raw.strip()
        if not line or line.startswith('#'):
            keep.append(raw)
            continue
        fp, comment = fingerprint(line)
        if fp == target:
            remove.append((fp, comment))
            continue
        keep.append(raw)
        match = KEY_TYPE.search(line)
        options = line[:match.start()].strip() if match else ''
        if fp and 'command=' not in options and fp not in SERVICE_KEYS and 'coolify' not in comment.lower():
            unrestricted.append((fp, comment))
    if not remove:
        print(f'{target} is not in {KEYS}. Nothing to do.')
        return
    mine = session_key()
    if mine == target:
        sys.exit('Refusing: you are logged in with this key right now. Log in with your own key first.')
    if not unrestricted:
        sys.exit('Refusing: no other personal full-access key would remain, so you could be locked out.')
    print('Will remove:')
    for fp, comment in remove:
        print(f'  {fp} {comment}')
    print('Personal keys that will still log in as root (service keys are kept too):')
    for fp, comment in unrestricted:
        flag = '  <- this session' if fp == mine else ''
        print(f'  {fp} {comment}{flag}')
    if mine is None:
        print('Note: could not tell which key this session used; the check above is your safety net.')
    if input('Type remove to continue: ').strip() != 'remove':
        sys.exit('Cancelled. Nothing changed.')
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    backup = KEYS.with_name(f'{KEYS.name}.before-{stamp}')
    shutil.copy2(KEYS, backup)
    os.chmod(backup, 0o600)
    status = KEYS.stat()
    temporary = KEYS.with_name(KEYS.name + '.tmp')
    with open(temporary, 'w') as handle:
        handle.writelines(keep)
        handle.flush()
        os.fsync(handle.fileno())
    os.chmod(temporary, 0o600)
    if os.geteuid() == 0:
        os.chown(temporary, status.st_uid, status.st_gid)
    os.replace(temporary, KEYS)
    left = [fingerprint(raw.strip())[0] for raw in KEYS.read_text().splitlines() if raw.strip() and not raw.startswith('#')]
    if target in left or any(fp not in left for fp, _ in unrestricted):
        shutil.copy2(backup, KEYS)
        sys.exit('Verification failed, so the original file was restored. Nothing changed.')
    print(f'Removed. {len(left)} key(s) remain. Backup: {backup}')
    print(f'Undo if ever needed:  cp {backup} {KEYS}')
    print('Before closing this window, open a NEW terminal and run  ssh forkedbrain  to confirm you still get in.')


if __name__ == '__main__':
    main()
