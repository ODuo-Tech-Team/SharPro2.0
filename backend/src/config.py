"""
SharkPro V2 - Application Configuration

Loads all settings from environment variables using pydantic-settings.
Uses a singleton pattern via lru_cache so the config is parsed only once.
"""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Central configuration loaded from environment / .env file."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # -- RabbitMQ --
    rabbitmq_url: str = "amqp://guest:guest@localhost:5672/sharkpro"

    # -- Supabase --
    supabase_url: str
    supabase_service_key: str

    # -- Redis --
    redis_url: str = "redis://localhost:6379/0"

    # -- OpenAI --
    openai_api_key: str

    # -- Application Defaults --
    rabbitmq_exchange: str = "bot_events"
    rabbitmq_queue: str = "incoming_messages"
    rabbitmq_routing_key: str = "incoming"
    debounce_ttl_seconds: int = 2
    openai_model: str = "gpt-4o"
    whisper_model: str = "whisper-1"
    log_level: str = "INFO"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return a cached singleton of the application settings."""
    return Settings()  # type: ignore[call-arg]
