"""Document-extraction boundary used by ingestion processing."""

from typing import Protocol, runtime_checkable


@runtime_checkable
class DocumentExtractor(Protocol):
    """Extract normalized text from a document at ``file_path``."""

    def extract(self, file_path: str, /) -> str: ...
