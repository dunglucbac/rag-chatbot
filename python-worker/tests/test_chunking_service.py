import pytest
from src.services.chunking_service import ChunkingService


def test_can_chunk_text_into_smaller_pieces():
    """Can split long text into chunks with overlap"""
    chunker = ChunkingService(chunk_size=100, overlap=20)

    text = "A" * 250  # 250 characters
    chunks = chunker.chunk(text)

    assert len(chunks) > 1
    assert all(len(chunk) <= 100 for chunk in chunks)


def test_preserves_text_with_overlap():
    """Chunks should overlap to preserve context"""
    chunker = ChunkingService(chunk_size=50, overlap=10)

    text = "Hello world this is a test of chunking with overlap functionality"
    chunks = chunker.chunk(text)

    # Verify overlap exists between consecutive chunks
    assert len(chunks) >= 2
    # Last part of first chunk should appear in second chunk
    if len(chunks) >= 2:
        assert chunks[0][-10:] in chunks[1]
