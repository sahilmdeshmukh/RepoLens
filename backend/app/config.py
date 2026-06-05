from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    openai_api_key: str
    qdrant_url: str
    qdrant_api_key: str
    github_token: str = ""  # optional — falls back to unauthenticated (60 req/hr limit)

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


settings = Settings()
