# ==========================================
# STAGE 1: Build the TypeScript application
# ==========================================
FROM node:20-bullseye-slim AS builder
WORKDIR /usr/src/app

COPY package*.json ./

# Configure npm network retry delays and timeouts properly
RUN npm config set fetch-retry-maxtimeout 120000 \
 && npm config set fetch-retry-mintimeout 20000 \
 && npm config set fetch-retries 5 \
 && npm config set fetch-timeout 600000

RUN npm install --no-audit --no-fund
COPY . . 
RUN npm run build

# ==========================================
# STAGE 2: Secure Production Runner Environment
# ==========================================
FROM node:20-bullseye-slim AS runner
WORKDIR /usr/src/app

# Install runtime package dependencies
RUN apt-get update && apt-get install -y \
    ca-certificates \
    curl \
    jq \
    && rm -rf /var/lib/apt/lists/*

# Install Kite Agent Passport binaries directly into the image layer

# RUN curl -fsSL https://agentpassport.ai/install.sh | bash

# kpass binary must be provided separately (it's a CLI tool, not an npm package)
# Users can:
# 1. Mount it via docker-compose: volumes: ["/path/to/kpass:/usr/local/bin/kpass:ro"]
# 2. Or copy pre-built binary to .kpass_bin/ and build Docker with COPY
# 3. Or build kpass inside a multi-stage Docker build
# See KPASS_SETUP.md for detailed instructions

# If kpass is provided, this will copy it to /usr/local/bin/kpass
# If not provided, the container will still start but /login will fail gracefully

COPY --from=builder /usr/src/app/package*.json ./
# Install only production dependencies in the runtime image
RUN npm install --production --no-audit --no-fund

# Copy pre-built binaries from .kpass_bin/ directory
# Note: ADD is used instead of COPY because we want to include all files in the directory
ADD .kpass_bin/ /tmp/kpass_bin/

# Install the binaries if they were provided
RUN if [ -f /tmp/kpass_bin/kpass ]; then \
      cp /tmp/kpass_bin/kpass /usr/local/bin/kpass && \
      chmod +x /usr/local/bin/kpass && \
      echo "✓ kpass installed"; \
    fi && \
    if [ -f /tmp/kpass_bin/ksearch ]; then \
      cp /tmp/kpass_bin/ksearch /usr/local/bin/ksearch && \
      chmod +x /usr/local/bin/ksearch && \
      echo "✓ ksearch installed"; \
    fi


# Copy the compiled production JavaScript files from builder stage
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/.env.example ./.env.example

ENV NODE_ENV=production
EXPOSE 3000
VOLUME ["/data"]

ENTRYPOINT ["node", "dist/app.js"]
