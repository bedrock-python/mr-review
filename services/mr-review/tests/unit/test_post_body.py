"""How a comment's body reads on the MR."""

from __future__ import annotations

import pytest
from mr_review.use_cases.reviews.post_body import format_post_body

from tests.factories.entities import make_comment

pytestmark = pytest.mark.unit


@pytest.mark.parametrize(
    ("style", "location", "expected"),
    [
        ("bold", None, "**Major** · Use a constant."),
        ("tag", None, "[major] Use a constant."),
        ("off", None, "Use a constant."),
        ("bold", "src/a.py", "**Major** · `src/a.py`\n\nUse a constant."),
        ("tag", "src/a.py:12", "[major] `src/a.py:12`\n\nUse a constant."),
        ("off", "src/a.py:12", "`src/a.py:12`\n\nUse a constant."),
    ],
)
def test__format_post_body__label_and_location(style: str, location: str | None, expected: str) -> None:
    comment = make_comment(severity="major", body="Use a constant.")

    assert format_post_body(comment, style, location) == expected  # type: ignore[arg-type]


@pytest.mark.parametrize("body", ["```python\nx = 1\n```", "- one\n- two", "# Heading", "> quoted", "1. first"])
def test__format_post_body__block_body__label_goes_on_its_own_line(body: str) -> None:
    """Gluing the label in front of a fence or a list would break its markdown."""
    comment = make_comment(severity="minor", body=body)

    assert format_post_body(comment, "bold") == f"**Minor**\n\n{body}"


def test__format_post_body__path_with_backticks__stays_one_code_span() -> None:
    comment = make_comment(severity="minor", body="x")

    assert format_post_body(comment, "off", "docs/`odd`.md") == "``docs/`odd`.md``\n\nx"
