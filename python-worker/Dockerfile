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
RUN docling-tools models download --output-dir /app/docling-models \
    layout tableformer rapidocr --rapidocr-backend-lang torch:vi

ENV DOCLING_ARTIFACTS_PATH=/app/docling-models

COPY src/ ./src/
COPY main.py .

# Non-root user for security
RUN useradd --create-home worker
USER worker

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD python -c "import pika; pika.URLParameters('${RABBITMQ_URL}')" || exit 1

CMD ["python", "main.py"]
