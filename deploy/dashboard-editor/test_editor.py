"""No-provider-call checks for the editor's publication boundary."""
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import types
import unittest
from unittest.mock import patch
import httpx

spec = importlib.util.spec_from_file_location('editor', Path(__file__).with_name('dashboard-edit.py'))
editor = importlib.util.module_from_spec(spec); spec.loader.exec_module(editor)


class PublicationBoundary(unittest.TestCase):
    def run_case(self, *, model='gpt-6-astra', effort='high', status='ready', edit=True, publish=True):
        previous = Path.cwd()
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            workspace = root / 'workspaces' / ('a' * 32) / 'dashboard'; workspace.mkdir(parents=True)
            (workspace / 'page.tsx').write_text('before')
            (root / 'EDITOR.md').write_text('test instructions')
            run_id = 'a' * 32
            folder = root / 'runs' / run_id; folder.mkdir(parents=True)
            (folder / 'request.json').write_text(json.dumps({'request': 'test', 'publish': publish}))
            fake_agent = types.ModuleType('run_agent')
            class Agent:
                def __init__(self, **kwargs):
                    assert kwargs['model'] == 'gpt-6-astra'
                    assert kwargs['reasoning_config']['effort'] == 'high'
                    assert kwargs['fallback_model'] == []
                def run_conversation(self, request):
                    with httpx.Client() as client:
                        client.send(httpx.Request('POST', 'https://api.openai.com/v1/responses', json={'model': model, 'reasoning': {'effort': effort}}))
                    if edit: (workspace / 'page.tsx').write_text('after')
                    return {'completed': True, 'final_response': json.dumps({'status': status, 'summary': 'test result', 'checks': []})}
                def close(self): pass
            fake_agent.AIAgent = Agent
            runtime = types.ModuleType('hermes_cli.runtime_provider')
            runtime.resolve_runtime_provider = lambda **kwargs: {'provider': 'openai-api', 'api_key': 'fixture-not-a-key', 'base_url': 'https://api.openai.com/v1'}
            constants = types.ModuleType('hermes_constants')
            constants.parse_reasoning_effort = lambda effort: {'enabled': True, 'effort': effort}
            try:
                with patch.object(editor, 'ROOT', root), patch.object(editor, 'WORKSPACE', workspace), patch.dict('sys.modules', {'run_agent': fake_agent, 'hermes_cli.runtime_provider': runtime, 'hermes_constants': constants}), patch.object(httpx.Client, 'send', return_value=httpx.Response(200)), patch.object(editor, 'release', return_value={'status': 'deployed'}) as release:
                    editor.worker(run_id)
                    result = json.loads((folder / 'status.json').read_text())
                    return result, [call for call in release.call_args_list if call.args[1] != 'prepare']
            finally:
                os.chdir(previous)

    def test_wrong_model_never_reaches_release(self):
        result, calls = self.run_case(model='gpt-5.6-sol')
        self.assertEqual(result['status'], 'failed'); self.assertFalse(calls)

    def test_wrong_reasoning_never_reaches_release(self):
        result, calls = self.run_case(effort='low')
        self.assertEqual(result['status'], 'failed'); self.assertFalse(calls)

    def test_blocked_partial_work_is_not_published(self):
        result, calls = self.run_case(status='blocked')
        self.assertEqual(result['status'], 'blocked'); self.assertFalse(calls)

    def test_unchanged_work_is_not_published(self):
        result, calls = self.run_case(edit=False)
        self.assertEqual(result['status'], 'unchanged'); self.assertFalse(calls)

    def test_verified_completed_edit_uses_release_gate(self):
        result, calls = self.run_case()
        self.assertEqual(result['status'], 'deployed')
        self.assertEqual(result['changed_files'], ['page.tsx'])
        self.assertEqual(calls[0].args, ('a' * 32, 'deploy'))

    def test_draft_does_not_deploy(self):
        result, calls = self.run_case(publish=False)
        self.assertEqual(result['status'], 'checked')
        self.assertEqual(calls[0].args, ('a' * 32, 'check'))


if __name__ == '__main__': unittest.main()
