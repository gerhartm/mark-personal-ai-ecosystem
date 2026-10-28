"""Read-only check: which model and reasoning effort Hermes uses for the dashboard's calls.

Run inside the Hermes container as the hermes user, for example:
    docker exec -i -u hermes <hermes container> /opt/hermes/.venv/bin/python - < hermes-model-check.py

The Intel Desk asks Hermes for one-off answers (llm.oneshot) with a task name
(today "title_generation"). Hermes routes a task through its auxiliary settings,
auxiliary.<task> in config.yaml. This prints the configured main model, any
auxiliary settings, and what the installed Hermes code supports, so the right
settings can be chosen. It changes nothing, makes no model call and prints no
keys or passwords.
"""
import importlib
import inspect
import os
import re
import subprocess
from pathlib import Path

ROUTE_KEYS = ('provider', 'model', 'reasoning_effort', 'timeout', 'prefer_fast_model', 'max_tokens')
TASKS = ('title_generation', 'crypto_topics', 'crypto_analysis')


def show(label, value):
    print(f'{label}: {value}')


def source(module):
    try:
        loaded = importlib.import_module(module)
        return loaded, Path(loaded.__file__).read_text()
    except Exception as error:  # report the type only
        return None, f'unavailable ({type(error).__name__})'


def lines(text, pattern, limit=3):
    if not isinstance(text, str) or text.startswith('unavailable'):
        return text
    found = [f'{number}: {line.strip()[:160]}' for number, line in enumerate(text.splitlines(), 1) if re.search(pattern, line)]
    return found[:limit] or 'not found'


print('== Hermes')
try:
    done = subprocess.run(['hermes', '--version'], capture_output=True, text=True, timeout=60)
    show('version', ((done.stdout or done.stderr).strip().splitlines() or ['unknown'])[0])
except Exception as error:
    show('version', f'unknown ({type(error).__name__})')

print('\n== Settings in config.yaml')
try:
    import yaml
    home = os.environ.get('HERMES_HOME', '/opt/data')
    config = yaml.safe_load(Path(home, 'config.yaml').read_text()) or {}
    model = config.get('model') or {}
    show('main model', {key: model.get(key) for key in ('default', 'provider') if key in model})
    show('agent reasoning_effort', (config.get('agent') or {}).get('reasoning_effort'))
    auxiliary = config.get('auxiliary') or {}
    if not auxiliary:
        show('auxiliary', 'nothing set (every task uses its defaults)')
    for task, settings in auxiliary.items():
        show(f'auxiliary.{task}', {key: settings.get(key) for key in ROUTE_KEYS if key in settings} if isinstance(settings, dict) else settings)
except Exception as error:
    show('config', f'unreadable ({type(error).__name__})')

print('\n== Installed code')
for module in ('gateway.session_llm_oneshot', 'tui_gateway.methods_session'):
    loaded, text = source(module)
    if loaded:
        show(f'{module} accepts', lines(text, r'_FIELDS\s*=|params\.get\(.(task|model|reasoning)', 4))
oneshot, text = source('agent.oneshot')
if oneshot:
    try:
        show('run_oneshot signature', str(inspect.signature(oneshot.run_oneshot))[:300])
    except Exception as error:
        show('run_oneshot signature', f'unknown ({type(error).__name__})')
    show('run_oneshot passes', lines(text, r'timeout=|task=', 4))
else:
    show('agent.oneshot', text)
client, text = source('agent.auxiliary_client')
show('per-task reasoning_effort support', lines(text, r'reasoning_effort', 4) if client else text)
show('per-task timeout support', lines(text, r'auxiliary\.<task>\.timeout|def _task_timeout|_get_task_timeout', 3) if client else text)
show('auto route', lines(text, r'def _resolve_auto_route|main provider \+ main model|"auto" means', 3) if client else text)
show('no-retry-on-timeout tasks', lines(text, r'_TIMEOUT_NO_RETRY_TASKS\s*=', 1) if client else text)
show('fast-model tasks', lines(text, r'_FAST_MODEL_TASKS\s*[:=]', 1) if client else text)
try:
    from hermes_cli.config import DEFAULT_CONFIG
    default = (DEFAULT_CONFIG.get('auxiliary') or {}).get('title_generation') or {}
    show('default auxiliary.title_generation', {key: default.get(key) for key in ROUTE_KEYS if key in default})
except Exception as error:
    show('default auxiliary.title_generation', f'unavailable ({type(error).__name__})')

print('\n== Where each task would go (no model call)')
if client:
    for task in TASKS:
        try:
            route = client._resolve_task_provider_model(task)
            show(task, {'provider': route[0], 'model': route[1]})
        except Exception as error:
            show(task, f'unknown ({type(error).__name__}: {str(error)[:100]})')
    for name in ('_main_route_target',):
        if hasattr(client, name):
            try:
                target = getattr(client, name)({}, 'title_generation')
                show('"auto" resolves to', {'provider': target[0], 'model': target[1]})
            except Exception as error:
                show('"auto" resolves to', f'unknown ({type(error).__name__})')
    if hasattr(client, '_get_aux_model_for_provider'):
        try:
            show('cheap model for openai-api', client._get_aux_model_for_provider('openai-api') or '(none: main model)')
        except Exception as error:
            show('cheap model for openai-api', f'unknown ({type(error).__name__})')
print('\nDone. Nothing was changed.')
