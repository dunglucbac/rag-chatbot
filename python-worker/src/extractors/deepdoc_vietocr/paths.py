"""Paths for the vendored DeepDoc + VietOCR assets."""

from pathlib import Path


ROOT = Path(__file__).resolve().parent


def get_project_base_directory(*parts: str) -> str:
    """Return the absolute path to a bundled DeepDoc resource."""
    return str(ROOT.joinpath(*parts))
