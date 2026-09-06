"""Write the Markdown source of every page next to the page it built.

The docs carry a "Copy page" control that hands a language model the Markdown
behind the page it is looking at. That Markdown has to be fetchable, so after
the site is built each ``docs/<path>.md`` is copied to ``site/<path>.md`` --
one URL away from ``site/<path>/index.html``, which is what the control asks
for. Run it after the build::

    uv run --no-dev --group docs zensical build --clean
    uv run python scripts/emit_markdown.py

``zensical serve`` rebuilds into the same directory and does not know about
these files, so a preview served that way answers 404 to the control; build
the site to try it.
"""

from __future__ import annotations

import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs"
SITE = ROOT / "site"


def declines(text: str) -> bool:
    """Whether a page has asked not to be handed over as Markdown.

    The control above each page is hidden by ``copy_page: false`` in the front
    matter, and a page hidden there must not be written here either -- a file
    nothing links to is worse than no file when its content would mislead.
    This reads that one key rather than the front matter as a whole: the docs
    build has no YAML parser of its own, and one key is all that is at stake.
    """
    lines = text.splitlines()
    if not lines or lines[0].strip() != "---":
        return False
    for line in lines[1:]:
        if line.strip() == "---":
            return False
        key, _, value = line.partition(":")
        if key.strip() == "copy_page":
            return value.strip().lower() == "false"
    return False


def target_for(source: pathlib.Path) -> pathlib.Path:
    """Where the control will look for one page's Markdown.

    It asks for the page's own URL with ``.md`` in place of the trailing
    slash, so ``guide/foreign-keys/`` becomes ``guide/foreign-keys.md``. A
    section index is the one place where that is not the source path: the URL
    of ``reference/index.md`` is ``reference/``, and its Markdown therefore
    belongs at ``reference.md``. The site's own index keeps its name.
    """
    relative = source.relative_to(DOCS)
    if relative.name == "index.md" and relative.parent != pathlib.Path():
        return SITE / relative.parent.with_suffix(".md")
    return SITE / relative


def main() -> None:
    """Copy every documentation page into the built site beside its HTML."""
    if not SITE.is_dir():
        sys.exit(f"{SITE} does not exist -- build the site first")

    written: dict[pathlib.Path, pathlib.Path] = {}
    skipped = 0
    for source in sorted(DOCS.rglob("*.md")):
        text = source.read_text(encoding="utf-8")
        if declines(text):
            skipped += 1
            continue
        target = target_for(source)
        if target in written:
            sys.exit(f"{source} and {written[target]} both claim {target}")
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text, encoding="utf-8")
        written[target] = source

    tail = f", {skipped} declined" if skipped else ""
    sys.stdout.write(f"wrote {len(written)} Markdown pages into {SITE.name}/{tail}\n")


if __name__ == "__main__":
    main()
