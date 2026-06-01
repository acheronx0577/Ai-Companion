# Railway Dockerfile builder. Python 3.12 + slim deps.
FROM python:3.12-slim-bookworm

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DISABLE_PIPER=1

COPY requirements-railway.txt .
RUN pip install --no-cache-dir -r requirements-railway.txt

COPY . .

# Windows CRLF in shell scripts breaks Linux; normalize for local Procfile use.
RUN sed -i 's/\r$//' scripts/start.sh && chmod +x scripts/start.sh

EXPOSE 8080

# Python entrypoint avoids shell $PORT / CRLF issues on Railway.
CMD ["python", "railway_serve.py"]
