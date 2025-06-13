# Bamboo MCP Gateway

MCP Server that does Meta Ads operations for you—no technical knowledge required.

---

## 🚀 Features
- **Multi-provider authentication:** Facebook OAuth 2.0 & Pipeboard API token support
- **Meta Ads & PostgreSQL MCP proxy:** Route tool calls with `ads.` and `pg.` prefixes
- **Intelligent prompt seeding:** Company-specific context loaded from markdown
- **Company profile storage:** Flexible JSONB in Postgres
- **Redis caching & rate limiting:** 60 req/min per user
- **Comprehensive error handling & audit logging**
- **Enterprise-ready:** Docker, Kubernetes, Render.com, health checks, JWT/session management
- **TypeScript:** Type safety and maintainability

---

## 🏗️ Project Structure
- `gateway.ts` — Main MCP gateway logic
- `prompt-seeder.ts` — Loads and injects prompt context (see `prompts/company_specific_context.md`)
- `meta-ads.ts` — Meta Ads API proxy
- `postgres.ts` — PostgreSQL API proxy
- `service.ts` — Core service logic
- `prompts/` — Markdown prompt files (customizable)
- `Dockerfile`, `docker-compose.yml` — Containerization & deployment

---

## ⚡ Quick Start

### 1. Clone the repo
```bash
git clone https://github.com/jjwjr94/Bamboo-MCP.git
cd Bamboo-MCP
```

### 2. Configure environment
```bash
cp .env.example .env
# Edit .env with your credentials (Postgres, Redis, Facebook OAuth, etc)
```

### 3. Start services (Docker Compose recommended)
```bash
docker-compose up -d
```

### 4. Seed your company prompt (optional)
- Edit `prompts/company_specific_context.md` with your business context and guidelines.

### 5. Run tests
```bash
npm install
npm test
```

---

## 🧠 How Prompt Seeding Works
- On first tool use, the gateway injects company-specific context from `prompts/company_specific_context.md`.
- If the file is missing, a default template is used.
- Prompts are cached and managed per conversation/session.

---

## 🛠️ Deployment Options
- **Docker Compose:** For local/dev use
- **Render.com:** Cloud deployment (see `render.yaml`)
- **Kubernetes:** Enterprise container orchestration
- **Manual:** Traditional Node.js deployment

---

## 📚 Documentation
- See `Bamboo MCP Gateway.md` and `Bamboo MCP Gateway - Project Summary.md` for full architecture, API reference, and deployment guides.
- Example API usage: `api-usage-examples.md`
- Troubleshooting, environment templates, and more in the repo.

---

## 🤝 Contributing
- See `CONTRIBUTING.md` for guidelines.
- PRs and issues welcome!

---

## 📄 License
MIT
