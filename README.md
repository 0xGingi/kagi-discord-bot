# Kagi Discord Bot

A Discord bot that integrates with the Kagi API to provide powerful search capabilities directly within Discord.

## Features

This bot provides slash commands to interact with Kagi API:

1. `/fastgpt` - Query the Kagi FastGPT API for AI-powered answers
2. `/websearch` - Search for non-commercial web content using the Kagi Web Enrichment API
3. `/newssearch` - Search for non-commercial news content using the Kagi News Enrichment API
4. `/summarize` - Summarize URLs or text using the Kagi Universal Summarizer API

## Prerequisites

- [Discord Bot Token](https://discord.com/developers/applications)
- [Kagi API Key](https://kagi.com/settings?p=api)

And either:
- [Bun](https://bun.sh/) - JavaScript runtime and package manager

Or:
- [Docker](https://www.docker.com/get-started) and [Docker Compose](https://docs.docker.com/compose/install/)

## Setup

### Environment Configuration

Create a `.env` file in the root directory with the following content:
```
# Discord Bot Token
DISCORD_TOKEN=your_discord_token_here

# Discord Client ID
CLIENT_ID=your_client_id_here

# Kagi API Key
KAGI_API_KEY=your_kagi_api_key_here
```

### Using Bun (Local Development)

1. Install dependencies:
```bash
bun install
```

2. Start the bot:
```bash
bun start
```

### Using Docker

1. Build and start the Docker container:
```bash
docker compose up -d
```

To rebuild the container after code changes:
```bash
docker compose up -d --build
```

To view logs:
```bash
docker compose logs -f
```

To stop the container:
```bash
docker compose down
```

## Adding the Bot to Your Server

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications)
2. Select your application
3. Go to the "OAuth2" section
4. In the URL Generator, select the following scopes:
   - `bot`
   - `applications.commands`
5. In the bot permissions section, select:
   - `Send Messages`
   - `Embed Links`
   - `Use Slash Commands`
6. Copy the generated URL and open it in your browser to add the bot to your server

## Usage

Once the bot is added to your server, you can use the following slash commands:

### FastGPT
```
/fastgpt query: Your question here
```

### Web Search
```
/websearch query: Your search query
```

### News Search
```
/newssearch query: Your search query
```

### Universal Summarizer
For URLs:
```
/summarize url url: The URL to summarize [engine: Optional] [summary_type: Optional] [target_language: Optional]
```

For text:
```
/summarize text text: The text to summarize [engine: Optional] [summary_type: Optional] [target_language: Optional]
```

Available options:
- `engine`: 
  - `cecil` (Default) - Friendly, descriptive, fast
  - `agnes` - Formal, technical, analytical
  - `muriel` - Best-in-class, enterprise-grade ($1 per summary)
- `summary_type`:
  - `summary` (Default) - Paragraph(s) of prose
  - `takeaway` - Bulleted list of key points
- `target_language`: Various language options (EN, ES, FR, etc.)

## Pricing

The bot uses Kagi API which has the following pricing:

- FastGPT: 1.5¢ per query ($15 USD per 1000 queries)
- Web/News Enrichment: $2 per 1000 searches ($0.002 USD per search)
- Universal Summarizer:
  - Consumer models (Cecil, Agnes): $0.030 USD per 1,000 tokens processed
  - Enterprise model (Muriel): $1 USD per summary

## License

MIT