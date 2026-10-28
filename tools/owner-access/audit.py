#!/usr/bin/env python3
"""Read-only access audit for the owner's server.

Lists who and what can reach the server and the services on it, so that a
former collaborator's access can be found and removed. It changes nothing
and never prints secret values (passwords, tokens, private keys or .env
values), so its output can be shared with a helper.

Run as root on the server:  python3 audit.py
"""
import gzip
import json
import os
import re
import shlex
import shutil
import subprocess
import urllib.request
from collections import defaultdict
from datetime import date, datetime
from pathlib import Path

HELPER = Path('/usr/local/sbin/mark-dashboard-release')
# Former collaborator identifiers to look for. Fingerprints are the public
# halves recorded in the repository's credential register.
FORMER = re.compile(r'darshan|ahirrao|growthforge|02darsh', re.I)
KNOWN_KEYS = {
    'SHA256:/Yjy3IfjFbrGFhNxqMv6T1xX0hiQ1k+lKbIrb4R2Wrs': "Darshan's operator key",
    'SHA256:NbVcUQpvqbg3Z5GiduyKXuWah31QLTJXPvdss/LOi4k': "Coolify's internal localhost key",
}
SECRET_NAME = re.compile(r'PASS|SECRET|TOKEN|KEY|HASH|SALT|COOKIE|CRED|PRIVATE|SESSION|AUTH_HEADER', re.I)
ACCESS_NAME = re.compile(r'EMAIL|ALLOW|OWNER|ADMIN|_USERS?$|USERNAME|ACTOR|HOME_CHANNEL|CHAT_ID', re.I)
LONG_VALUE = re.compile(r'[A-Za-z0-9+=_-]{28,}')
INLINE_SECRET = re.compile(
    r'((?:password|passwd|token|secret|api[_-]?key|authorization)[^=:\s]*\s*[=:]\s*)(?:(?:bearer|basic|token)\s+)?\S+', re.I)
KEY_TYPE = re.compile(
    r'(?:^|\s)((?:ssh-(?:ed25519|rsa|dss)|ecdsa-sha2-nistp\d+|sk-(?:ssh-ed25519|ecdsa-sha2-nistp256)@openssh\.com)'
    r'\s+[A-Za-z0-9+/=]+)(?:\s+(.*))?$')
LOGIN = re.compile(r'Accepted publickey for (\S+) from (\S+) port (\d+) \S+: (\S+) (SHA256:[A-Za-z0-9+/=]+)')

findings = []


def run(args, input=None, timeout=30, env=None):
    """Run a command without a terminal so nothing can prompt; never raises."""
    try:
        done = subprocess.run(args, input=input, capture_output=True, text=True, timeout=timeout,
                              start_new_session=True, env=env,
                              stdin=None if input is not None else subprocess.DEVNULL)
        return done.returncode, done.stdout, done.stderr
    except FileNotFoundError:
        return 127, '', 'not installed'
    except subprocess.TimeoutExpired:
        return 124, '', 'timed out'
    except OSError as error:
        return 126, '', type(error).__name__


def section(title):
    print(f'\n== {title}')


def say(text=''):
    print(f'  {text}')


def mask(text):
    """Hide anything that looks like a credential while keeping paths readable."""
    text = INLINE_SECRET.sub(lambda m: m.group(1) + '<hidden>', text)
    return LONG_VALUE.sub('<long value hidden>', text)


def redact_url(url):
    return re.sub(r'//[^/@\s]+@', '//<credentials hidden>@', url)


def note(where):
    """Record a place where a former collaborator identifier was found."""
    findings.append(where)


# ---------------------------------------------------------------- SSH


def fingerprint(text):
    code, out, _ = run(['ssh-keygen', '-lf', '/dev/stdin'], input=text + '\n')
    parts = out.split()
    if code or len(parts) < 3:
        return None, None
    return parts[1], parts[-1].strip('()')


def authorized_keys(path):
    """Parse an authorized_keys file into fingerprint, type, comment and options."""
    try:
        lines = Path(path).read_text(errors='replace').splitlines()
    except OSError:
        return None
    keys = []
    for number, raw in enumerate(lines, 1):
        line = raw.strip()
        if not line or line.startswith('#'):
            continue
        match = KEY_TYPE.search(line)
        options = line[:match.start(1)].strip() if match else ''
        options = re.sub(r'environment="[^"]*"', 'environment="<hidden>"', options)
        comment = (match.group(2) or '').strip() if match else ''
        fp, kind = fingerprint(line)
        keys.append({'line': number, 'fp': fp or 'unreadable', 'type': kind or '?',
                     'comment': comment, 'options': options})
    return keys


