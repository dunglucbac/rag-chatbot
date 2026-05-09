class ChunkingService:
    def __init__(self, chunk_size=1000, overlap=200):
        self.chunk_size = chunk_size
        self.overlap = overlap

    def chunk(self, text: str) -> list[str]:
        """Split text into overlapping chunks"""
        if len(text) <= self.chunk_size:
            return [text]

        chunks = []
        start = 0

        while start < len(text):
            end = start + self.chunk_size
            chunks.append(text[start:end])
            start = end - self.overlap

            if start + self.chunk_size >= len(text) and start < len(text):
                chunks.append(text[start:])
                break

        return chunks

    def chunk_with_metadata(self, text: str, metadata: dict) -> list[dict]:
        """Split text into chunks and attach metadata to each"""
        text_chunks = self.chunk(text)
        return [{"content": chunk, "metadata": metadata} for chunk in text_chunks]
