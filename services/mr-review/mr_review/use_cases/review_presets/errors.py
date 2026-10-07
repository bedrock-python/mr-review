from __future__ import annotations


class ReviewPresetNotFoundError(LookupError):
    """No saved review preset has the requested id."""


class ReviewPresetNameTakenError(ValueError):
    """Another saved review preset already has this name (compared case-insensitively)."""
