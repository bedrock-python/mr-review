"""Hosts and AI providers are validated on the way in, so the list the UI reads stays parseable."""

from __future__ import annotations

import pytest
from mr_review.api.schemas.ai_providers import CreateAIProviderRequest, UpdateAIProviderRequest
from mr_review.api.schemas.hosts import CreateHostRequest, UpdateHostRequest
from pydantic import ValidationError

pytestmark = pytest.mark.unit

_HOST = {"name": "GL", "type": "gitlab", "token": "t"}
_PROVIDER = {"name": "Claude", "type": "claude", "api_key": "k"}


@pytest.mark.parametrize("base_url", ["gitlab.example.com", "ftp://gitlab.example.com", "https://", "", "  "])
def test__create_host__base_url_not_an_http_url__is_rejected(base_url: str) -> None:
    """A base URL without an http(s) scheme and a host name never reaches the store."""
    with pytest.raises(ValidationError, match="base_url"):
        CreateHostRequest.model_validate({**_HOST, "base_url": base_url})


def test__create_host__http_url__is_kept_without_trailing_slash() -> None:
    """A valid URL is accepted and normalised as before."""
    request = CreateHostRequest.model_validate({**_HOST, "base_url": " https://gl.example.com/ "})

    assert request.base_url == "https://gl.example.com"


@pytest.mark.parametrize("timeout", [0, -5])
def test__create_host__timeout_not_positive__is_rejected(timeout: int) -> None:
    """A zero or negative timeout would make every call to the host fail at once."""
    with pytest.raises(ValidationError, match="timeout"):
        CreateHostRequest.model_validate({**_HOST, "base_url": "https://gl.example.com", "timeout": timeout})


def test__update_host__invalid_fields__are_rejected_and_omitted_fields_allowed() -> None:
    """A PATCH validates the fields it carries and leaves the others alone."""
    with pytest.raises(ValidationError, match="base_url"):
        UpdateHostRequest.model_validate({"base_url": "gitlab.example.com"})
    with pytest.raises(ValidationError, match="timeout"):
        UpdateHostRequest.model_validate({"timeout": 0})

    assert UpdateHostRequest.model_validate({"name": "renamed"}).base_url is None


def test__create_ai_provider__empty_base_url__means_the_default_endpoint() -> None:
    """Providers may leave base_url empty to use the vendor's endpoint."""
    assert CreateAIProviderRequest.model_validate(_PROVIDER).base_url == ""
    assert CreateAIProviderRequest.model_validate({**_PROVIDER, "base_url": "  "}).base_url == ""


def test__create_ai_provider__base_url_without_scheme__is_rejected() -> None:
    """A non-empty base URL has to be an absolute http(s) URL."""
    with pytest.raises(ValidationError, match="base_url"):
        CreateAIProviderRequest.model_validate({**_PROVIDER, "base_url": "localhost:11434/v1"})

    request = CreateAIProviderRequest.model_validate({**_PROVIDER, "base_url": "http://localhost:11434/v1/"})
    assert request.base_url == "http://localhost:11434/v1"


@pytest.mark.parametrize("model", [CreateAIProviderRequest, UpdateAIProviderRequest])
def test__ai_provider__timeout_not_positive__is_rejected(
    model: type[CreateAIProviderRequest] | type[UpdateAIProviderRequest],
) -> None:
    """Create and update both refuse a timeout of zero or below."""
    with pytest.raises(ValidationError, match="timeout"):
        model.model_validate({**_PROVIDER, "timeout": 0})
