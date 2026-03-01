# ── Stage 1: Build React frontend ──
FROM node:20-alpine AS web-build
WORKDIR /app/web
COPY read-ui/package.json read-ui/bun.lock* read-ui/package-lock.json* ./
RUN npm install --legacy-peer-deps
COPY read-ui/ ./
RUN npm run build

# ── Stage 2: Build Rust backend ──
FROM rust:1.82-bookworm AS server-build
WORKDIR /app
COPY read-server/ ./read-server/
WORKDIR /app/read-server
RUN cargo build --release

# ── Stage 3: Runtime image ──
FROM debian:bookworm-slim AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    libsqlite3-0 \
    && rm -rf /var/lib/apt/lists/*

RUN useradd -m -s /bin/bash paneluser

WORKDIR /app

# Copy backend binary
COPY --from=server-build /app/read-server/target/release/panel-server /app/panel-server

# Copy frontend dist
COPY --from=web-build /app/web/dist /app/read-ui/dist

# Create data directory
RUN mkdir -p /data && chown paneluser:paneluser /data

USER paneluser

ENV PANEL_PORT=6511
ENV PANEL_DATA_DIR=/data
ENV DATABASE_URL=sqlite:///data/panel.db

EXPOSE 6511

CMD ["/app/panel-server"]
