# Bamboo MCP – All‑in‑One Gateway (Meta Ads + PostgreSQL)

**Version:** 0.2  **Author:** Jay Wong  **Date:** 12 Jun 2025

---

## 1  Purpose

Bamboo MCP delivers **one MCP URL** that merges two upstream tool servers—**Meta Ads** and **PostgreSQL**—so teammates simply paste a single link into Claude (or any MCP‑aware client). A shared company‑wide system prompt is auto‑injected on the first turn of each new conversation.

---

## 2  Goals

| ID | Goal                         | Success Metric                                                    |
| -- | ---------------------------- | ----------------------------------------------------------------- |
| G1 | **Single‑link setup**        | Users connect one MCP URL and authenticate Meta Ads in ≤ 2 clicks |
| G2 | Persist company profile JSON | Profile fetch latency < 100 ms P99                                |
| G3 | Keep stack minimal           | ≤ 4 core dependencies & single Docker image                       |

---

## 3  Key Features

1. **Gateway proxy** – Implements `/manifest`, `/sse`, `/stream`; forwards calls to the proper upstream via prefix (`ads.` or `pg.`).
2. \*\*Prompt seeding – Detects the first Ads/PG tool call and injects **a lightweight **``** pointer** instead of full text. Pointer keeps per‑turn overhead ≈ 20 tokens, while the **actual 100‑KB Markdown prompt** is fetched only when Claude dereferences `mcp://bamboo/prompts/team_default_context.md`.

- Sticky: same pointer is prepended on every future turn so the context never scrolls out.

3. **Company profile storage** – CRUD helpers that save/retrieve a JSON profile per company in Postgres; exposed as `get_company_profile` tool and via MCP *resource* block.

---

## 6  Tech Stack (Minimal)

| Layer             | Choice                      | Rationale                                             |
| ----------------- | --------------------------- | ----------------------------------------------------- |
| **Runtime**       | **Node.js 20 + Express**    | Lightweight; many MCP examples                        |
| **Language**      | TypeScript (strict)         | Safer refactors                                       |
| **Data Store**    | Supabase Postgres           | Hosted SQL; doubles for profile storage               |
| **Cache / Flags** | Redis Cloud (free)          | Store `seeded:{conversation}` flags & Meta Ads tokens |
| **Auth**          | Passport‑Facebook OAuth 2.0 | Handles Meta Ads token exchange                       |
| **Hosting**       | Render.com (Docker)         | One‑click deploy + HTTPS                              |
| **Local tunnel**  | Cloudflare Tunnel           | Expose local HTTPS for testing                        |

---

## 7  Quick Start

```bash
# 1 Clone template
npx degit mcp‑templates/mcp‑gateway bamboo‑mcp && cd bamboo‑mcp

# 2 Configure upstreams
cp .env.example .env   # fill PG_URL, REDIS_URL, FB_APP_ID/SECRET

# 3 Run locally
docker compose up --build
# Local endpoint: https://localhost:8443/sse
```

---

## 8  Data Model (Postgres)

```sql
CREATE TABLE company_profiles (
  company_id UUID PRIMARY KEY,
  json_data  JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

---

## 9  Security Notes

- JWT issued after Meta Ads OAuth; Gateway verifies `Authorization: Bearer <JWT>` on each request.
- Rate‑limit: 60 tool calls / minute / user via Redis.
- CORS locked to Anthropic endpoints by default.

---

## 10  Future Enhancements

- Swap Redis for Cloudflare D1 to remove extra service.
- Add `sampling/createMessage` support when Claude Desktop ships Sampling spec.
- UI dashboard for tool calls & profile edits.

---

> **Status:** Updated to reflect Meta Ads + PostgreSQL‑only scope & single‑link onboarding.

