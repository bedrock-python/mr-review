"""Application constants."""

SERVICE_NAME = "mr-review"

SENSITIVE_LOG_FIELDS: frozenset[str] = frozenset(
    {
        # Credentials and tokens
        "password",
        "token",
        "secret",
        "authorization",
        "cookie",
        "api_key",
        "access_token",
        "refresh_token",
        # User identifiers
        "x-user-id",
        "x_user_id",
        # AI provider keys
        "anthropic_api_key",
        "openai_api_key",
        "gitlab_token",
        "github_token",
    }
)
