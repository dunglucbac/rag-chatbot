"""S3-compatible object storage access for ingestion workers."""

import os
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Protocol

import boto3
from botocore.config import Config


class ObjectStorage(Protocol):
    @contextmanager
    def download(self, key: str, /) -> Iterator[str]: ...


class LocalObjectStorage:
    """Test-only adapter that treats an object key as an existing local path."""

    @contextmanager
    def download(self, key: str, /) -> Iterator[str]:
        yield key


class S3ObjectStorage:
    def __init__(
        self,
        *,
        endpoint: str,
        region: str,
        bucket: str,
        access_key: str,
        secret_key: str,
        force_path_style: bool = False,
    ) -> None:
        self._bucket = bucket
        self._client = boto3.client(
            "s3",
            endpoint_url=endpoint,
            region_name=region,
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
            config=(
                Config(s3={"addressing_style": "path"}) if force_path_style else None
            ),
        )

    @classmethod
    def from_environment(cls) -> "S3ObjectStorage":
        def required(name: str) -> str:
            value = os.getenv(name, "").strip()
            if not value:
                raise ValueError(f"Missing required environment variable: {name}")
            return value

        return cls(
            endpoint=required("OBJECT_STORAGE_ENDPOINT"),
            region=os.getenv("OBJECT_STORAGE_REGION", "us-east-1"),
            bucket=required("OBJECT_STORAGE_BUCKET"),
            access_key=required("OBJECT_STORAGE_ACCESS_KEY"),
            secret_key=required("OBJECT_STORAGE_SECRET_KEY"),
            force_path_style=os.getenv(
                "OBJECT_STORAGE_FORCE_PATH_STYLE", "false"
            ).lower()
            == "true",
        )

    @contextmanager
    def download(self, key: str, /) -> Iterator[str]:
        suffix = Path(key).suffix
        with TemporaryDirectory(prefix="ingestion-object-") as directory:
            target = Path(directory) / f"source{suffix}"
            self._client.download_file(self._bucket, key, str(target))
            yield str(target)
