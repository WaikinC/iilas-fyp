import base64
import hmac
import os
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field
from models import predict_tabular, MODEL_DIR
from vision import predict_image

app = FastAPI(title='IILAS Research Inference', docs_url=None, redoc_url=None)

class Request(BaseModel):
    kind: str
    features: dict[str,float] = Field(default_factory=dict)
    imageBase64: str | None = Field(default=None,max_length=14_000_000)

@app.get('/health')
def health():
    return {'models':{kind:(MODEL_DIR/f'{kind}.joblib').is_file() for kind in ['inventory','delivery']},'vision':(MODEL_DIR/'MobileNetV2.keras').is_file()}

@app.post('/predict')
def predict(request:Request, authorization:str=Header(default='')):
    token = os.environ.get('IILAS_RESEARCH_TOKEN','')
    if not token: raise HTTPException(503,'Research service authentication is not configured.')
    if not hmac.compare_digest(authorization,f'Bearer {token}'): raise HTTPException(401,'Invalid service credentials.')
    try:
        if request.kind in ['inventory','delivery']: return predict_tabular(request.kind,request.features)
        if request.kind=='parcel' and request.imageBase64: return predict_image(base64.b64decode(request.imageBase64,validate=True))
        raise ValueError('Choose inventory, delivery, or parcel inference.')
    except FileNotFoundError as error: raise HTTPException(503,str(error)) from error
    except (ValueError,KeyError) as error: raise HTTPException(422,str(error)) from error
