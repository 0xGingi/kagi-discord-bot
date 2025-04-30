FROM oven/bun:latest

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --verbose

COPY . .

CMD ["bun", "start"] 