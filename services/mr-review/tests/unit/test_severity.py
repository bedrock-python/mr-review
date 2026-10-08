"""Unit tests for reading a severity from the many ways models spell it."""

from __future__ import annotations

import pytest
from mr_review.core.reviews.severity import normalize_severity

pytestmark = pytest.mark.unit


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("non-blocking", "minor"),
        ("Non-critical", "minor"),
        ("noncritical", "minor"),
        ("not important", "minor"),
        ("no-blocker", "minor"),
        ("Not a blocker", "minor"),
        ("not minor", None),
        ("Low (non-urgent)", "suggestion"),
    ],
)
def test__normalize_severity__negated_word__never_raises_the_level(value: str, expected: str | None) -> None:
    assert normalize_severity(value) == expected