def parse_login_date(line):
    iso = re.match(r'(\d{4}-\d{2}-\d{2})', line)
    if iso:
        return iso.group(1)
    old = re.match(r'([A-Z][a-z]{2})\s+(\d{1,2})\s', line)
    if not old:
        return '?'
    today = date.today()
    try:
        day = datetime.strptime(f'{today.year} {old.group(1)} {old.group(2)}', '%Y %b %d').date()
    except ValueError:
        return '?'
    if day > today:
        day = day.replace(year=today.year - 1)
    return day.isoformat()


def login_events():
    """Successful key logins from the journal and auth.log, de-duplicated."""
    lines = []
    _, out, _ = run(['journalctl', '--no-pager', '-q', '-o', 'short-iso', '--since', '-120 days',
                     '-t', 'sshd', '-t', 'sshd-session'], timeout=120)
    lines += [line for line in out.splitlines() if 'Accepted publickey' in line]
    for path in sorted(Path('/var/log').glob('auth.log*')):
        try:
            opener = gzip.open if path.suffix == '.gz' else open
            with opener(path, 'rt', errors='replace') as handle:
                lines += [line for line in handle if 'Accepted publickey' in line]
        except OSError:
            pass
    events = {}
    for line in lines:
        match = LOGIN.search(line)
        if match:
            user, address, port, _, fp = match.groups()
            events.setdefault((address, port, fp), (parse_login_date(line), user, address, port, fp))
    return list(events.values())


def ssh_section():
    section('Server login settings')
    code, out, _ = run(['sshd', '-T'])
    wanted = ('port', 'permitrootlogin', 'passwordauthentication', 'kbdinteractiveauthentication',
              'pubkeyauthentication', 'authorizedkeysfile', 'authorizedkeyscommand', 'trustedusercakeys',
              'allowusers', 'allowgroups')
    key_files = ['.ssh/authorized_keys']
    for line in out.splitlines():
        name, _, value = line.partition(' ')
        if name in wanted:
            say(line)
        if name == 'authorizedkeysfile' and value.split():
            key_files = value.split()
    if code:
        say('(could not read effective SSH settings)')
    _, out, _ = run(['passwd', '-S', 'root'])
    parts = out.split()
    if len(parts) >= 3:
        state = {'P': 'set', 'L': 'locked', 'NP': 'empty'}.get(parts[1], parts[1])
        say(f'root password (console login only): {state}, last changed {parts[2]}')

    section('Keys that can log in as root')
    keys = []
    for relative in key_files:
        path = relative if relative.startswith('/') else f'/root/{relative}'
        path = path.replace('%h', '/root').replace('%u', 'root').replace('%%', '%')
        found = authorized_keys(path)
        if found is None:
            if relative == key_files[0]:
                say(f'{path}: not readable or missing')
            continue
        say(f'{path}: {len(found)} key(s)')
        keys += found
    labels = {}
    for key in keys:
        label = KNOWN_KEYS.get(key['fp'], '')
        labels[key['fp']] = label or key['comment'] or '(no comment)'
        flag = f'  <- {label}' if label else ''
        say(f"line {key['line']}: {key['fp']} {key['type']}  comment: {key['comment'] or '(none)'}{flag}")
        if key['options']:
            say(f"         only allowed to run: {key['options'][:200]}")
        if FORMER.search(key['comment']) or key['fp'] in KNOWN_KEYS and 'Darshan' in KNOWN_KEYS[key['fp']]:
            note(f"root SSH key on line {key['line']} ({key['fp']})")

    section('Recent root/SSH logins by key (last ~120 days, addresses not shown)')
    events = login_events()
    usage = defaultdict(lambda: {'count': 0, 'last': '', 'addresses': set(), 'users': set()})
    for when, user, address, _, fp in events:
        entry = usage[fp]
        entry['count'] += 1
        entry['last'] = max(entry['last'], when)
        entry['addresses'].add(address)
        entry['users'].add(user)
    if not usage:
        say('no key logins found in the logs')
    for fp, entry in sorted(usage.items(), key=lambda item: item[1]['last'], reverse=True):
        label = labels.get(fp) or KNOWN_KEYS.get(fp) or 'NOT in authorized_keys now'
        say(f"{fp} ({label}): {entry['count']} logins as {', '.join(sorted(entry['users']))}, "
            f"last {entry['last']}, from {len(entry['addresses'])} address(es)")
    connection = os.environ.get('SSH_CONNECTION', '').split()
    mine = None
    if len(connection) >= 2:
        mine = next((fp for _, _, address, port, fp in events
                     if address == connection[0] and port == connection[1]), None)
    say('this session logged in with: ' + (f'{mine} ({labels.get(mine, "unknown")})' if mine else 'not found in logs'))

    section('Other accounts that can log in')
    found = False
    try:
        passwd = Path('/etc/passwd').read_text().splitlines()
    except OSError:
        passwd = []
    for line in passwd:
        fields = line.split(':')
        if len(fields) < 7 or fields[0] == 'root':
            continue
        name, uid, home, shell = fields[0], fields[2], fields[5], fields[6]
        if shell.endswith(('nologin', 'false', 'sync', 'shutdown', 'halt')):
            continue
        found = True
        user_keys = authorized_keys(Path(home) / '.ssh/authorized_keys') or []
        say(f'{name} (uid {uid}, shell {shell}): {len(user_keys)} SSH key(s)')
        for key in user_keys:
            say(f"    {key['fp']} {key['comment']}")
        if FORMER.search(name):
            note(f'login account {name}')
    if not found:
        say('none besides root')
    _, out, _ = run(['getent', 'group', 'sudo', 'admin', 'wheel', 'docker'])
    for line in out.splitlines():
        fields = line.split(':')
        if len(fields) == 4:
            say(f"group {fields[0]} members: {fields[3] or '(none)'}")
            if FORMER.search(fields[3]):
                note(f'group {fields[0]}')


