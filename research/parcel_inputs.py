"""Shared full-frame RGB input contract; no dataset or TensorFlow side effects."""
import cv2
import numpy as np
cv2.setNumThreads(1)


def decode_rgb(data: bytes) -> np.ndarray:
    """OpenCV IMREAD_COLOR applies EXIF orientation once; convert BGR once."""
    if not isinstance(data, bytes) or not data:
        raise ValueError('Expected nonempty encoded image bytes')
    image = cv2.imdecode(np.frombuffer(data, dtype=np.uint8), cv2.IMREAD_COLOR)
    if image is None or min(image.shape[:2]) < 64:
        raise ValueError('Invalid image or image dimension below 64 pixels')
    return cv2.cvtColor(image, cv2.COLOR_BGR2RGB)


def prepare_image(rgb, contrast: str) -> np.ndarray:
    """Deterministic preparation for training, validation and inference alike."""
    if contrast not in ('none', 'clahe'):
        raise ValueError('Contrast must be none or clahe')
    image = np.asarray(rgb)
    if image.ndim != 3 or image.shape[2] != 3 or min(image.shape[:2]) < 64 or image.dtype != np.uint8:
        raise ValueError('Expected uint8 RGB image, minimum dimension 64')
    if contrast == 'clahe':
        lab = cv2.cvtColor(image, cv2.COLOR_RGB2LAB)
        lab[:,:,0] = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8,8)).apply(lab[:,:,0])
        image = cv2.cvtColor(lab, cv2.COLOR_LAB2RGB)
    h,w = image.shape[:2]; scale = min(224/w, 224/h)
    nw,nh = max(1,round(w*scale)),max(1,round(h*scale))
    resized = cv2.resize(image, (nw,nh), interpolation=cv2.INTER_AREA if scale < 1 else cv2.INTER_LINEAR)
    out = np.full((224,224,3), 127, dtype=np.float32)
    left,top = (224-nw)//2,(224-nh)//2
    out[top:top+nh,left:left+nw] = resized
    return out


def augment_train(image, rng) -> np.ndarray:
    """Explicit train-only helper; validation/test callers never invoke this."""
    out = np.asarray(image, dtype=np.float32).copy()
    if rng.random() < 0.5: out = out[:,::-1].copy()
    mean = out.mean(axis=(0,1), keepdims=True)
    return np.clip((out-mean)*rng.uniform(0.9,1.1)+mean,0,255).astype(np.float32)


def augment_image(image, rng, training: bool) -> np.ndarray:
    """Only the training branch consumes randomness or changes pixel values."""
    return augment_train(image, rng) if training else np.asarray(image, dtype=np.float32).copy()
