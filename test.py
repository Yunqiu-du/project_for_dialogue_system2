import requests

url = "http://127.0.0.1:8000/predict"

dialog = {
    "utterances": ["I love cats.", "I hate cats."],
    "annotation_target_pair": [0, 1]
}

response = requests.post(url, json=dialog)
print(response.json())