def private_keys(roots, depth=3):
    """Fingerprints of SSH private keys under the given folders (never contents)."""
    found = []
    for root in roots:
        root = Path(root)
        if not root.is_dir():
            continue
        base = len(root.parts)
        for folder, dirs, files in os.walk(root):
            if len(Path(folder).parts) - base >= depth:
                dirs[:] = []
            dirs[:] = [d for d in dirs if d not in ('node_modules', '.git', 'workspaces', 'runs', 'cache')]
            for name in files:
                if name.endswith('.pub') or name in ('authorized_keys', 'known_hosts', 'known_hosts.old', 'config'):
                    continue
                path = Path(folder) / name
                try:
                    if path.stat().st_size > 20000:
                        continue
                    with path.open('rb') as handle:
                        head = handle.read(80)
                except OSError:
                    continue
                if b'PRIVATE KEY' not in head:
                    continue
                code, out, _ = run(['ssh-keygen', '-lf', str(path)], timeout=10)
                parts = out.split()
                found.append((str(path), parts[1] if code == 0 and len(parts) > 2 else 'not an SSH key'))
    return found


# ---------------------------------------------------------------- GitHub


def release_store():
    """The release checkout used by the dashboard release helper."""
    try:
        text = HELPER.read_text()
    except OSError:
        return None
    base = re.search(r"^BASE = Path\('([^']+)'\)", text, re.M)
    repo = re.search(r"^REPO = BASE / '([^']+)'", text, re.M)
    return Path(base.group(1)) / repo.group(1) if base and repo else None


