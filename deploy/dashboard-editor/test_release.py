"""Exercise release Git boundaries against a disposable real Git remote."""
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('release', Path(__file__).with_name('mark-dashboard-release.py'))
r = importlib.util.module_from_spec(spec); spec.loader.exec_module(r)

class GitBoundary(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.root = Path(self.temp.name)
        self.repo = self.root / 'repo'; self.remote = self.root / 'remote.git'
        subprocess.run(['git', 'init', '--bare', str(self.remote)], check=True, capture_output=True)
        subprocess.run(['git', 'clone', str(self.remote), str(self.repo)], check=True, capture_output=True)
        self.patches = [patch.object(r, 'REPO', self.repo), patch.object(r, 'HISTORY', self.root / 'history.json')]
        for p in self.patches: p.start()
        r.git('config', 'user.name', 'Fixture'); r.git('config', 'user.email', 'fixture@example.invalid')
        r.git('checkout', '-b', r.BRANCH)
        (self.repo / 'dashboard').mkdir(); (self.repo / 'dashboard/page.tsx').write_text('original')
        r.git('add', '.'); r.git('commit', '-m', 'Baseline fixture')
        self.baseline = r.git('rev-parse', 'HEAD'); r.push_verified(self.baseline)
        r.save(r.HISTORY, {'current_commit': self.baseline, 'releases': [{'status': 'baseline', 'commit': self.baseline}]})
    def tearDown(self):
        for p in reversed(self.patches): p.stop()
        self.temp.cleanup()
    def test_commit_push_and_restore_preserve_history(self):
        source = self.root / 'source'; source.mkdir(); (source / 'page.tsx').write_text('changed')
        (source / 'data').mkdir(); (source / 'data/private.db').write_text('must not version')
        (source / '.env').write_text('must not version')
        edit = r.version(source, 'Fixture edit'); r.push_verified(edit)
        self.assertEqual(r.git('show', f'{edit}:dashboard/page.tsx'), 'changed')
        self.assertNotIn('private.db', r.git('ls-tree', '-r', '--name-only', edit))
        self.assertNotIn('.env', r.git('ls-tree', '-r', '--name-only', edit))
        r.git('restore', f'--source={self.baseline}', '--staged', '--worktree', '--', 'dashboard')
        r.git('commit', '-m', 'Restore fixture'); restore = r.git('rev-parse', 'HEAD'); r.push_verified(restore)
        self.assertEqual(r.git('rev-parse', f'{self.baseline}:dashboard'), r.git('rev-parse', f'{restore}:dashboard'))
        self.assertEqual(r.git('rev-list', '--count', 'HEAD'), '3')
    def test_unpublished_local_commit_blocks_new_operation(self):
        (self.repo / 'dashboard/page.tsx').write_text('pending'); r.git('commit', '-am', 'Pending')
        with self.assertRaisesRegex(RuntimeError, 'differ'): r.current()
    def test_dirty_checkout_blocks_new_operation(self):
        (self.repo / 'dashboard/page.tsx').write_text('dirty')
        with self.assertRaisesRegex(RuntimeError, 'unfinished'): r.current()
    def test_symlink_rejected(self):
        source = self.root / 'unsafe'; source.mkdir(); (source / 'escape').symlink_to('/etc/passwd')
        with self.assertRaisesRegex(RuntimeError, 'Symlinks'): r.copy_source(source, self.root / 'copy')
    def test_unknown_action_rejected(self):
        with self.assertRaisesRegex(RuntimeError, 'Invalid'): r.perform({'action': 'shell', 'run_id': 'a' * 32})
    def test_unknown_restore_target_rejected(self):
        editor = self.root / 'editor'; run = editor / 'runs' / ('a' * 32); run.mkdir(parents=True)
        (run / 'status.json').write_text(json.dumps({'status': 'reverting'}))
        with patch.object(r, 'EDITOR', editor), patch.object(r, 'BASE', self.root):
            with self.assertRaisesRegex(RuntimeError, 'published'): r.perform({'action': 'revert', 'run_id': 'a' * 32, 'target': 'b' * 40})

if __name__ == '__main__': unittest.main()
