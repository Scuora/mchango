# syntax=docker/dockerfile:1

# 1. Frontend build (Node is needed only here, never at runtime).
FROM node:22.21-trixie-slim AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
COPY docs/money-test-vectors.json /app/docs/money-test-vectors.json
RUN npm run build

# 2. Backend build.
FROM rust:1.99-slim-trixie AS backend
WORKDIR /app/backend
COPY backend/Cargo.toml backend/Cargo.lock ./
# Build dependencies first so code changes do not rebuild them.
RUN mkdir src && echo 'fn main() {}' > src/main.rs && touch src/lib.rs \
    && cargo build --release --locked && rm -rf src
COPY backend/ ./
RUN touch src/main.rs src/lib.rs && cargo build --release --locked

# 3. Runtime: the binary, the built frontend and poppler's pdftotext.
FROM debian:trixie-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends poppler-utils tini ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 10001 --home-dir /data --shell /usr/sbin/nologin mchango \
    && mkdir -p /data && chown mchango:mchango /data
COPY --from=backend /app/backend/target/release/mchango /usr/local/bin/mchango
COPY --from=frontend /app/frontend/dist /app/frontend/dist
ENV DATABASE_PATH=/data/mchango.sqlite \
    UPLOADS_DIR=/data/uploads \
    STATIC_DIR=/app/frontend/dist \
    PDFTOTEXT_PATH=/usr/bin/pdftotext \
    PUBLIC_ADDR=0.0.0.0:8080 \
    MANAGE_ADDR=0.0.0.0:8081 \
    LOG_FORMAT=json
# MANAGE_ADDR_PRIVATE_CONFIRMED is deliberately not set here: whoever runs the
# image must decide how the management port is kept private (see docker-compose.yml).
USER mchango
WORKDIR /data
VOLUME ["/data"]
EXPOSE 8080 8081
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/mchango"]
CMD ["serve"]
