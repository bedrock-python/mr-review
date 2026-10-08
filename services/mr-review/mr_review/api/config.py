"""API configuration."""

import json
from pathlib import Path
from typing import Annotated, Any

from pydantic import BaseModel, Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

from mr_review import __version__ as project_version

# Loopback names plus the compose service name the web container proxies to.
DEFAULT_ALLOWED_HOSTS: tuple[str, ...] = ("localhost", "127.0.0.1", "::1", "api")


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


class AIThrottleConfig(BaseModel):
    """AI dispatch concurrency-fence configuration.

    Caps the number of in-flight AI dispatch streams per AIProvider entity
    so a local model (e.g. Ollama) cannot be overwhelmed and so cloud usage
    has a coarse upper bound. Per-provider overrides via ``AIProvider.max_concurrent``.
    """

    default_max_concurrent: int = Field(
        default=4,
        ge=1,
        description="Default per-provider concurrent in-flight AI dispatch cap "
        "(overridden by AIProvider.max_concurrent when set).",
    )


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
    ai_throttle: AIThrottleConfig = Field(default_factory=AIThrottleConfig)
    data_dir: Path = Field(default=Path.home() / ".mr-review", description="Local data storage directory")
    vcs_timeout: float = Field(default=60.0, description="HTTP timeout in seconds for VCS API calls")
    host_data_dir: Path | None = Field(
        default=None, description="Host-side data path shown in UI when running in Docker"
    )
    static_dir: Path | None = Field(
        default=None, description="Serve built frontend from this directory (all-in-one mode)"
    )
    allowed_hosts: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: list(DEFAULT_ALLOWED_HOSTS),
        description="Host header values the server answers (DNS-rebinding guard); "
        "a JSON array or a comma-separated list, '*.example.com' for subdomains, '*' for any",
    )

    @field_validator("allowed_hosts", mode="before")
    @classmethod
    def parse_allowed_hosts(cls, value: object) -> object:
        if isinstance(value, str):
            text = value.strip()
            value = json.loads(text) if text.startswith("[") else text.split(",")
        if isinstance(value, list):
            hosts = [str(item).strip() for item in value if str(item).strip()]
            if not hosts:
                raise ValueError("allowed_hosts must name at least one host, or '*' to allow any")
            for host in hosts:
                if "*" in host[1:] or (host.startswith("*") and host != "*" and not host.startswith("*.")):
                    raise ValueError(f"allowed_hosts entry {host!r}: use '*' or '*.example.com'")
            return hosts
        return value

    @staticmethod
    def get_app_version() -> str:
        return project_version

    def get_uvicorn_kwargs(self) -> dict[str, Any]:
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
