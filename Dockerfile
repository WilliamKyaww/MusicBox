FROM node:24-bookworm-slim AS frontend-builder

WORKDIR /frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

# --- bgutil PO Token Server builder ---
FROM node:24-bookworm-slim AS bgutil-builder

RUN apt-get update \
    && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Clone a pinned release of the bgutil PO Token provider server
RUN git clone --single-branch --branch 1.3.1 --depth 1 \
    https://github.com/Brainicism/bgutil-ytdlp-pot-provider.git /bgutil

WORKDIR /bgutil/server
RUN npm ci && npx tsc

# --- Main runtime image ---
FROM python:3.14-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV FFMPEG_BINARY=ffmpeg
ENV DOWNLOADS_DIR=/app/data/downloads
ENV PLAYLISTS_DIR=/app/data/playlists
ENV EXPORTS_DIR=/app/data/exports
ENV MAX_CONCURRENT_DOWNLOADS=1
# Hosted copies take their settings from the host's environment variables.
ENV MUSICBOX_SETTINGS_READ_ONLY=true
ENV PO_TOKEN_SERVER_URL=http://127.0.0.1:4416

WORKDIR /app

# Install system dependencies: ffmpeg + Node.js runtime (for the PO token server)
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates ffmpeg curl \
    && curl -fsSL https://deb.nodesource.com/setup_24.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/app ./app
COPY --from=frontend-builder /frontend/dist ./app/static

# Copy the pre-built bgutil PO Token server
COPY --from=bgutil-builder /bgutil/server /opt/bgutil-server

RUN mkdir -p /app/data/downloads /app/data/playlists /app/data/exports

COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

EXPOSE 8000

CMD ["/app/entrypoint.sh"]
