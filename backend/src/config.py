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

    # -- Kommo CRM (optional) --
    kommo_subdomain: str = ""
    kommo_token: str = ""
    kommo_pipeline_id: int = 0
    kommo_responsible_user_id: int = 0
    kommo_phone_field_id: int = 0
    kommo_phone_enum_id: int = 0
    kommo_lead_name_field_id: int = 0
    kommo_lead_nome_field_id: int = 0
    kommo_lead_origem_field_id: int = 0

    # -- Notification conversations (Chatwoot) --
    notification_conversation_ids: str = ""

    # -- Inactivity cron --
    inactivity_check_interval_minutes: int = 15
    inactivity_threshold_minutes: int = 30
    inactivity_default_team_id: int = 5

    # -- RabbitMQ queues --
    rabbitmq_reply_queue: str = "replay_to_message"

    # -- Application Defaults --
    rabbitmq_exchange: str = "bot_events"
    rabbitmq_queue: str = "incoming_messages"
    rabbitmq_routing_key: str = "incoming"
    debounce_ttl_seconds: int = 2
    openai_model: str = "gpt-4o"
    whisper_model: str = "whisper-1"
    log_level: str = "INFO"

    # -- Campaigns --
    campaign_default_interval: int = 30
    campaign_max_concurrent: int = 3

    # -- Uazapi (WhatsApp instance management) --
    uazapi_base_url: str = ""
    uazapi_global_token: str = ""

    # -- Public API URL (for webhook callbacks) --
    api_base_url: str = ""


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return a cached singleton of the application settings."""
    return Settings()  # type: ignore[call-arg]
