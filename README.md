# Kagi Discord Bot

A Discord bot that integrates with the Kagi API to provide powerful search capabilities directly within Discord.

![image](https://github.com/user-attachments/assets/daa12b06-f3ae-4375-afb1-5ddd4714bdad)

## Features

This bot provides slash commands to interact with Kagi API:

1. `/fastgpt` - Query the Kagi FastGPT API for AI-powered answers
2. `/websearch` - Search for non-commercial web content using the Kagi Web Enrichment API
3. `/newssearch` - Search for non-commercial news content using the Kagi News Enrichment API
4. `/summarize` - Summarize URLs, text, or channel conversations using the Kagi Universal Summarizer API
5. `/search` - Search the web using Kagi's premium Search API with full results (Currently Invite Only - Contact support@kagi.com for access)
6. `/limits` - Check your remaining query limits

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

# Message Content Intent (set to 'true' to enable channel summarization)
# Note: For bots in more than 100 servers, Discord requires verification
# and approval to use this intent. Set to 'false' for large-scale bots.
MESSAGE_CONTENT_ENABLED=true

# Allow Commands in Direct Messages (set to 'true' to allow commands in DMs)
ALLOW_DM_COMMANDS=false

# Allow the expensive Muriel engine ($1 per summary)
ALLOW_MURIEL_ENGINE=false

# Create threads for results when needing to send more than one message (set to 'true' to automatically create threads)
CREATE_THREADS_FOR_RESULTS=true

# Query Limits Configuration
# Limits are per Discord user. Use -1 for unlimited.
# Available periods: hourly, daily, weekly, monthly

# Global query limit (applies to all commands combined)
QUERY_LIMIT_GLOBAL=50
QUERY_LIMIT_GLOBAL_PERIOD=daily

# Command-specific limits (optional)
QUERY_LIMIT_FASTGPT=20
QUERY_LIMIT_FASTGPT_PERIOD=daily

QUERY_LIMIT_WEBSEARCH=15
QUERY_LIMIT_WEBSEARCH_PERIOD=daily

QUERY_LIMIT_NEWSSEARCH=15
QUERY_LIMIT_NEWSSEARCH_PERIOD=daily

QUERY_LIMIT_SUMMARIZE=10
QUERY_LIMIT_SUMMARIZE_PERIOD=daily

QUERY_LIMIT_SEARCH=10
QUERY_LIMIT_SEARCH_PERIOD=daily

# Set to 'true' to persist query counts between bot restarts
QUERY_LIMITS_PERSIST=true
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
3. Go to the "Bot" section
4. If you want to use the channel summarization feature:
   - Enable the "Message Content Intent" under "Privileged Gateway Intents"
   - Note: For bots in more than 100 servers, Discord requires verification and approval for this intent
   - Set `MESSAGE_CONTENT_ENABLED=true` in your `.env` file
5. For bots in many servers (>100) without verified intents:
   - Set `MESSAGE_CONTENT_ENABLED=false` in your `.env` file
   - The `/summarize channel` command will be disabled automatically
6. Go to the "OAuth2" section
7. In the URL Generator, select the following scopes:
   - `bot`
   - `applications.commands`
8. In the bot permissions section, select:
   - `Send Messages`
   - `Embed Links`
   - `Use Slash Commands`
   - `Read Message History`
9. Copy the generated URL and open it in your browser to add the bot to your server

## Usage

Once the bot is added to your server, you can use the following slash commands:

### FastGPT
```
/fastgpt query: Your question here [cache: Optional] [split_response: Optional]
```

Available options:
- `cache`: Whether to allow cached responses (default: true)
- `split_response`: Split long responses into multiple messages instead of truncating (default: false)

### Web Search
```
/websearch query: Your search query
```

### News Search
```
/newssearch query: Your search query
```

### Search
```
/search query: Your search query [limit: Optional]
```

Available options:
- `limit`: Maximum number of results to display (1-10, default: 5)

### Universal Summarizer
For URLs:
```
/summarize url url: The URL to summarize [engine: Optional] [summary_type: Optional] [target_language: Optional]
```

For text:
```
/summarize text text: The text to summarize [engine: Optional] [summary_type: Optional] [target_language: Optional]
```

For channel messages (requires MESSAGE_CONTENT_ENABLED=true):
```
/summarize channel [messages: Optional] [engine: Optional] [summary_type: Optional] [target_language: Optional]
```

Available options:
- `engine`: 
  - `cecil` (Default) - Friendly, descriptive, fast
  - `agnes` - Formal, technical, analytical
  - `muriel` - Best-in-class, enterprise-grade ($1 per summary)
- `summary_type`:
  - `summary` - Paragraph(s) of prose
  - `takeaway` (Default) - Bulleted list of key points
- `target_language`: Various language options (EN, ES, FR, etc.)
- `messages`: Number of recent messages to include in channel summary (1-100, default: 20)

### Check Query Limits
```
/limits
```
Displays your remaining query counts for all commands, based on your server's configuration.

## Query Limits

The bot includes a configurable query limiting system to control API usage:

- **Per-User Tracking**: All limits are applied per Discord user ID
- **Global Limits**: Set a maximum number of queries across all commands
- **Command-Specific Limits**: Set separate limits for each command
- **Time Period Options**: Configure limits by hour, day, week, or month
- **Persistence**: Optionally persist query records between bot restarts

Configure limits in your `.env` file. Set any limit to `-1` for unlimited queries.

## Pricing

The bot uses Kagi API which has the following pricing:

- FastGPT: 1.5¢ per query ($15 USD per 1000 queries)
- Web/News Enrichment: $2 per 1000 searches ($0.002 USD per search)
- Search API: 2.5¢ per search ($25 USD per 1000 queries)
- Universal Summarizer:
  - Consumer models (Cecil, Agnes): $0.030 USD per 1,000 tokens processed (both input and output tokens)
  - Enterprise model (Muriel): $1 USD per summary regardless of token count

For convenience, the `/summarize` command displays estimated costs based on both input and output tokens.

## License

MIT
