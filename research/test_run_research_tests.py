"""Small orchestration checks; never launch the real research suite here."""
import io
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

import run_research_tests as runner


class ResearchRunnerTests(unittest.TestCase):
    def test_symlinks_are_excluded_from_collection(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            for name in ('test_link.py', 'test_real.py'):
                (root / name).touch()
            with patch.object(Path, 'is_symlink', autospec=True,
                              side_effect=lambda path: path.name == 'test_link.py'):
                with patch.object(runner.subprocess, 'run',
                                  return_value=subprocess.CompletedProcess([], 0)) as run:
                    output = io.StringIO()
                    self.assertEqual(runner.run_tests(root, output=output), 0)
                    self.assertEqual(run.call_count, 1)
                    self.assertEqual(run.call_args.args[0][-1], 'test_real.py')
                    self.assertIn('1 files run; 0 failed', output.getvalue())

    def test_sorted_regular_files_run_serially_and_failures_do_not_stop_collection(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary) / 'research'
            root.mkdir()
            for name in ('test_z.py', 'test_a.py', 'other.py'):
                (root / name).write_text('', encoding='utf-8')
            (root / 'test_directory.py').mkdir()
            calls = []

            def run(command, **kwargs):
                calls.append((command, kwargs))
                return subprocess.CompletedProcess(command, 7 if len(calls) == 1 else 0)

            output = io.StringIO()
            with patch.object(runner.subprocess, 'run', side_effect=run):
                result = runner.run_tests(root, output=output)
            self.assertEqual(result, 1)
            self.assertEqual(len(calls), 2)
            for (command, kwargs), name in zip(calls, ('test_a.py', 'test_z.py')):
                self.assertEqual(command, [sys.executable, '-m', 'unittest', 'discover',
                                           '-s', str(root), '-p', name])
                self.assertEqual(kwargs, {'cwd': root.parent, 'shell': False})
            self.assertIn('1 failed', output.getvalue())
            self.assertIn('research/test_a.py', output.getvalue())

    def test_empty_collection_is_an_error(self):
        with tempfile.TemporaryDirectory() as temporary:
            with patch.object(runner.subprocess, 'run') as run:
                self.assertEqual(runner.run_tests(Path(temporary), output=io.StringIO()), 1)
                run.assert_not_called()

    def test_launch_failure_is_reported_and_later_modules_still_run(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            for name in ('test_a.py', 'test_b.py'):
                (root / name).touch()
            with patch.object(runner.subprocess, 'run', side_effect=[OSError('launch failed'),
                      subprocess.CompletedProcess([], 0)]) as run:
                output = io.StringIO()
                self.assertEqual(runner.run_tests(root, output=output), 1)
                self.assertEqual(run.call_count, 2)
                self.assertIn('launch failed', output.getvalue())

    def test_fresh_process_contains_offline_fixture_pollution(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary) / 'research'
            root.mkdir()
            (root / 'test_a.py').write_text(
                "import os, socket, sys, unittest\n"
                "os.environ['IILAS_RUNNER_FIXTURE_POLLUTION'] = 'yes'\n"
                "socket.create_connection = None\n"
                "sys.modules['iilas_runner_fixture_pollution'] = object()\n"
                "class Checks(unittest.TestCase):\n"
                "    def test_fixture(self): self.assertTrue(True)\n", encoding='utf-8')
            (root / 'test_b.py').write_text(
                "import os, socket, sys, unittest\n"
                "class Checks(unittest.TestCase):\n"
                "    def test_clean(self):\n"
                "        self.assertNotIn('IILAS_RUNNER_FIXTURE_POLLUTION', os.environ)\n"
                "        self.assertTrue(callable(socket.create_connection))\n"
                "        self.assertNotIn('iilas_runner_fixture_pollution', sys.modules)\n",
                encoding='utf-8')
            self.assertEqual(runner.run_tests(root, output=io.StringIO()), 0)


if __name__ == '__main__':
    unittest.main()
