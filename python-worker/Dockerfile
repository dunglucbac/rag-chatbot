FROM python:3.13-slim AS base
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libglib2.0-0 \
    libgl1 \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

RUN pip install poetry

COPY pyproject.toml poetry.lock ./
RUN poetry config virtualenvs.create false && poetry install --only main --no-interaction --no-ansi
# VietOCR pins an incompatible Pillow version in its package metadata, while
# the worker's HEIC support requires Pillow >= 11. Install its code without
# replacing the resolved worker dependencies.
# Its inference imports also require gdown, which is skipped by --no-deps.
# Use its maintained version: VietOCR's pin requires removed pkg_resources.
RUN pip install gdown==5.2.2 && pip install --no-deps VietOCR==0.3.13

COPY src/ ./src/
COPY main.py .

# Verify the lazy OCR imports during the build rather than on the first job.
RUN python -c "from src.extractors.deepdoc_vietocr.full_pipeline import DeepDocPipeline"

# Non-root user for security
RUN useradd --create-home worker
USER worker

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD python -c "import pika; pika.URLParameters('${RABBITMQ_URL}')" || exit 1

CMD ["python", "main.py"]
