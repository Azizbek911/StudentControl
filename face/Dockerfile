FROM docker.io/library/python:3.12-slim

# OpenCV (GUI siz) + numpy
RUN pip install --no-cache-dir "opencv-python-headless>=4.10,<5" "numpy>=1.26,<3"

# Modellar: OpenCV Zoo (YuNet — yuz topish, SFace — yuz belgilari)
ARG ZOO=https://github.com/opencv/opencv_zoo/raw/main/models
RUN mkdir /models && python -c "\
import urllib.request as u, os; \
u.urlretrieve('$ZOO/face_detection_yunet/face_detection_yunet_2023mar.onnx', '/models/yunet.onnx'); \
u.urlretrieve('$ZOO/face_recognition_sface/face_recognition_sface_2021dec.onnx', '/models/sface.onnx'); \
s = {f: os.path.getsize('/models/' + f) for f in os.listdir('/models')}; print(s); \
assert all(v > 100000 for v in s.values()), 'model yuklanmadi'"

WORKDIR /app
COPY app.py .
RUN useradd --system --no-create-home face
USER face
EXPOSE 8000
CMD ["python", "-u", "app.py"]
