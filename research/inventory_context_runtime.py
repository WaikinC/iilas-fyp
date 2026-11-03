"""Fresh output accounting for RF14 serving, separate from frozen research code."""
import os
from pathlib import Path
import stat

import runner_runtime as runtime
from inventory_inference import _StockSupervisor,TOTAL_OUTPUT_BYTES

_LINK_TAGS=frozenset((0xA000000C,0xA0000003))  # symlink / mount-point junction


def _reject_link(info):
    if stat.S_ISLNK(info.st_mode) or getattr(info,'st_reparse_tag',0) in _LINK_TAGS:
        raise runtime.RuntimeSafetyError('Output link forbidden')


def measure_output_bytes(directory):
    """One fresh file stat per scan; never cache DirEntry sizes across growth."""
    try:
        raw=Path(directory)
        if '..' in raw.parts:raise runtime.RuntimeSafetyError('Output parent traversal forbidden')
        root=raw.absolute();pending=[(root,None)];total=0
        while pending:
            folder,expected=pending.pop()
            info=os.stat(folder,follow_symlinks=False)
            _reject_link(info)
            if not stat.S_ISDIR(info.st_mode):raise runtime.RuntimeSafetyError('Output directory required')
            identity=(info.st_dev,info.st_ino)
            if expected is not None and identity!=expected:raise runtime.RuntimeSafetyError('Output directory changed')
            with os.scandir(folder) as entries:
                for entry in entries:
                    path=Path(entry.path)
                    if path.parent!=folder or not path.is_relative_to(root):
                        raise runtime.RuntimeSafetyError('Output entry outside admitted tree')
                    # DirEntry.stat can use enumeration-time metadata on Windows.
                    # This fresh non-following result serves all three decisions.
                    item=os.stat(entry.path,follow_symlinks=False)
                    _reject_link(item)
                    if stat.S_ISDIR(item.st_mode):pending.append((path,(item.st_dev,item.st_ino)))
                    elif stat.S_ISREG(item.st_mode):
                        if type(item.st_size) is not int or item.st_size<0:
                            raise runtime.RuntimeSafetyError('Invalid output size')
                        total+=item.st_size
        return total
    except runtime.RuntimeSafetyError:raise
    except (OSError,ValueError,TypeError,AttributeError) as error:
        raise runtime.RuntimeSafetyError('Output monitoring unavailable: '+str(error)) from error


class ContextServingSupervisor(_StockSupervisor):
    """Keep the original Job/run/drain; substitute only serving byte accounting."""
    def preflight(self,required_available_bytes=None,include_resident=False):
        # Frozen ResourceSupervisor.preflight policy, with only the counter
        # substituted. Differential tests pin every guard, order and boundary.
        try:
            snap=runtime.native_snapshot(extra_pids=self._job.pids() if self._job else ())
            snap['free_disk_bytes']=runtime.shutil.disk_usage(self.output_dir).free
            snap['output_bytes']=measure_output_bytes(self.output_dir)
        except Exception as error:
            raise runtime.RuntimeSafetyError('Resource monitoring unavailable: '+str(error)) from error
        self.last_snapshot=snap
        required=self.limits.min_available_bytes if required_available_bytes is None else required_available_bytes
        if snap['available_bytes']+(snap['rss_bytes'] if include_resident else 0)<required:
            raise runtime.RuntimeSafetyError('available_memory')
        if snap['rss_bytes']>self.limits.max_rss_bytes:raise runtime.RuntimeSafetyError('rss_limit')
        if snap['free_disk_bytes']<self.limits.min_free_disk_bytes:raise runtime.RuntimeSafetyError('free_disk_limit')
        if snap['output_bytes']>self.limits.max_output_bytes:raise runtime.RuntimeSafetyError('output_limit')
        if runtime.time.monotonic()-self.started>self.limits.max_wall_seconds:raise runtime.RuntimeSafetyError('wall_timeout')
        if measure_output_bytes(self.stock_root)>TOTAL_OUTPUT_BYTES:raise runtime.RuntimeSafetyError('total_output_limit')
        return snap
