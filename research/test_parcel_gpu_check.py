"""GPU check boundary fixtures. No TensorFlow, CUDA or native GPU job imports."""
from contextlib import contextmanager
import json
from pathlib import Path
import subprocess
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

try:
    import parcel_gpu_check as gpu
except ModuleNotFoundError:
    gpu = None


class FakeTensor:
    device='/job:localhost/replica:0/task:0/device:GPU:0'
    def __init__(self,value=192.,elements=1024,shape=(32,32)):
        self.value=value;self.elements=elements;self.shape=shape
    def numpy(self):return self
    def reshape(self,*args):return self
    def tolist(self):return [self.value]*self.elements


class FakeTensorFlow:
    __version__='2.21.0'
    __file__=__file__
    float32='float32'
    keras=SimpleNamespace(__version__='3.15.1')
    def __init__(self):
        self.physical=SimpleNamespace(name='/physical_device:GPU:0')
        self.events=[];self.soft=True;self.visible=None;self.configuration=None
        self.config=SimpleNamespace(set_soft_device_placement=self.set_soft,
            list_physical_devices=lambda kind:[self.physical],set_visible_devices=self.set_visible,
            LogicalDeviceConfiguration=lambda memory_limit:SimpleNamespace(memory_limit=memory_limit),
            set_logical_device_configuration=self.set_configuration,
            list_logical_devices=self.initialize,
            experimental=SimpleNamespace(get_device_details=lambda device:{'device_name':'NVIDIA GeForce RTX 3050 Laptop GPU','compute_capability':(8,6)},
                get_memory_info=lambda device:{'current':4096,'peak':8192}))
        self.sysconfig=SimpleNamespace(get_build_info=lambda:{'is_cuda_build':True,'cuda_version':'12.5','cudnn_version':'9'})
        self.linalg=SimpleNamespace(matmul=lambda a,b:FakeTensor())
        self.nn=SimpleNamespace(conv2d=self.convolution)
    def set_soft(self,value):self.soft=value;self.events.append('soft')
    def set_visible(self,devices,kind):self.visible=devices;self.events.append('visible')
    def set_configuration(self,device,configuration):self.configuration=configuration;self.events.append('limit')
    def initialize(self,kind):
        if self.soft or self.visible!=[self.physical] or self.configuration[0].memory_limit!=2048:
            raise RuntimeError('GPU was initialized before strict placement/2048MB configuration')
        self.events.append('initialize')
        return [SimpleNamespace(name='/device:GPU:0')]
    @contextmanager
    def device(self,name):
        if name!='/GPU:0' or 'initialize' not in self.events:raise AssertionError('Wrong GPU scope')
        yield
    def constant(self,value,dtype):return value
    def fill(self,shape,value):return (shape,value)
    def ones(self,shape,dtype):return (shape,1.)
    def convolution(self,inputs,filters,strides,padding):
        if inputs!=((1,8,8,3),1.) or filters!=((3,3,3,2),1.) or strides!=[1,1,1,1] or padding!='VALID':
            raise AssertionError('Convolution probe changed inputs or VALID/stride contract')
        return FakeTensor(27.,72,(1,6,6,2))


class GpuCheckTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(gpu,'Standalone GPU environment checker missing')
        base=gpu.ROOT/'outputs/parcel-gpu-setup-20261021/software-fixtures'
        base.mkdir(parents=True,exist_ok=True)
        self.temp=tempfile.TemporaryDirectory(dir=base);self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name)

    def query(self,command,**kwargs):
        self.assertEqual(kwargs['timeout'],10)
        if command[0]==gpu.HOST_POWERSHELL:
            self.assertIn('FreePhysicalMemory',command[-1])
            return subprocess.CompletedProcess(command,0,'4194304\x00\n','')
        self.assertEqual(command,['nvidia-smi','--query-gpu=name,uuid,driver_version,memory.total,memory.free','--format=csv,noheader,nounits'])
        return subprocess.CompletedProcess(command,0,'NVIDIA GeForce RTX 3050 Laptop GPU, GPU-fixture, 610.78, 4096, 3965\n','')

    @contextmanager
    def admitted(self,tf=None):
        tf=tf or FakeTensorFlow()
        with patch.object(gpu.platform,'system',return_value='Linux'),patch.object(gpu.platform,'release',return_value='6.6-microsoft-standard-WSL2'),\
                patch.object(gpu,'linux_available_bytes',return_value=4*1024**3),\
                patch.object(gpu.importlib.metadata,'version',side_effect=lambda name:gpu.PINNED_PACKAGES[name]),\
                patch.object(gpu.subprocess,'run',side_effect=self.query),\
                patch.object(gpu.importlib,'import_module',return_value=tf):
            yield tf

    def test_help_and_cold_import_never_import_tensorflow_or_create_output(self):
        result=subprocess.run([sys.executable,str(Path(gpu.__file__)),'--help'],capture_output=True,text=True,check=True)
        self.assertIn('check',result.stdout)
        result=subprocess.run([sys.executable,'-c',"import parcel_gpu_check,sys; print(any(n in sys.modules for n in ('tensorflow','keras','numpy','cv2','h5py')))"],cwd=Path(gpu.__file__).parent,capture_output=True,text=True,check=True)
        self.assertEqual(result.stdout.strip(),'False')

    def test_non_wsl2_and_wrong_pins_reject_before_tensorflow_import(self):
        for system,release in [('Windows','Windows'),('Linux','6.6-generic'),('Linux','4.4-Microsoft')]:
            with self.admitted(),patch.object(gpu.platform,'system',return_value=system),patch.object(gpu.platform,'release',return_value=release),\
                    patch.object(gpu.importlib,'import_module',side_effect=AssertionError('Heavy import reached')):
                with self.assertRaisesRegex(ValueError,'WSL2'):gpu.check(self.root/(system+release))
        with self.admitted(),patch.object(gpu.importlib.metadata,'version',return_value='wrong'),\
                patch.object(gpu.importlib,'import_module',side_effect=AssertionError('Heavy import reached')):
            with self.assertRaisesRegex(ValueError,'package'):gpu.check(self.root/'wrong-package')

    def test_host_and_guest_ram_and_gpu_free_admission_are_independent(self):
        with self.admitted(),patch.object(gpu,'linux_available_bytes',return_value=2*1024**3):
            with self.assertRaisesRegex(ValueError,'RAM'):gpu.check(self.root/'low-guest')
        with self.admitted(),patch.object(gpu.subprocess,'run',return_value=subprocess.CompletedProcess([],0,'2097152','')):
            with self.assertRaisesRegex(ValueError,'RAM'):gpu.check(self.root/'low-host')
        for line in ('Other GPU, GPU-x, 610.78, 4096, 3965','RTX 3050, GPU-x, 610.78, 4096, 3000',
                     'RTX 3050, GPU-x, 610.78, 4096, N/A'):
            def query(command,**kwargs):
                if command[0]==gpu.HOST_POWERSHELL:return self.query(command,**kwargs)
                return subprocess.CompletedProcess(command,0,line,'')
            with self.admitted(),patch.object(gpu.subprocess,'run',side_effect=query):
                with self.assertRaises(ValueError):gpu.check(self.root/('bad-gpu-'+str(len(line))))

    def test_single_gpu_limit_precedes_initialization_and_actual_tensor_proof_is_bound(self):
        with self.admitted() as tf:
            receipt=gpu.check(self.root/'success')
        data=json.loads(receipt.read_text())
        self.assertEqual(data['payload']['status'],'success')
        self.assertEqual(data['payload']['tensor']['device'],'/job:localhost/replica:0/task:0/device:GPU:0')
        self.assertEqual(data['payload']['tensor']['checksum'],196608.)
        self.assertEqual(data['payload'].get('convolution',{}).get('checksum'),1944.)
        self.assertEqual(data['payload']['logical_gpu_memory_limit_mib'],2048)
        self.assertLess(tf.events.index('limit'),tf.events.index('initialize'))
        self.assertEqual(len(data['payload']['code_sha256']),64)
        with self.admitted(),self.assertRaises(FileExistsError):gpu.check(self.root/'success')

    def test_cpu_fallback_nonfinite_result_and_wrong_tensorflow_gpu_are_failures(self):
        for mutation in ('cpu','nan','othergpu','multiplegpu'):
            tf=FakeTensorFlow()
            if mutation=='cpu':
                tensor=FakeTensor();tensor.device='/device:CPU:0';tf.linalg.matmul=lambda a,b:tensor
            elif mutation=='nan':tf.linalg.matmul=lambda a,b:FakeTensor(float('nan'))
            elif mutation=='othergpu':tf.config.experimental.get_device_details=lambda dev:{'device_name':'Other GPU'}
            else:tf.config.list_physical_devices=lambda kind:[tf.physical,tf.physical]
            output=self.root/mutation
            with self.admitted(tf),self.assertRaises(ValueError):gpu.check(output)
            self.assertEqual(json.loads((output/'gpu-check.json').read_text())['payload']['status'],'failed')

    def test_queries_are_timed_bounded_and_host_values_are_strict_decimal(self):
        for index,output in enumerate(('12.5','N/A','999999999999999999999999','12 '+str(0),'x'*17000)):
            with self.admitted(),patch.object(gpu.subprocess,'run',return_value=subprocess.CompletedProcess([],0,output,'')):
                with self.assertRaises(ValueError):gpu.check(self.root/('host-bad-'+str(index)))
        with self.admitted(),patch.object(gpu.subprocess,'run',side_effect=subprocess.TimeoutExpired('fixed-command',10)):
            with self.assertRaises(subprocess.TimeoutExpired):gpu.check(self.root/'timeout')

    def test_convolution_proof_rejects_cpu_nonfinite_wrong_value_or_shape(self):
        for mutation in ('cpu','nan','value','shape'):
            tf=FakeTensorFlow();tensor=FakeTensor(27.,72,(1,6,6,2))
            if mutation=='cpu':tensor.device='/device:CPU:0'
            if mutation=='nan':tensor.value=float('nan')
            if mutation=='value':tensor.value=26.
            if mutation=='shape':tensor.shape=(1,12,3,2)
            tf.nn.conv2d=lambda *args,**kwargs:tensor
            with self.admitted(tf),self.assertRaises(ValueError):gpu.check(self.root/('conv-'+mutation))

    def test_output_must_stay_under_ignored_gpu_setup_tree(self):
        with self.assertRaises(ValueError):gpu.check(gpu.ROOT/'research/not-gpu-output')
        with self.assertRaises(ValueError):gpu.check(self.root/'..'/'escape')


if __name__=='__main__':unittest.main()
