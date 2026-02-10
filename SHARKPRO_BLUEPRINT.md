# SHARKPRO_BLUEPRINT.md

## 1. Project Overview
SharkPro V2 is a Multi-tenant SaaS AI Automation platform for WhatsApp (via Chatwoot).
It migrates logic from n8n/Flowise to a High-Code Python architecture using FastAPI, RabbitMQ, Redis, and OpenAI.

### 1.1 Infrastructure Constraints (Strict)
- **Host:** Hetzner VPS (2 vCPU / 2GB RAM) managed by aaPanel.
- **External Services:**
  - RabbitMQ: `rabbit.byduo.com.br` (Port: 5672). Virtual Host: `/sharkpro`.
  - Database: Supabase (Postgres Managed).
- **Internal Services (Docker):**
  - Redis: Must run as a service named `shark_redis` in `docker-compose.yml`.
  - Backend: Python 3.12 Slim.
  - Frontend: Next.js 15 Standalone.

## 2. Architecture & Stack

### 2.1 Backend (`/backend`)
- Framework: FastAPI (Async).
- Worker: Python Script using `aio_pika` (Async RabbitMQ Client).
- Buffer/Cache: `redis-py` (Async).
- AI: OpenAI API (GPT-4o + Whisper).
- Package Manager: pip (`requirements.txt`).

### 2.2 Frontend (`/frontend`)
- Framework: Next.js 15 (App Router).
- UI: TailwindCSS + ShadCN UI + Lucide React.
- Auth: Supabase Auth (SSR).
- State: Server Components + React Hooks.

### 2.3 Database Schema (Supabase)
- RLS (Row Level Security): ENABLED on all tables.
- Multi-tenancy: All tables must have `organization_id`.

## 3. Detailed Development Phases

### PHASE 1: Database & Security (Supabase SQL)
**Action:** Generate a `schema.sql` file to be executed in Supabase SQL Editor.

**Schema Requirements:**

- **`organizations`** table:
  - `id` (uuid, PK), `name` (text), `created_at`.
  - Config Columns: `chatwoot_account_id` (int), `chatwoot_url` (text), `chatwoot_token` (text), `openai_api_key` (text), `system_prompt` (text).

- **`profiles`** table:
  - `id` (uuid, references `auth.users`), `organization_id` (references `organizations`), `role` (admin/member).

- **`leads`** table:
  - `id`, `organization_id`, `contact_id` (Chatwoot ID), `name`, `phone`, `status`, `conversion_value`, `created_at`.

- **`sales_metrics`** table:
  - `id`, `organization_id`, `amount`, `source` ('ai' or 'human'), `created_at`.

- **RLS Policies:**
  - Users can only SELECT/INSERT/UPDATE if `auth.uid()` matches a profile in the same `organization_id`.

### PHASE 2: Backend Core (Python)
**Action:** Create `/backend` structure.

#### 2.1 API Ingestion (`src/api/main.py`)
- Endpoint: `POST /webhooks/chatwoot`
- Logic:
  1. Validate Payload (Ignore if `event != message_created` or `message_type != incoming`).
  2. Extract `account_id` from payload.
  3. Publish payload to RabbitMQ Exchange `bot_events` with routing key `incoming`.
  4. Return `200 OK` immediately (Fire-and-forget).

#### 2.2 The Worker (`src/worker/consumer.py`)
- Connection: Connect to External RabbitMQ & Internal Redis.
- Logic (The Loop):
  1. **Consumption:** Listen to queue bound to `bot_events`.
  2. **Debounce Pattern (Redis):**
     - Key: `buffer:{conversation_id}`.
     - Action: `RPUSH` message content. `EXPIRE` key 2 seconds.
     - Wait: If key exists, wait. If key expires, process all messages joined by `\n`.
  3. **Audio Handling:**
     - Check attachments. If `file_type == 'audio'`, download file to `/tmp`.
     - Call `openai.Audio.transcribe("whisper-1")`.
     - Replace message text with transcription.
  4. **Context Retrieval:**
     - Query Supabase `organizations` table using `account_id`. Get `system_prompt` and keys.
  5. **AI Execution:**
     - Call OpenAI ChatCompletion.
     - Tools:
       - `transfer_to_human()`: Calls Chatwoot API `toggle_status` to 'open'. Stops bot.
       - `register_lead(name, phone)`: Inserts into `leads` table.
  6. **Sales Tracking:**
     - Check payload labels. If `venda_concluida` exists, insert into `sales_metrics`.

### PHASE 3: Frontend Dashboard (Next.js)
**Action:** Create `/frontend` structure.

#### 3.1 Configuration (`next.config.js`)
- **CRITICAL:** Set `output: 'standalone'` to minimize RAM usage on the 2GB VPS.

#### 3.2 Pages (`/app`)
- `/login`: Supabase Auth UI.
- `/dashboard` (Protected):
  - KPI Cards: Total Leads, Sales Volume, AI Efficiency.
  - Chart: Bar chart of leads over last 30 days.
- `/dashboard/settings`:
  - Form to update `system_prompt`. This allows each tenant to customize their AI personality.
- `/dashboard/leads`:
  - Datatable fetching from `leads` table.

### PHASE 4: DevOps & Deployment
**Action:** Containerize everything.

#### 4.1 Dockerfiles
- **Backend:** Use `python:3.12-slim`. Install `uvicorn`, `fastapi`, `aio_pika`, `supabase`, `openai`, `redis`.
- **Frontend:** Multi-stage build (deps -> builder -> runner). Ensure `COPY --from=builder /app/.next/standalone ./.`

#### 4.2 Docker Compose (`docker-compose.yml`)
- Service `backend`: Port `8000:8000`. Env file `.env`.
- Service `frontend`: Port `3000:3000`. Env file `.env`.
- Service `shark_redis`: Image `redis:alpine`. Volume `redis_data:/data`.
- Network: `shark_net`.

#### 4.3 Environment Variables (`.env`)
```
RABBITMQ_URL=amqp://user:pass@rabbit.byduo.com.br:5672/sharkpro
SUPABASE_URL=...
SUPABASE_SERVICE_KEY=... (For Backend)
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=... (For Frontend)
REDIS_URL=redis://shark_redis:6379/0
OPENAI_API_KEY=...
```
