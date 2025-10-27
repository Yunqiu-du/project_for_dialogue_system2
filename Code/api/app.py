from fastapi import FastAPI
from pydantic import BaseModel
from rgm_inference import predict_contradiction

app = FastAPI()

class DialogInput(BaseModel):
    utterances: list
    annotation_target_pair: list

@app.post("/predict")
def predict(dialog: DialogInput):
    result = predict_contradiction(dialog.dict())
    return {"prediction": result}