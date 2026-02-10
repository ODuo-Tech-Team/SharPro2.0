FROM python:3.12-slim

WORKDIR /app

# Install system deps for audio processing
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY src/ ./src/

# Expose port
EXPOSE 8000

# Run both API and Worker using a simple entrypoint
CMD ["uvicorn", "src.api.main:app", "--host", "0.0.0.0", "--port", "8000"]
