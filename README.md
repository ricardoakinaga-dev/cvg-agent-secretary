# CVG Secretary Agent

AI-powered virtual receptionist for veterinary hospital, integrated with Chatwoot and OpenAI.

## Overview

The CVG Secretary Agent is an intelligent virtual assistant that handles customer service inquiries through the Chatwoot messaging platform. It uses OpenAI's GPT models to generate natural, contextually appropriate responses while maintaining strict safety guardrails for veterinary medical contexts.

## Phase 1 Status

This is the Phase 1 implementation which includes:

- ✅ Webhook endpoint for Chatwoot
- ✅ Message normalization
- ✅ Basic deduplication (Redis-based)
- ✅ Conversation context management
- ✅ OpenAI integration for response generation
- ✅ Response sending back to Chatwoot
- ✅ Structured logging
- ✅ Health check endpoints

### Out of Scope (Phase 1)

- Persistent memory (Phase 2)
- RAG/Knowledge base (Phase 3)
- Advanced handoff system (Phase 4)
- Telegram ingestion (Phase 5)

## Project Structure

```
src/
├── config/              # Configuration management
├── modules/
│   ├── chatwoot/       # Chatwoot integration (normalizer, client)
│   ├── conversations/  # Conversation context management
│   ├── logging/        # Structured logging
│   ├── openai/         # OpenAI client and prompts
│   └── runtime/        # Agent runtime orchestrator
├── shared/              # Shared types and utilities
│   ├── redis.ts        # Redis client
│   └── types.ts        # TypeScript interfaces
├── app.ts              # Express application
└── server.ts           # Server entry point
```

## Prerequisites

- Node.js 18+
- Redis
- PostgreSQL
- Chatwoot account
- OpenAI API key

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your credentials
   ```

3. **Set up database:**
   ```bash
   psql -U postgres -d cvg_agent -f database/schema.sql
   ```

4. **Start the server:**
   ```bash
   # Development
   npm run dev

   # Production
   npm run build
   npm start
   ```

## Configuration

| Variable | Description | Required |
|----------|-------------|----------|
| `NODE_ENV` | Environment (development/production) | Yes |
| `PORT` | Server port (default: 3000) | Yes |
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `REDIS_URL` | Redis connection URL | Yes |
| `OPENAI_API_KEY` | OpenAI API key | Yes |
| `CHATWOOT_API_URL` | Chatwoot instance URL | Yes |
| `CHATWOOT_API_TOKEN` | Chatwoot API token | Yes |
| `CHATWOOT_ACCOUNT_ID` | Chatwoot account ID | Yes |

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check with dependency status |
| `/ready` | GET | Readiness probe |
| `/webhooks/chatwoot` | POST | Chatwoot webhook receiver |

## Testing

```bash
# Run all tests
npm test

# Run tests with coverage
npm test -- --coverage
```

## Chatwoot Webhook Setup

1. Go to Chatwoot → Settings → Integrations → Webhooks
2. Add new webhook:
   - **URL**: `https://your-domain.com/webhooks/chatwoot`
   - **Events**: Select `message_created`, `conversation_created`
3. Configure the webhook secret in `.env` for signature verification (optional)

## Agent Persona

The agent is programmed with the following characteristics:

- **Tone**: Educated, friendly, professional
- **Language**: Portuguese (Brazil)
- **Behavior**: 
  - Never provides medical diagnoses
  - Never prescribes medications
  - Always suggests veterinary consultation for health concerns
  - Escalates to human agent for complex situations

## Future Phases

See [PHASES.md](specs/PHASES.md) for detailed roadmap:

- **Phase 2**: Persistent memory and customer data
- **Phase 3**: RAG knowledge base
- **Phase 4**: Full handoff system
- **Phase 5**: Telegram ingestion
- **Phase 6**: Security and observability

## License

Proprietary - CVG Hospital Veterinário
