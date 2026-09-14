"""Python type definitions for the NestJS ingestion event wire contract.

These mirror ``src/modules/common/common.types.ts`` and
``src/ingestion/ingestion.types.ts``. They describe decoded JSON only; callers
must still validate data received from RabbitMQ at runtime.
"""

from typing import Literal, NotRequired, TypedDict

IngestionEventType = Literal[
    "doc.pdf.parse.requested",
    "image.classify.requested",
]
IngestionFileType = Literal["pdf", "image"]
IngestionClassification = Literal["receipt", "payment", "document", "unknown"]


class IngestionDispatchPayload(TypedDict):
    jobId: str
    fileId: str
    userId: str
    originalFilename: str
    storagePath: str
    mimeType: str
    fileType: IngestionFileType
    classification: IngestionClassification
    fileExtension: str
    fileSize: int
    checksumSha256: str
    correlationId: str
    sourceContext: NotRequired[dict[str, object] | None]


class IngestionEventEnvelope(TypedDict):
    schemaVersion: Literal[1]
    eventId: str
    eventType: IngestionEventType
    correlationId: str
    attempt: int
    createdAt: str
    payload: IngestionDispatchPayload
