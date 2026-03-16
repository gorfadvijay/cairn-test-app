FROM oven/bun:1 AS base
WORKDIR /app

# Install dependencies
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile --production

# Copy source
COPY . .

# Create data directory for SQLite
RUN mkdir -p /data

# Expose port
EXPOSE 3100

ENV NODE_ENV=production
ENV PORT=3100
ENV DATA_DIR=/data

CMD ["bun", "run", "index.ts"]
