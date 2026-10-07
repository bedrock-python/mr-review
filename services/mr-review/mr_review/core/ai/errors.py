"""Failures of an AI provider call, worded for the person who has to fix them.

Backends translate their SDK's exceptions into these, so the API can answer with a meaningful
status and the dispatch stream can end with a message that says what to change.
"""


class AIProviderError(Exception):
    """The provider failed or rejected the call; ``str(error)`` is safe to show to the user."""


class AIProviderAuthError(AIProviderError):
    """The provider rejected the API key, or the key lacks access."""


class AIProviderTimeoutError(AIProviderError):
    """The provider did not answer within the configured timeout."""


class AIProviderRefusalError(AIProviderError):
    """The model declined to answer, or a content filter stopped the answer."""