def github_identity(store, url):
    """Ask GitHub who the release credential belongs to, without showing it."""
    def git(*args, **kwargs):
        return run(['git', '-C', str(store), *args], **kwargs)
    if url.startswith(('git@', 'ssh://')):
        ssh_command = git('config', '--get', 'core.sshCommand')[1].strip() or 'ssh'
        args = shlex.split(ssh_command) + ['-T', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15',
                                           '-o', 'StrictHostKeyChecking=yes', 'git@github.com']
        code, out, err = run(args, timeout=40)
        text = (out + err).strip()
        match = re.search(r'Hi ([^!]+)!', text)
        if match:
            return f'GitHub recognises the release key as: {match.group(1)}'
        return 'GitHub SSH test did not identify the key: ' + mask(text.splitlines()[-1] if text else f'exit {code}')
    if url.startswith('https://'):
        env = dict(os.environ, GIT_TERMINAL_PROMPT='0', GIT_ASKPASS='/bin/false', SSH_ASKPASS='/bin/false')
        _, out, _ = git('credential', 'fill', input=f'url={url}\n\n', env=env, timeout=20)
        fields = dict(line.split('=', 1) for line in out.splitlines() if '=' in line)
        secret = fields.get('password', '')
        if not secret:
            return 'no stored HTTPS credential for GitHub (pushes would fail)'
        kind = ('fine-grained token' if secret.startswith('github_pat_') else
                'classic token' if secret.startswith('ghp_') else
                'app/OAuth token' if secret.startswith(('gho_', 'ghu_', 'ghs_')) else 'password or other token')
        try:
            request = urllib.request.Request('https://api.github.com/user', headers={
                'Authorization': f'token {secret}', 'User-Agent': 'owner-access-audit'})
            with urllib.request.urlopen(request, timeout=20) as response:
                login = json.load(response).get('login') or 'unknown'
        except Exception as error:  # report the failure type only
            login = f'unknown ({type(error).__name__})'
        secret = ''
        return f'releases push with a stored {kind} belonging to GitHub user: {login}'
    return 'release remote is neither SSH nor HTTPS'


def github_section():
    section('GitHub connection used by website releases')
    store = release_store()
    if not store or not (store / '.git').exists():
        say('release checkout not found (is the release helper installed?)')
        return

    def git(*args):
        return run(['git', '-C', str(store), *args])
    url = git('config', '--get', 'remote.origin.url')[1].strip()
    say('pulls and pushes: ' + redact_url(url))
    if FORMER.search(url):
        note('release checkout remote URL')
    push = git('config', '--get', 'remote.origin.pushurl')[1].strip()
    if push:
        say('separate push address: ' + redact_url(push))
    for key in ('user.name', 'user.email'):
        _, out, _ = git('config', '--show-origin', '--get', key)
        value = out.strip().replace('\t', ' -> ')
        say(f'commits are signed as {key}: {value or "(not set)"}')
        if FORMER.search(value):
            note(f'release commit {key}')
    _, out, _ = git('config', '--show-origin', '--get-regexp', r'^(credential\..*|core\.sshcommand|url\..*|http\..*)$')
    for line in out.splitlines():
        origin, _, rest = line.partition('\t')
        name, _, value = rest.partition(' ')
        if 'extraheader' in name.lower():
            value = '<hidden>'
        say(f'git setting {mask(redact_url(name))} = {mask(redact_url(value))} ({origin})')
    _, out, _ = git('log', '-1', '--format=%h by %an <%ae> on %cs')
    say('latest live commit: ' + out.strip())
    try:
        link = re.search(r"^URL = '([^']+)'", HELPER.read_text(), re.M)
    except OSError:
        link = None
    if link:
        say('release helper shows commit links on: ' + link.group(1))
        if FORMER.search(link.group(1)):
            note('release helper commit links')
    if url:
        say(github_identity(store, url))
    _, out, _ = run(['ssh', '-G', 'github.com'])
    for line in out.splitlines():
        name, _, value = line.partition(' ')
        if name == 'identityfile':
            path = Path(os.path.expanduser(value))
            if path.exists():
                code, keyline, _ = run(['ssh-keygen', '-lf', str(path)], timeout=10)
                parts = keyline.split()
                say(f'root key offered to github.com: {path} {parts[1] if code == 0 and len(parts) > 2 else ""}')

    section('SSH private keys stored on the server (fingerprints only)')
    roots = ['/root/.ssh', '/home']
    hermes_data = hermes_volume()
    if hermes_data:
        roots.append(hermes_data)
    keys = private_keys(roots)
    for path, fp in keys:
        say(f'{fp}  {path}')
    if not keys:
        say('none found')


# ---------------------------------------------------------------- Hermes / containers

