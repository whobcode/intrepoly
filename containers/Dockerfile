FROM kalilinux/kali-rolling

# Default ports
ENV PORT=444 \
    NODE_ENV=production \
    DEBIAN_FRONTEND=noninteractive

## Install base deps + Node.js 22 (NodeSource) + tini
RUN apt-get update -y && apt-get install -y --no-install-recommends \
    ca-certificates curl gnupg tini jq \
 && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /usr/share/keyrings/nodesource.gpg \
 && echo "deb [signed-by=/usr/share/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" > /etc/apt/sources.list.d/nodesource.list \
 && apt-get update -y \
 && apt-get install -y --no-install-recommends nodejs \
 && rm -rf /var/lib/apt/lists/*

# Install cloudflared (static binary)
RUN curl -fsSL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared \
 && chmod +x /usr/local/bin/cloudflared \
 && cloudflared --version || true

WORKDIR /app

# Install JS deps first (better layer caching)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --include=optional || npm ci

# Copy app
COPY . .

# Use non-root user
# Run as non-root user for app files
RUN useradd -m -u 10001 appuser
USER appuser

# Copy default cloudflared config location (mounted/overridden in prod)
COPY --chown=appuser:appuser containers/cloudflared.yml /etc/cloudflared/config.yml

# Health check: worker dev port
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+process.env.PORT, r=>{if(r.statusCode<400)process.exit(0);process.exit(1)}).on('error',()=>process.exit(1))" || exit 1

# Start wrapper
COPY --chown=appuser:appuser containers/start.sh /start.sh
ENTRYPOINT ["/usr/bin/tini","-g","--"]
CMD ["/start.sh"]
