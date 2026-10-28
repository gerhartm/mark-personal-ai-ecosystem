#!/usr/bin/env python3
"""Change the Intel Desk login password and sign every session out.

Run as root on the server:   python3 intel-desk-login.py
Undo (puts the old files back):  python3 intel-desk-login.py --restore <backup folder>

Asks for the new password twice without showing it, stores only its scrypt
verifier, replaces the session-signing secret so every existing session ends
(yours too), and checks that the running app accepts the new password. The
files are rewritten in place, so no restart is needed. Nothing secret is
printed.
"""
import base64
import datetime
import getpass
import hashlib
import json
import os
import secrets
import shutil
import subprocess
import sys
from pathlib import Path

CONTAINER = 'crypto-dashboard'
PASSWORD_MOUNT = '/run/secrets/crypto-dashboard-login-password'
SECRET_MOUNT = '/run/secrets/crypto-dashboard-session-secret'
BACKUPS = Path('/root/owner-access-backups')
CHECK = ("import { verifyPassword } from '/app/server/dist/request-auth.js';"
         "let s = ''; process.stdin.on('data', (d) => { s += d; });"
         "process.stdin.on('end', async () => { process.stdout.write(String(await verifyPassword(s))); });")


def run(args, input=None):
    return subprocess.run(args, input=input, capture_output=True, text=True, timeout=60,
                          stdin=None if input is not None else subprocess.DEVNULL)


def mounted_files():
    done = run(['docker', 'inspect', CONTAINER])
    if done.returncode:
        sys.exit(f'The {CONTAINER} container was not found. Nothing changed.')
    mounts = {m['Destination']: m['Source'] for m in json.loads(done.stdout)[0].get('Mounts', [])}
    try:
        return Path(mounts[PASSWORD_MOUNT]), Path(mounts[SECRET_MOUNT])
    except KeyError:
        sys.exit('Could not find the login files mounted into the Intel Desk. Nothing changed.')


def verifier(password):
    salt = os.urandom(16)
    key = hashlib.scrypt(password.encode(), salt=salt, n=16384, r=8, p=1, maxmem=64 * 1024 * 1024, dklen=32)

    def encode(value):
        return base64.urlsafe_b64encode(value).rstrip(b'=').decode()
    return f'scrypt$16384$8$1${encode(salt)}${encode(key)}'


def rewrite(path, text):
    """Replace the contents but keep the same file, owner and mode (the container mounts this file)."""
    with open(path, 'r+') as handle:
        handle.seek(0)
        handle.write(text)
        handle.truncate()
        handle.flush()
        os.fsync(handle.fileno())


def app_accepts(password):
    done = run(['docker', 'exec', '-i', CONTAINER, 'node', '--input-type=module', '-e', CHECK], input=password)
    return done.stdout.strip() == 'true'


def restore(folder):
    password_file, secret_file = mounted_files()
    folder = Path(folder)
    for saved, live in ((folder / 'login-password', password_file), (folder / 'session-secret', secret_file)):
        rewrite(live, saved.read_text())
    print('Old login files restored. Log in with the previous password.')


def main():
    if os.geteuid() != 0:
        sys.exit('Run this as root.')
    if len(sys.argv) == 3 and sys.argv[1] == '--restore':
        restore(sys.argv[2])
        return
    password_file, secret_file = mounted_files()
    print('Choose the new Intel Desk password (at least 12 characters). Typing is hidden.')
    first = getpass.getpass('New password: ')
    if len(first) < 12:
        sys.exit('Too short; nothing changed.')
    if getpass.getpass('Same password again: ') != first:
        sys.exit("The two entries didn't match; nothing changed.")
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    folder = BACKUPS / f'intel-desk-login-{stamp}'
    folder.mkdir(parents=True, mode=0o700)
    os.chmod(BACKUPS, 0o700)
    shutil.copy2(password_file, folder / 'login-password')
    shutil.copy2(secret_file, folder / 'session-secret')
    for item in folder.iterdir():
        os.chmod(item, 0o600)
    rewrite(password_file, verifier(first) + '\n')
    rewrite(secret_file, secrets.token_urlsafe(48) + '\n')
    if not app_accepts(first):
        restore(folder)
        sys.exit('The Intel Desk did not accept the new password, so the old one was put back. Nothing changed.')
    first = ''
    print('Done. The Intel Desk now uses your new password and every session was signed out.')
    print('Log in again at https://crypto.forkedbrain.fyi with the new password.')
    print(f'Undo if ever needed:  python3 {Path(sys.argv[0]).name} --restore {folder}')


if __name__ == '__main__':
    main()
