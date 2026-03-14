FROM oven/bun:1

WORKDIR /app
COPY package.json ./
RUN bun install
COPY . .

EXPOSE ${PORT:-3000}
CMD ["bun", "run", "src/index.ts"]
