from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    database_url: str = ""
    api_secret: str = ""          # token estático; vacío = modo dev (acepta 'dev-local-user')
    fixed_user_id: str = "local-user-dev"  # user_id fijo que se usa en todas las tablas
    cors_origins: str = "http://localhost:5173"
    gemini_api_key: str = ""

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",")]


settings = Settings()
