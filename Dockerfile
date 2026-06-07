FROM python:3.11-slim

WORKDIR /app

# System deps: ffmpeg for pydub audio conversion, libpq for psycopg2
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libpq-dev \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy and install Python dependencies first (layer caching)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Railway injects $PORT at runtime; default to 8080 for local docker run
ENV PORT=8080
EXPOSE 8080

ENV PYTHONPATH=/app

CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT}