HERMES_SNIPPET = r'''
import os, re, yaml
SECRET = re.compile(r"PASS|SECRET|TOKEN|KEY|HASH|SALT|COOKIE|CRED|PRIVATE|SESSION", re.I)
ACCESS = re.compile(r"ALLOW|OWNER|ADMIN|_USERS?$|HOME_CHANNEL|CHAT_ID", re.I)
FORMER = re.compile(r"darshan|ahirrao|growthforge|02darsh", re.I)
home = os.environ.get("HERMES_HOME", "/opt/data")
dotenv = {}
try:
    for line in open(os.path.join(home, ".env"), encoding="utf-8", errors="replace"):
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        name, value = line.split("=", 1)
        dotenv[name.replace("export ", "", 1).strip()] = value.strip().strip("\"'")
except OSError as error:
    print("  .env not readable:", type(error).__name__)
print("  credentials stored in .env (names only):", ", ".join(sorted(n for n in dotenv if SECRET.search(n))) or "none")
for source, items in (("container setting", os.environ), (".env", dotenv)):
    for name in sorted(items):
        if ACCESS.search(name) and not SECRET.search(name):
            print(f"  {source}: {name}={items[name]}")
        if FORMER.search(str(items[name])):
            print(f"  FOUND former-collaborator text in {source} variable {name} (value hidden)")
text = open(os.path.join(home, "config.yaml"), encoding="utf-8").read()
cfg = yaml.safe_load(text) or {}
telegram = (cfg.get("platforms") or {}).get("telegram") or {}
extra = telegram.get("extra") or {}
print("  telegram enabled:", telegram.get("enabled"))
for key in sorted(extra):
    if re.search(r"allow|admin|owner|home|chat|ignore_root", key, re.I) and key != "channel_prompts":
        print(f"  config telegram.extra.{key}: {extra[key]}")
if "home_channel" in telegram:
    print("  config telegram.home_channel:", telegram["home_channel"])
for chat, prompt in (extra.get("channel_prompts") or {}).items():
    body = str(prompt)
    print(f"  special instructions for chat {chat}: {len(body)} characters; owner-experience test prompt: {'owner-experience' in body}")
gateway = cfg.get("gateway") or {}
print("  allow all users:", gateway.get("allow_all_users", cfg.get("allow_all_users", False)))
auth = (cfg.get("dashboard") or {}).get("basic_auth") or {}
print("  dashboard login user:", auth.get("username") or "(none)", "| password set:", bool(auth.get("password_hash") or auth.get("password")))
lines = [str(n) for n, line in enumerate(text.splitlines(), 1) if FORMER.search(line)]
if lines:
    print("  FOUND former-collaborator text in config.yaml on lines:", ", ".join(lines))
'''


def containers():
    _, out, _ = run(['docker', 'ps', '-a', '--format', '{{.Names}}\t{{.Image}}\t{{.Status}}'])
    return [line.split('\t') for line in out.splitlines() if line.count('\t') == 2]


def hermes_name():
    return next((name for name, _, status in containers() if name.startswith('hermes-') and status.startswith('Up')), None)


def hermes_volume():
    name = hermes_name()
    if not name:
        return None
    _, out, _ = run(['docker', 'inspect', '--format', '{{range .Mounts}}{{.Destination}}={{.Source}}{{println}}{{end}}', name])
    for line in out.splitlines():
        destination, _, source = line.partition('=')
        if destination == '/opt/data' and source:
            return source
    return None


def hermes_section():
    section('Satoshi (Hermes): who may talk to it and where it reports')
    name = hermes_name()
    if not name:
        say('Hermes container not running')
        return
    for python in ('/opt/hermes/.venv/bin/python', 'python3'):
        code, out, err = run(['docker', 'exec', '-i', '-u', 'hermes', name, python, '-'], input=HERMES_SNIPPET, timeout=60)
        if code not in (126, 127):
            break
    if out.strip():
        print(out.rstrip())
    if code:
        last = err.strip().splitlines()[-1] if err.strip() else f'exit {code}'
        say(f'(Hermes settings check stopped early: {mask(last)[:200]})')
    if 'FOUND former-collaborator' in out:
        note('Hermes settings (see lines marked FOUND above)')
    code, out, err = run(['docker', 'exec', '-u', 'hermes', name, 'hermes', 'pairing', 'list'], timeout=60)
    say('approved pairings:')
    for line in (out or err).strip().splitlines()[:25]:
        say('  ' + mask(line.strip()))
    code, out, err = run(['docker', 'exec', '-u', 'hermes', name, 'hermes', 'cron', 'list'], timeout=60)
    say('scheduled Satoshi jobs:')
    for line in (out or err).strip().splitlines()[:30]:
        say('  ' + mask(line.rstrip())[:180])


