"""
Yuz solishtirish servisi (faqat ichki tarmoq uchun, tashqariga ochilmaydi).

  POST /compare  {"reference": <base64>, "probe": <base64>}
    reference — HEMIS rasmi, probe — talabaning selfisi
  -> {"status": "match" | "mismatch" | "no_face" | "no_reference_face" | "bad_reference" | "bad_probe",
      "similarity": 0.52, "threshold": 0.363, "probeFaces": 1, "referenceFaces": 1}

  POST /embed  {"image": <base64>}
  -> {"status": "ok" | "no_face" | "bad_image", "faces": 1, "embedding": [128 ta son, normallashtirilgan]}
     (yuz bo'yicha qidiruv uchun: ikki belgining skalyar ko'paytmasi = kosinus o'xshashlik)

  GET /health -> {"ok": true}

Modellar (OpenCV Zoo):
  YuNet  — yuzni topish
  SFace  — yuzdan 128 o'lchamli belgi (embedding) olish; kosinus o'xshashlik >= 0.363 — bir odam
"""
import base64
import binascii
import json
import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import cv2
import numpy as np

MODELS_DIR = os.environ.get("MODELS_DIR", "/models")
THRESHOLD = float(os.environ.get("FACE_THRESHOLD", "0.363"))  # OpenCV tavsiyasi (SFace, cosine)
PORT = int(os.environ.get("PORT", "8000"))
MAX_SIDE = 1280
MAX_BODY = 30 * 1024 * 1024

# OpenCV DNN obyektlari bir vaqtda bir nechta oqimdan ishlatilmasligi kerak
lock = threading.Lock()
detector = cv2.FaceDetectorYN.create(f"{MODELS_DIR}/yunet.onnx", "", (320, 320), 0.8, 0.3, 5000)
recognizer = cv2.FaceRecognizerSF.create(f"{MODELS_DIR}/sface.onnx", "")


def decode(b64: str):
    """base64 -> BGR rasm (katta bo'lsa kichraytiriladi); xato bo'lsa None"""
    try:
        data = base64.b64decode(b64, validate=True)
    except (binascii.Error, ValueError, TypeError):
        return None
    img = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        return None
    h, w = img.shape[:2]
    scale = MAX_SIDE / max(h, w)
    if scale < 1:
        img = cv2.resize(img, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)
    return img


def detect(img):
    h, w = img.shape[:2]
    detector.setInputSize((w, h))
    _, faces = detector.detect(img)
    return [] if faces is None else list(faces)


def largest(faces):
    return max(faces, key=lambda f: f[2] * f[3])


def compare(reference_b64: str, probe_b64: str) -> dict:
    reference, probe = decode(reference_b64), decode(probe_b64)
    if reference is None:
        return {"status": "bad_reference"}
    if probe is None:
        return {"status": "bad_probe"}

    with lock:
        ref_faces, probe_faces = detect(reference), detect(probe)
        result = {"referenceFaces": len(ref_faces), "probeFaces": len(probe_faces), "threshold": THRESHOLD}
        if not ref_faces:
            return {**result, "status": "no_reference_face"}
        if not probe_faces:
            return {**result, "status": "no_face"}

        ref, prb = largest(ref_faces), largest(probe_faces)
        f_ref = recognizer.feature(recognizer.alignCrop(reference, ref))
        f_prb = recognizer.feature(recognizer.alignCrop(probe, prb))
        similarity = float(recognizer.match(f_ref, f_prb, cv2.FaceRecognizerSF_FR_COSINE))

    return {
        **result,
        "status": "match" if similarity >= THRESHOLD else "mismatch",
        "similarity": round(similarity, 4),
        "probeScore": round(float(prb[-1]), 3),
    }


def embed(image_b64: str) -> dict:
    """Rasmdagi eng katta yuzning belgisi (128 son, uzunligi 1 ga normallashtirilgan).
    Ikki belgining skalyar ko'paytmasi = kosinus o'xshashlik (compare bilan bir xil shkala)."""
    img = decode(image_b64)
    if img is None:
        return {"status": "bad_image"}
    with lock:
        faces = detect(img)
        if not faces:
            return {"status": "no_face", "faces": 0}
        feature = recognizer.feature(recognizer.alignCrop(img, largest(faces))).flatten()
    norm = float(np.linalg.norm(feature))
    if norm:
        feature = feature / norm
    return {"status": "ok", "faces": len(faces), "embedding": [round(float(x), 6) for x in feature]}


class Handler(BaseHTTPRequestHandler):
    def _json(self, code: int, body: dict):
        data = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path == "/health":
            return self._json(200, {"ok": True})
        self._json(404, {"error": "not found"})

    def do_POST(self):
        if self.path not in ("/compare", "/embed"):
            return self._json(404, {"error": "not found"})
        length = int(self.headers.get("Content-Length") or 0)
        if not 0 < length <= MAX_BODY:
            return self._json(413, {"error": "body size"})
        try:
            body = json.loads(self.rfile.read(length))
            result = compare(body["reference"], body["probe"]) if self.path == "/compare" else embed(body["image"])
        except (json.JSONDecodeError, KeyError, TypeError):
            return self._json(400, {"error": "expected JSON {reference, probe} or {image} (base64)"})
        except Exception as e:  # noqa: BLE001 — servis yiqilmasligi kerak
            return self._json(500, {"error": str(e)})
        self._json(200, result)

    def log_message(self, fmt, *args):  # faqat xatolar
        if args and str(args[1]).startswith(("4", "5")):
            super().log_message(fmt, *args)


if __name__ == "__main__":
    print(f"Face service :{PORT}  threshold={THRESHOLD}  opencv={cv2.__version__}", flush=True)
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
