#!/bin/sh
set -e

if [ "$SERVICE_TYPE" = "worker" ]; then
    echo "[SharkPro] Starting Worker consumer..."
    exec python -m src.worker.consumer
else
    echo "[SharkPro] Starting API server on port 8000..."
    exec uvicorn src.api.main:app --host 0.0.0.0 --port 8000
fi