def coolify_section():
    section('Coolify (server control panel) accounts')
    queries = [
        ('users', 'select id, name, email, created_at::date from users order by id'),
        ('team roles', 'select t.name, u.email, tu.role from team_user tu join users u on u.id = tu.user_id '
                       'join teams t on t.id = tu.team_id order by t.id, u.id'),
        ('pending invitations', 'select email, role, created_at::date from team_invitations order by id'),
        ('API tokens (names only)', 'select u.email, p.name, p.created_at::date, p.last_used_at::date '
                                    'from personal_access_tokens p left join users u on u.id = p.tokenable_id order by p.id'),
        ('stored SSH keys (names only)', "select id, name, coalesce(description, '') from private_keys order by id"),
    ]
    for label, sql in queries:
        code, out, err = run(['docker', 'exec', 'coolify-db', 'psql', '-U', 'coolify', '-d', 'coolify', '-AtF', ' | ', '-c', sql])
        say(f'{label}:')
        if code:
            reason = mask(err.strip().splitlines()[-1] if err.strip() else f'exit {code}')[:140]
            say(f'  (could not query: {reason})')
            if label == 'users':
                return
            continue
        rows = out.strip().splitlines()
        for row in rows or ['(none)']:
            say('  ' + row)
            if FORMER.search(row):
                note(f'Coolify {label}')


def container_section():
    section('Containers on the server')
    listed = containers()
    for name, image, status in listed:
        say(f'{name}  [{image}]  {status}')
    section('Access-related container settings (no secrets)')
    shown = False
    for name, _, status in listed:
        if not status.startswith('Up'):
            continue
        _, out, _ = run(['docker', 'inspect', '--format', '{{range .Config.Env}}{{println .}}{{end}}', name])
        for line in out.splitlines():
            variable, _, value = line.partition('=')
            if FORMER.search(value):
                note(f'container {name} setting {variable}')
                say(f'{name}: {variable} contains former-collaborator text (value hidden)'
                    if SECRET_NAME.search(variable) else f'{name}: {variable}={mask(value)}')
                shown = True
            elif ACCESS_NAME.search(variable) and not SECRET_NAME.search(variable):
                say(f'{name}: {variable}={mask(value)}')
                shown = True
    if not shown:
        say('none')


# ---------------------------------------------------------------- tunnel, network, schedules


def tunnel_section():
    section('Cloudflare tunnel on this server')
    _, out, _ = run(['systemctl', 'is-active', 'cloudflared'])
    say('cloudflared service: ' + (out.strip() or 'not found'))
    config = Path('/etc/cloudflared/config.yml')
    if config.exists():
        for line in config.read_text(errors='replace').splitlines():
            stripped = line.strip().lstrip('-').strip()
            if stripped.startswith(('tunnel:', 'credentials-file:', 'hostname:')):
                say(stripped)
    for folder in ('/etc/cloudflared', '/root/.cloudflared', '/usr/local/etc/cloudflared'):
        path = Path(folder)
        if path.is_dir():
            say(f'{folder} holds: ' + (', '.join(sorted(item.name for item in path.iterdir())) or 'nothing'))
    candidates = ['/root/.cloudflared/cert.pem', '/etc/cloudflared/cert.pem', '/usr/local/etc/cloudflared/cert.pem']
    candidates += [str(p) for p in Path('/home').glob('*/.cloudflared/cert.pem')]
    certificates = [path for path in candidates if Path(path).exists()]
    say('account-wide cloudflared login certificate on server: ' + (', '.join(certificates) or 'none (good)'))


