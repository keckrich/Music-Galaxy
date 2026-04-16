# Stage 1: Build Vite frontend
FROM node:20-alpine AS node-builder
WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

# Stage 2: Install Python deps and strip bloat
# All packages ship manylinux binary wheels — no gcc required.
# Build arg GENERATION controls whether the heavy ML stack is included:
#   docker build .                               # full image (auto-generates from Postgres)
#   docker build --build-arg GENERATION=false .  # lean image (pre-populated songs.json)
FROM python:3.11-slim AS python-builder
WORKDIR /deps

ARG GENERATION=true

COPY backend/requirements-runtime.txt .
COPY backend/requirements-generate.txt .

RUN apt-get update && apt-get install -y --no-install-recommends binutils && \
  rm -rf /var/lib/apt/lists/* && \
  pip install --no-cache-dir --prefix=/install -r requirements-runtime.txt && \
  if [ "$GENERATION" = "true" ]; then \
    pip install --no-cache-dir --prefix=/install -r requirements-generate.txt; \
  fi && \
  find /install -type d -name 'tests'      -exec rm -rf {} + 2>/dev/null || true && \
  find /install -type d -name 'test'       -exec rm -rf {} + 2>/dev/null || true && \
  find /install -type d -name 'benchmarks' -exec rm -rf {} + 2>/dev/null || true && \
  find /install -type d -name '__pycache__' -exec rm -rf {} + 2>/dev/null || true && \
  find /install -name '*.pyc' -delete && \
  find /install -name '*.pyi' -delete 2>/dev/null || true && \
  find /install -path '*/numba/cuda*' -exec rm -rf {} + 2>/dev/null || true && \
  find /install -name '*.so' -exec strip --strip-debug {} + 2>/dev/null || true && \
  find /install -name '*.so.*' -exec strip --strip-debug {} + 2>/dev/null || true

# Stage 3: Lean runtime image
FROM python:3.11-slim
WORKDIR /app

COPY --from=python-builder /install /usr/local
COPY --from=node-builder /app/dist ./dist
COPY backend/server.py .

# pip and setuptools ship with the base image but are unused at runtime
RUN mkdir -p shared && \
  pip uninstall -y pip setuptools 2>/dev/null || true

ENV DIST_DIR=/app/dist
ENV SONGS_FILE=/app/shared/songs.json
ENV ENVIRONMENT=production
ENV PORT=8081
ENV WEB_CONCURRENCY=1
ENV WORKER_TIMEOUT=120
ENV LOG_LEVEL=info
ENV TZ=UTC
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

EXPOSE ${PORT}

HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=3 \
  CMD python3 -c "import os, urllib.request; urllib.request.urlopen(f'http://localhost:{os.getenv(\"PORT\",\"8081\")}/api/status')"

CMD ["sh", "-c", "gunicorn --bind 0.0.0.0:${PORT} --workers ${WEB_CONCURRENCY} --timeout ${WORKER_TIMEOUT} --log-level ${LOG_LEVEL} server:app"]
