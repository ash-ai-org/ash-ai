FROM node:20-slim

LABEL org.opencontainers.image.source=https://github.com/ash-ai-org/ash-ai
LABEL org.opencontainers.image.description="Ash server — deploy and orchestrate hosted AI agents"
LABEL org.opencontainers.image.licenses=MIT

# bubblewrap for sandbox isolation (fallback), procps for ps/kill utilities
RUN apt-get update && \
    apt-get install -y --no-install-recommends bubblewrap procps curl && \
    rm -rf /var/lib/apt/lists/*

# gVisor (runsc) for sandbox isolation — syscall-interception via user-space kernel.
# Stronger than bwrap (namespace-only): kernel exploits don't help because the
# process never talks to the real kernel. Requires SYS_PTRACE capability at runtime.
RUN ARCH=$(uname -m) && \
    curl -fsSL "https://storage.googleapis.com/gvisor/releases/release/latest/${ARCH}/runsc" -o /usr/local/bin/runsc && \
    chmod +x /usr/local/bin/runsc

WORKDIR /app

# Enable pnpm
RUN corepack enable pnpm

# Copy workspace config + lockfile (cache-friendly layer)
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./

# Copy each package.json + tsconfig for dependency resolution
COPY packages/shared/package.json packages/shared/tsconfig.json packages/shared/
COPY packages/bridge/package.json packages/bridge/tsconfig.json packages/bridge/
COPY packages/sandbox/package.json packages/sandbox/tsconfig.json packages/sandbox/
COPY packages/server/package.json packages/server/tsconfig.json packages/server/
COPY packages/cli/package.json packages/cli/tsconfig.json packages/cli/
COPY packages/runner/package.json packages/runner/tsconfig.json packages/runner/
COPY packages/sdk/package.json packages/sdk/tsconfig.json packages/sdk/

# Install dependencies (cached unless package.json or lockfile changes)
RUN pnpm install --frozen-lockfile

# Copy only source directories (don't clobber package.json/tsconfig/node_modules)
COPY packages/shared/src/ packages/shared/src/
COPY packages/bridge/src/ packages/bridge/src/
COPY packages/sandbox/src/ packages/sandbox/src/
COPY packages/server/src/ packages/server/src/
COPY packages/server/drizzle/ packages/server/drizzle/
COPY packages/cli/src/ packages/cli/src/
COPY packages/runner/src/ packages/runner/src/
COPY packages/sdk/src/ packages/sdk/src/

# Build
RUN pnpm build

# Install Claude Code CLI (the agent SDK spawns this as a child process)
RUN npm install -g @anthropic-ai/claude-code@latest

# Create non-root user for sandbox processes.
# Claude Code refuses --dangerously-skip-permissions as root.
RUN useradd -m -s /bin/bash -u 1100 ash-sandbox && \
    mkdir -p /home/ash-sandbox/.claude && \
    echo '{}' > /home/ash-sandbox/.claude/remote-settings.json && \
    echo '{}' > /home/ash-sandbox/.claude/settings.json && \
    chown -R ash-sandbox:ash-sandbox /home/ash-sandbox

ENV ASH_SANDBOX_UID=1100
ENV ASH_SANDBOX_GID=1100

# Entrypoint sets up cgroup v2 delegation for sandbox resource limits
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ENV ASH_PORT=4100
ENV ASH_HOST=0.0.0.0
ENV ASH_DATA_DIR=/data
ENV ASH_BRIDGE_ENTRY=/app/packages/bridge/dist/index.js
ENV ASH_REAL_SDK=1
ENV CLAUDE_CODE_EXECUTABLE=/usr/local/lib/node_modules/@anthropic-ai/claude-code/cli.js

EXPOSE 4100

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "packages/server/dist/index.js"]
