from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    mongo_uri: str = "mongodb://localhost:27017/scriptrunner"
    jwt_secret: str = "change-me-in-production"
    encryption_key: str = ""
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 7
    admin_email: str = "admin@empresa.com"
    admin_password: str = "Admin@123"
    admin_name: str = "Administrador"
    cors_origins: str = "http://localhost:5173"
    max_script_size_bytes: int = 512_000
    max_batches: int = 50
    login_max_attempts: int = 5
    login_lockout_minutes: int = 15
    script_submit_rate_per_hour: int = 10
    execution_timeout_dev: int = 300
    execution_timeout_prod: int = 120
    cookie_secure: bool = False

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
