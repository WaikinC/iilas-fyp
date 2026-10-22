"""Run every research test file serially in a fresh Python interpreter.

Isolation prevents offline/native fixture process state from leaking between
modules. Child unittest output streams normally; existing guards and skips stay
in the tests themselves. The selected Python and environment are inherited.
"""
from pathlib import Path
import subprocess
import sys


def run_tests(research_root=None, *, output=None):
    """Run the complete file collection, returning nonzero for any failure."""
    root = (Path(research_root) if research_root is not None
            else Path(__file__).resolve().parent).resolve()
    output = sys.stdout if output is None else output
    modules = sorted(path for path in root.glob('test_*.py')
                     if path.is_file() and not path.is_symlink())
    failures = []
    if not modules:
        print('Research tests: no test files found.', file=output, flush=True)
        return 1
    for module in modules:
        label = f'{root.name}/{module.name}'
        print(f'\nResearch tests: {label}', file=output, flush=True)
        try:
            result = subprocess.run(
                [sys.executable, '-m', 'unittest', 'discover',
                 '-s', str(root), '-p', module.name],
                cwd=root.parent, shell=False)
            if result.returncode:
                failures.append((label, f'exit {result.returncode}'))
        except OSError as error:
            failures.append((label, f'could not launch: {error}'))
    print(f'\nResearch tests: {len(modules)} files run; '
          f'{len(failures)} failed.', file=output, flush=True)
    for label, reason in failures:
        print(f'  {label}: {reason}', file=output, flush=True)
    return 1 if failures else 0


if __name__ == '__main__':
    if len(sys.argv) != 1:
        sys.exit('Usage: python research/run_research_tests.py (no options)')
    sys.exit(run_tests())
