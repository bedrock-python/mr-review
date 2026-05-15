"""API configuration."""

from pathlib import Path

from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

from mr_review import __version__ as project_version


class HttpServerConfig(BaseModel):
    """HTTP server configuration."""

    host: str = Field(default="0.0.0.0", description="Server bind address")  # noqa: S104
    port: int = Field(default=8000, description="Server port")
    workers: int = Field(default=1, description="Number of worker processes")
    timeout_keep_alive: int = Field(default=5, description="Keep-alive timeout in seconds")
    timeout_graceful_shutdown: int = Field(default=10, description="Graceful shutdown timeout in seconds")
    access_log: bool = Field(default=False, description="Enable uvicorn access log")
    proxy_headers: bool = Field(default=True, description="Trust proxy headers")
    forwarded_allow_ips: str = Field(default="*", description="Trusted proxy IPs")


class CorsConfig(BaseModel):
    """CORS configuration."""

    allow_origins: list[str] = Field(
        default=["http://localhost:5173", "http://localhost:3000"],
        description="Allowed origins",
    )
    allow_credentials: bool = Field(default=True)
    allow_methods: list[str] = Field(default=["*"])
    allow_headers: list[str] = Field(default=["*"])


class LoggingConfig(BaseModel):
    """Logging configuration."""

    level: str = Field(default="INFO", description="Log level")
    use_json: bool = Field(default=False, description="JSON format (False = console)")


class Settings(BaseSettings):
    """Main application settings."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="MR_REVIEW__",
        extra="ignore",
        env_nested_delimiter="__",
        case_sensitive=False,
    )

    server: HttpServerConfig = Field(default_factory=HttpServerConfig)
    cors: CorsConfig = Field(default_factory=CorsConfig)
    logging: LoggingConfig = Field(default_factory=LoggingConfig)
    data_dir: Path = Field(default=Path.home() / ".mr-review", description="Local data storage directory")
    host_data_dir: Path | None = Field(
        default=None, description="Host-side data path shown in UI when running in Docker"
    )
    static_dir: Path | None = Field(
        default=None, description="Serve built frontend from this directory (all-in-one mode)"
    )

    @staticmethod
    def get_app_version() -> str:
        return project_version

    def get_uvicorn_kwargs(self) -> dict[str, object]:
        """Build kwargs for uvicorn.run()."""
        return {
            "host": self.server.host,
            "port": self.server.port,
            "workers": self.server.workers,
            "timeout_keep_alive": self.server.timeout_keep_alive,
            "timeout_graceful_shutdown": self.server.timeout_graceful_shutdown,
            "access_log": self.server.access_log,
            "proxy_headers": self.server.proxy_headers,
            "forwarded_allow_ips": self.server.forwarded_allow_ips,
            "log_config": None,  # use structlog
            # httptools has a broken Windows wheel for Python 3.12; h11 is the safe fallback
            "http": "h11",
        }
