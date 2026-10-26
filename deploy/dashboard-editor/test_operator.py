"""Operator releases and the shared release path, against a disposable Git remote.

Docker, the health probe and the running container are simulated; Git, tar, SQLite
backups and the release ledger are real.
"""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import re
import sqlite3
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('release', Path(__file__).with_name('mark-dashboard-release.py'))
r = importlib.util.module_from_spec(spec); spec.loader.exec_module(r)

CHECKS = 'FROM scratch\n'
COMPOSE = 'services:\n  crypto-dashboard:\n    image: mark-crypto-dashboard:baseline\n    restart: unless-stopped\n'


def sh(*args, cwd=None):
    return subprocess.run(args, check=True, text=True, capture_output=True, cwd=cwd).stdout.strip()


class OperatorRelease(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.root = Path(self.temp.name)
        self.remote = self.root / 'remote.git'; self.repo = self.root / 'repo'; self.dev = self.root / 'dev'
        self.base = self.root / 'base'; self.editor = self.root / 'editor'
        sh('git', 'init', '--bare', '-b', 'main', str(self.remote))
        sh('git', 'clone', str(self.remote), str(self.repo))
        for directory in (self.base / 'data', self.base / 'deploy', self.editor / 'test-support', self.editor / 'workspace'):
            directory.mkdir(parents=True)
        (self.base / 'deploy/docker-compose.production.yml').write_text(COMPOSE)
        with sqlite3.connect(self.base / 'data/crypto-intelligence.db') as db:
            db.execute('CREATE TABLE sources (id TEXT)'); db.execute("INSERT INTO sources VALUES ('kept')")
        (self.editor / 'test-support/baseline.db').write_text('synthetic baseline')
        (self.editor / 'Dockerfile.checks').write_text(CHECKS)
        (self.editor / 'Dockerfile.checks.dockerignore').write_text('node_modules\n')
        self.patches = [
            patch.object(r, 'REPO', self.repo), patch.object(r, 'HISTORY', self.root / 'history.json'),
            patch.object(r, 'BASE', self.base), patch.object(r, 'COMPOSE', self.base / 'deploy/docker-compose.production.yml'),
            patch.object(r, 'EDITOR', self.editor), patch.object(r, 'BACKUPS', self.root / 'backups'),
            patch.object(r, 'LOCK', str(self.root / 'release.lock')),
            patch.object(r, 'cmd', self.fake_cmd), patch.object(r, 'output', self.fake_output),
            patch.object(r, 'healthy', lambda: self.health),
        ]
        for p in self.patches: p.start()
        self.docker = []; self.health = True; self.live_image = 'mark-crypto-dashboard:baseline'
        r.git('config', 'user.name', 'Fixture'); r.git('config', 'user.email', 'fixture@example.invalid')
        r.git('checkout', '-b', r.BRANCH)
        (self.repo / 'dashboard/server/src').mkdir(parents=True)
        (self.repo / 'dashboard/page.tsx').write_text('original')
        (self.repo / 'dashboard/server/src/db.ts').write_text('schema v1')
        (self.repo / 'dashboard/Dockerfile.checks').write_text(CHECKS)
        (self.repo / 'dashboard/Dockerfile.checks.dockerignore').write_text('node_modules\n')
        (self.repo / 'README.md').write_text('docs')
        r.git('add', '.'); r.git('commit', '-m', 'Baseline fixture')
        self.baseline = r.git('rev-parse', 'HEAD'); r.push_verified(self.baseline)
        r.save(r.HISTORY, {'current_commit': self.baseline, 'releases': [{'status': 'baseline', 'commit': self.baseline}]})
        sh('git', 'clone', str(self.remote), str(self.dev))
        sh('git', 'config', 'user.name', 'Dev', cwd=self.dev); sh('git', 'config', 'user.email', 'dev@example.invalid', cwd=self.dev)

    def tearDown(self):
        for p in reversed(self.patches): p.stop()
        self.temp.cleanup()

    # Simulated Docker: record builds and runs; `compose up` swaps the running image.
    def fake_cmd(self, args, **kwargs):
        if args[0] == 'docker':
            self.docker.append(args)
            if args[1] == 'compose':
                self.live_image = re.search(r'image: (\S+)', r.COMPOSE.read_text()).group(1)
            return subprocess.CompletedProcess(args, 0)
        return subprocess.run(args, check=True, text=True, **kwargs)

    def fake_output(self, args, **kwargs):
        if args[0] == 'docker':
            return self.live_image
        return subprocess.check_output(args, text=True, **kwargs).strip()

    def branch(self, name, files, base='origin/satoshi-dashboard'):
        sh('git', 'fetch', 'origin', cwd=self.dev)
        sh('git', 'checkout', '-B', name, base, cwd=self.dev)
        for path, text in files.items():
            target = self.dev / path; target.parent.mkdir(parents=True, exist_ok=True); target.write_text(text)
        sh('git', 'add', '-A', cwd=self.dev); sh('git', 'commit', '-m', f'Change on {name}', cwd=self.dev)
        sh('git', 'push', '-f', 'origin', f'HEAD:refs/heads/{name}', cwd=self.dev)
        return sh('git', 'rev-parse', 'HEAD', cwd=self.dev)

    def args(self, command, **values):
        defaults = {'branch': None, 'commit': None, 'summary': '', 'allow_schema_change': False, 'yes': False, 'to': 'previous'}
        defaults.update(values)
        return argparse.Namespace(command=command, **defaults)

    def remote_tip(self, branch=r.BRANCH):
        return sh('git', '--git-dir', str(self.remote), 'rev-parse', f'refs/heads/{branch}')

    def tree(self, commit):
        return sh('git', '--git-dir', str(self.remote), 'rev-parse', f'{commit}:dashboard')

    def deploy(self, commit, branch, answer='deploy'):
        with patch.dict(os.environ, {'TMUX': 'fixture'}):
            return r.operator(self.args('deploy', branch=branch, commit=commit, summary='Layout pass'), ask=lambda prompt: answer)

    def test_check_builds_and_tests_without_deploying(self):
        commit = self.branch('ux/layout-pass-1', {'dashboard/page.tsx': 'new layout'})
        result = r.operator(self.args('check', branch='ux/layout-pass-1', commit=commit))
        self.assertEqual(result['status'], 'checked'); self.assertFalse(result['deployed'])
        self.assertEqual(result['changed_files'], ['dashboard/page.tsx'])
        self.assertEqual([a[1] for a in self.docker], ['build', 'run', 'build'])
        self.assertIn('--network', self.docker[1]); self.assertIn('none', self.docker[1])
        self.assertEqual(self.remote_tip(), self.baseline)
        self.assertEqual(json.loads(r.HISTORY.read_text())['current_commit'], self.baseline)
        self.assertEqual(r.COMPOSE.read_text(), COMPOSE)
        self.assertFalse(any((self.base / 'releases').iterdir()))

    def test_deploy_publishes_the_branch_contents_with_backup_and_ledger(self):
        commit = self.branch('ux/layout-pass-1', {'dashboard/page.tsx': 'new layout'})
        receipt = self.deploy(commit, 'ux/layout-pass-1')
        self.assertEqual(receipt['status'], 'deployed')
        self.assertEqual(receipt['source_commit'], commit); self.assertEqual(receipt['source_branch'], 'ux/layout-pass-1')
        self.assertEqual(self.remote_tip(), receipt['commit'])
        self.assertEqual(self.tree(receipt['commit']), self.tree(commit))
        self.assertIn('Operator release ux/layout-pass-1@', sh('git', '--git-dir', str(self.remote), 'log', '-1', '--format=%s', receipt['commit']))
        self.assertEqual(self.live_image, receipt['image']); self.assertIn(receipt['image'], r.COMPOSE.read_text())
        history = json.loads(r.HISTORY.read_text())
        self.assertEqual(history['current_commit'], receipt['commit']); self.assertEqual(history['releases'][-1]['run_id'], receipt['run_id'])
        backup = Path(receipt['backup'])
        self.assertEqual(backup.name, f"dashboard-operator-{receipt['run_id']}")
        with sqlite3.connect(backup / 'database-before.db') as db:
            self.assertEqual(db.execute('SELECT id FROM sources').fetchall(), [('kept',)])
        self.assertEqual((backup / 'compose-before.yml').read_text(), COMPOSE)
        self.assertEqual((self.editor / 'workspace/dashboard/page.tsx').read_text(), 'new layout')

    def test_wrong_confirmation_changes_nothing(self):
        commit = self.branch('ux/layout-pass-1', {'dashboard/page.tsx': 'new layout'})
        with self.assertRaisesRegex(RuntimeError, 'Cancelled'):
            self.deploy(commit, 'ux/layout-pass-1', answer='yes please')
        self.assertEqual(self.docker, []); self.assertEqual(self.remote_tip(), self.baseline)

    def test_deploy_and_revert_require_tmux(self):
        commit = self.branch('ux/layout-pass-1', {'dashboard/page.tsx': 'new layout'})
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaisesRegex(RuntimeError, 'tmux'):
                r.operator(self.args('deploy', branch='ux/layout-pass-1', commit=commit, yes=True))
            with self.assertRaisesRegex(RuntimeError, 'tmux'):
                r.operator(self.args('revert', yes=True))
        self.assertEqual(self.docker, [])

    def test_branch_must_be_based_on_the_published_release(self):
        sh('git', 'checkout', '-q', '--orphan', 'ux/unrelated', cwd=self.dev)
        sh('git', 'rm', '-rfq', '--ignore-unmatch', '.', cwd=self.dev)
        (self.dev / 'dashboard').mkdir(exist_ok=True); (self.dev / 'dashboard/page.tsx').write_text('elsewhere')
        sh('git', 'add', '-A', cwd=self.dev); sh('git', 'commit', '-m', 'Unrelated history', cwd=self.dev)
        sh('git', 'push', 'origin', 'HEAD:refs/heads/ux/unrelated', cwd=self.dev)
        commit = sh('git', 'rev-parse', 'HEAD', cwd=self.dev)
        with self.assertRaisesRegex(RuntimeError, 'not based on the published dashboard'):
            r.operator(self.args('check', branch='ux/unrelated', commit=commit))

    def test_changes_outside_dashboard_are_refused(self):
        commit = self.branch('ux/docs-too', {'dashboard/page.tsx': 'new', 'README.md': 'changed'})
        with self.assertRaisesRegex(RuntimeError, 'only change dashboard/'):
            r.operator(self.args('check', branch='ux/docs-too', commit=commit))

    def test_commit_must_be_the_branch_tip(self):
        first = self.branch('ux/moving', {'dashboard/page.tsx': 'one'})
        sh('git', 'commit', '--allow-empty', '-m', 'later', cwd=self.dev); sh('git', 'push', 'origin', 'HEAD:refs/heads/ux/moving', cwd=self.dev)
        with self.assertRaisesRegex(RuntimeError, 'confirm which commit'):
            r.operator(self.args('check', branch='ux/moving', commit=first))

    def test_branch_names_and_commit_ids_are_validated(self):
        for branch in ('main', 'satoshi-dashboard', 'feature/x', 'ux/../x', 'ux/a:b', 'UX/caps'):
            with self.assertRaisesRegex(RuntimeError, 'must be named'):
                r.operator(self.args('check', branch=branch, commit='a' * 40))
        with self.assertRaisesRegex(RuntimeError, '40-character'):
            r.operator(self.args('check', branch='ux/ok', commit='abc123'))
        with self.assertRaisesRegex(RuntimeError, 'Could not fetch'):
            r.operator(self.args('check', branch='ux/missing', commit='a' * 40))

    def test_schema_change_needs_explicit_review_flag(self):
        commit = self.branch('ux/schema', {'dashboard/server/src/db.ts': 'schema v2'})
        with self.assertRaisesRegex(RuntimeError, 'allow-schema-change'):
            r.operator(self.args('check', branch='ux/schema', commit=commit))
        self.assertEqual(r.operator(self.args('check', branch='ux/schema', commit=commit, allow_schema_change=True))['status'], 'checked')

    def test_failed_health_check_restores_the_previous_dashboard(self):
        commit = self.branch('ux/broken', {'dashboard/page.tsx': 'broken'})
        self.health = False
        with patch.object(r, 'healthy', side_effect=[False, True]):
            with self.assertRaisesRegex(RuntimeError, 'previous dashboard preserved'):
                self.deploy(commit, 'ux/broken')
        self.assertEqual(r.COMPOSE.read_text(), COMPOSE); self.assertEqual(self.live_image, 'mark-crypto-dashboard:baseline')
        history = json.loads(r.HISTORY.read_text())
        self.assertEqual(history['releases'][-1]['status'], 'recovered')
        self.assertEqual(self.remote_tip(), history['current_commit'])
        self.assertEqual(self.tree(history['current_commit']), self.tree(self.baseline))

    def test_revert_restores_the_previous_published_version(self):
        commit = self.branch('ux/layout-pass-1', {'dashboard/page.tsx': 'new layout'})
        self.deploy(commit, 'ux/layout-pass-1')
        with patch.dict(os.environ, {'TMUX': 'fixture'}):
            receipt = r.operator(self.args('revert', to='previous'), ask=lambda prompt: 'restore')
        self.assertEqual(receipt['restored_from'], self.baseline)
        self.assertEqual(self.tree(receipt['commit']), self.tree(self.baseline))
        self.assertEqual(self.remote_tip(), receipt['commit'])

    def test_history_reports_the_live_commit(self):
        result = r.operator(self.args('history'))
        self.assertEqual(result['current_commit'], self.baseline); self.assertEqual(result['recent_releases'][-1]['status'], 'baseline')

    def test_restricted_key_cannot_reach_operator_commands(self):
        with patch.dict(os.environ, {'SSH_ORIGINAL_COMMAND': 'operator deploy'}):
            with self.assertRaisesRegex(RuntimeError, 'interactive server login'):
                r.operator_cli(['history'])

    def test_cli_parses_commands_and_takes_the_release_lock(self):
        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(r.operator_cli(['history'])['status'], 'history')
        self.assertTrue(Path(r.LOCK).exists())

    def editor_run(self, run_id, status='checking'):
        folder = self.editor / 'runs' / run_id; folder.mkdir(parents=True)
        r.save(folder / 'status.json', {'status': status, 'model': 'gpt-6-astra', 'reasoning_effort': 'high', 'summary': 'Clearer help text'})
        r.save(folder / 'model-requests.json', [{'model': 'gpt-6-astra', 'reasoning_effort': 'high'}])
        r.save(folder / 'base.json', {'commit': self.baseline})
        work = self.editor / 'workspaces' / run_id / 'dashboard'
        r.copy_source(self.repo / 'dashboard', work)
        (work / 'page.tsx').write_text('editor change')

    def test_editor_deploy_path_is_unchanged(self):
        run_id = 'a' * 32; self.editor_run(run_id)
        receipt = r.perform({'action': 'deploy', 'run_id': run_id})
        self.assertEqual(receipt['status'], 'deployed'); self.assertNotIn('operator', receipt)
        self.assertEqual(Path(receipt['backup']).name, f'dashboard-editor-{run_id}')
        self.assertEqual(receipt['image'], f'mark-crypto-dashboard:editor-{run_id}')
        self.assertTrue(sh('git', '--git-dir', str(self.remote), 'log', '-1', '--format=%s', receipt['commit']).startswith('Dashboard edit aaaaaaaaaaaa: Clearer help text'))
        self.assertEqual(self.remote_tip(), receipt['commit'])

    def test_editor_check_pushes_a_draft_branch_only(self):
        run_id = 'b' * 32; self.editor_run(run_id)
        result = r.perform({'action': 'check', 'run_id': run_id})
        self.assertEqual(result['status'], 'checked'); self.assertEqual(result['branch'], f'satoshi-dashboard-drafts/{run_id}')
        self.assertEqual(self.remote_tip(f'satoshi-dashboard-drafts/{run_id}'), result['commit'])
        self.assertEqual(self.remote_tip(), self.baseline); self.assertEqual(r.git('rev-parse', 'HEAD'), self.baseline)
        self.assertEqual(r.git('rev-parse', '--abbrev-ref', 'HEAD'), r.BRANCH)

    def test_editor_cannot_trigger_a_release_without_an_astra_run(self):
        run_id = 'c' * 32; self.editor_run(run_id)
        r.save(self.editor / 'runs' / run_id / 'status.json', {'status': 'checking', 'model': 'gpt-5.6-sol', 'reasoning_effort': 'high'})
        with self.assertRaisesRegex(RuntimeError, 'Astra High'):
            r.perform({'action': 'deploy', 'run_id': run_id})
        self.assertEqual(self.docker, [])


if __name__ == '__main__': unittest.main()
