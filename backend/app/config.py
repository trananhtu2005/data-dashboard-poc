from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str
    jwt_secret: str
    connection_encryption_key: str
    admin_username: str = "admin"
    admin_password: str
    cors_origins: str = "http://localhost:5173"

    model_config = SettingsConfigDict(case_sensitive=False)


settings = Settings()
