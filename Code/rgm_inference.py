import torch
from transformers import AutoTokenizer, AutoModelForSequenceClassification

MODEL_PATH = r"D:\dialogue_system2\project\model\rgm_contradiction\contradiction_model"  
MAX_LENGTH = 128

tokenizer = AutoTokenizer.from_pretrained(MODEL_PATH)
model = AutoModelForSequenceClassification.from_pretrained(MODEL_PATH)
model.eval()

def predict_contradiction(dialog):
    context_idx, target_idx = dialog["annotation_target_pair"]
    context = " ".join([dialog["utterances"][i] for i in range(len(dialog["utterances"])) if i != target_idx])
    response = dialog["utterances"][target_idx]

    inputs = tokenizer(context, response, return_tensors="pt", padding=True, truncation=True, max_length=MAX_LENGTH)
    with torch.no_grad():
        logits = model(**inputs).logits
        pred = torch.argmax(logits, dim=-1).item()

    return "contradiction" if pred == 1 else "no_contradiction"
