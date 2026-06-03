# Render — English Piper only (one ONNX model to limit RAM on Free tier).
FROM python:3.12-slim-bookworm

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app \
    PRODUCTION=1 \
    PIPER_MAX_LOADED_VOICES=1 \
    PIP_ROOT_USER_ACTION=ignore

RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements-prod.txt .
RUN pip install --no-cache-dir -r requirements-prod.txt

COPY . .

# English Piper model only (~60MB). Set DISABLE_PIPER=1 in Render env to skip (browser TTS).
RUN if [ "${DISABLE_PIPER:-0}" != "1" ]; then python scripts/download_piper_voices.py; fi

EXPOSE 10000

CMD ["python", "-m", "wakuwaku.serve"]