def network_section():
    section('Ports open to the internet')
    _, out, _ = run(['ss', '-ltnpH'])
    open_ports = []
    for line in out.splitlines():
        parts = line.split()
        if len(parts) < 4:
            continue
        local = parts[3]
        if local.startswith(('127.', '[::1]', '::1', '[::ffff:127.')):
            continue
        process = re.search(r'users:\(\("([^"]+)"', line)
        open_ports.append(f'{local} ({process.group(1) if process else "?"})')
    for item in sorted(set(open_ports)):
        say(item)
    _, out, _ = run(['ufw', 'status'])
    if out.strip():
        say('firewall: ' + out.strip().splitlines()[0])
    _, out, _ = run(['ss', '-tnpH', 'state', 'established', '(', 'dport', '=', ':22', ')'])
    outbound = [re.search(r'users:\(\("([^"]+)"', line) for line in out.splitlines()]
    say('outgoing SSH connections from this server: ' +
        (', '.join(sorted({m.group(1) for m in outbound if m})) or 'none'))
    _, out, _ = run(['ss', '-tnH', 'state', 'established', '(', 'sport', '=', ':22', ')'])
    say(f'SSH sessions connected right now: {len(out.strip().splitlines()) if out.strip() else 0}')
    for tool in ('tailscale', 'wg', 'zerotier-cli', 'teamviewer', 'anydesk', 'rustdesk', 'ngrok', 'autossh', 'frpc'):
        if shutil.which(tool):
            say(f'remote-access tool installed: {tool}')
            if tool == 'tailscale':
                _, status, _ = run(['tailscale', 'status'])
                for line in status.strip().splitlines()[:12]:
                    say('  ' + line)
            if tool == 'wg':
                _, peers, _ = run(['wg', 'show', 'all', 'peers'])
                say(f'  WireGuard peers: {len(peers.split())}')


def schedule_section():
    section('Scheduled jobs on the server')
    _, out, _ = run(['crontab', '-l'])
    lines = [line for line in out.splitlines() if line.strip() and not line.lstrip().startswith('#')]
    say('root crontab: ' + ('none' if not lines else f'{len(lines)} line(s)'))
    for line in lines:
        say('  ' + mask(line)[:200])
        if FORMER.search(line):
            note('root crontab')
    for path in sorted(Path('/etc/cron.d').glob('*')):
        if path.name.startswith('.') or not path.is_file():
            continue
        entries = [line for line in path.read_text(errors='replace').splitlines()
                   if line.strip() and not line.lstrip().startswith('#') and not re.match(r'^\s*[A-Z_]+=', line)]
        for line in entries:
            say(f'/etc/cron.d/{path.name}: ' + mask(line)[:180])
            if FORMER.search(line):
                note(f'/etc/cron.d/{path.name}')
    _, out, _ = run(['systemctl', 'list-timers', '--all', '--no-legend', '--no-pager'])
    timers = sorted({line.split()[-2] for line in out.splitlines() if len(line.split()) >= 2})
    say('systemd timers: ' + (', '.join(timers) or 'none'))
    _, out, _ = run(['systemctl', 'list-units', '--type=service', '--state=running', '--no-legend', '--no-pager', '--plain'])
    services = sorted(line.split()[0] for line in out.splitlines() if line.split())
    say('running services: ' + ', '.join(services))


def text_search_section():
    section('Other server files mentioning the former collaborator')
    files = [Path(p) for p in ('/root/.gitconfig', '/root/.ssh/config', '/etc/passwd', '/etc/group',
                               '/etc/cloudflared/config.yml', '/root/.bashrc', '/root/.profile')]
    files += list(Path('/etc/sudoers.d').glob('*')) + list(Path('/etc/ssh/sshd_config.d').glob('*'))
    store = release_store()
    if store:
        files.append(store / '.git/config')
    hits = 0
    for path in files:
        try:
            lines = path.read_text(errors='replace').splitlines()
        except OSError:
            continue
        numbers = [str(n) for n, line in enumerate(lines, 1) if FORMER.search(line)]
        if numbers:
            hits += 1
            say(f'{path}: lines {", ".join(numbers)}')
            note(str(path))
    if not hits:
        say('none of the checked files')


def main():
    print(f'Owner access audit — {datetime.now().astimezone():%Y-%m-%d %H:%M %Z} — read-only, no secret values printed')
    if os.geteuid() != 0:
        print('Run this as root on the server.')
        return
    for part in (ssh_section, github_section, hermes_section, coolify_section, container_section,
                 tunnel_section, network_section, schedule_section, text_search_section):
        try:
            part()
        except Exception as error:  # keep going; one broken section must not hide the rest
            say(f'(this check failed: {type(error).__name__})')
    section('Summary: places the former collaborator still appears')
    for where in dict.fromkeys(findings):
        say('- ' + where)
    if not findings:
        say('none found by this audit')
    print('\nDone. Nothing was changed. Copy everything from "Owner access audit" to here and paste it back.')


if __name__ == '__main__':
    main()
