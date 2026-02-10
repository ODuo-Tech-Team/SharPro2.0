"""
Allow running the worker as:
    python -m src.worker.consumer

This module is invoked when executing ``python -m src.worker``.
"""

from src.worker.consumer import run

if __name__ == "__main__":
    run()
