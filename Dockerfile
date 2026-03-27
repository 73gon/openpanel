# ── Stage 1: Build React frontend ──
FROM node:20-alpine AS web-build
WORKDIR /app/web
COPY ui/package.json ui/bun.lock* ui/package-lock.json* ./
RUN npm install --legacy-peer-deps
COPY ui/ ./
RUN npm run build

# ── Stage 2a: Prepare Rust dependency recipe (cargo-chef) ──
FROM rust:1-slim-bookworm AS chef
RUN apt-get update && apt-get install -y --no-install-recommends \
    pkg-config \
    libsqlite3-dev \
    build-essential \
    && rm -rf /var/lib/apt/lists/* \
    && cargo install cargo-chef --locked
WORKDIR /app

FROM chef AS planner
COPY server/ ./server/
WORKDIR /app/server
RUN cargo chef prepare --recipe-path recipe.json

# ── Stage 2b: Build Rust backend with cached deps ──
FROM chef AS server-build

ARG BUILD_VERSION=0.0.0-dev
ARG BUILD_CARGO_VERSION=0.0.0
ARG BUILD_CHANNEL=dev
ARG BUILD_COMMIT=unknown
ARG GITHUB_REPOSITORY=

WORKDIR /app/server

# Cook dependencies first (cached until Cargo.toml/lock changes)
COPY --from=planner /app/server/recipe.json recipe.json
RUN cargo chef cook --release --recipe-path recipe.json

# Now copy full source and build
COPY server/ ./

# Inject version into Cargo.toml so CARGO_PKG_VERSION reflects the release
RUN sed -i "s/^version = .*/version = \"${BUILD_CARGO_VERSION}\"/" Cargo.toml

# Also make channel + commit + display version available at compile time
ENV BUILD_CHANNEL=${BUILD_CHANNEL}
ENV BUILD_COMMIT=${BUILD_COMMIT}
ENV BUILD_VERSION=${BUILD_VERSION}
ENV GITHUB_REPOSITORY=${GITHUB_REPOSITORY}

RUN cargo build --release

# ── Stage 3: Runtime image ──
FROM debian:bookworm-slim AS runtime

ARG BUILD_CHANNEL=dev

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    libsqlite3-0 \
    curl \
    && rm -rf /var/lib/apt/lists/*

RUN useradd -m -s /bin/bash openpaneluser

WORKDIR /app

# Copy backend binary
COPY --from=server-build /app/server/target/release/openpanel-server /app/openpanel-server

# Copy frontend dist
COPY --from=web-build /app/web/dist /app/ui/dist

# Create data directory
RUN mkdir -p /data && chown openpaneluser:openpaneluser /data

USER openpaneluser

ENV OPENPANEL_PORT=6515
ENV OPENPANEL_DATA_DIR=/data
ENV DATABASE_URL=sqlite:///data/openpanel.db
ENV BUILD_CHANNEL=${BUILD_CHANNEL}

EXPOSE 6515

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:6515/api/health || exit 1

CMD ["/app/openpanel-server"]
