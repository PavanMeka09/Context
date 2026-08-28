# Context AI — Autonomous Agent & Chat Workstation

 Context is an advanced, production-grade autonomous AI workspace featuring real-time web browsing capabilities via Puppeteer, privacy-focused search with SearXNG, automated background task scheduling, code execution sandbox, and Google Gemini API integration via Vercel AI SDK.

## 🌟 Key Features

- 🌐 **Autonomous Browser Control**: Puppeteer-powered background browser agent with live frame streaming, self-healing element selectors, interactive step inspection, and session management.
- 🚀 **Crawl4AI Integration**: LLM-optimized web crawler & markdown engine with token reduction metrics, media parsing, and CSS/JSON structured extractions.
- 🔍 **Privacy Search Integration**: Automated SearXNG integration for fast, privacy-preserving live web search queries.
- ⏰ **Scheduled Background Tasks**: Cron-driven background task runner (`node-cron`) for recurring browser web scraping and LLM summaries.
- 🛡️ **Execution Sandbox & Safety**: Isolated Python and Node.js execution sandbox with safety pattern detection blocking destructive operations.
- ⚡ **Production Hardened**: Comprehensive Vitest test suite, React `ErrorBoundary` fault tolerance, `/api/health` probes, dynamic CORS, and container healthchecks.

---

## 🏗️ System Architecture

```
                               ┌─────────────────────────┐
                               │   Context Web UI        │
                               │ (React + Vite + Tailw.) │
                               └────────────┬────────────┘
                                            │
                 ┌──────────────────────────┴──────────────────────────┐
                 │                                                     │
                 ▼                                                     ▼
       ┌──────────────────┐                                   ┌──────────────────┐
       │ Companion Server │                                   │ SearXNG Search   │
       │  (Express 5.x)   │                                   │ (Docker Service) │
       └────────┬─────────┘                                   └──────────────────┘
                │
     ┌──────────┴──────────┐
     ▼                     ▼
┌──────────────┐   ┌───────────────┐
│ Puppeteer    │   │ Code Executor │
│ Browser Engine│  │ (Python/Node) │
└──────────────┘   └───────────────┘
```

---

## 🚀 Quick Start

### 1. Prerequisites
- **Node.js**: `v20.x` or higher
- **npm**: `v10.x` or higher
- **Docker & Docker Compose** (Optional, for containerized deployment)

### 2. Installation
```bash
# Clone the repository
git clone https://github.com/your-org/context.git
cd context

# Install dependencies
npm install
```

### 3. Running Locally in Development Mode
```bash
# Start the Express companion server
npm run server

# In another terminal, start the Vite development server
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## 🧪 Testing & Code Quality

Context includes a test suite powered by [Vitest](https://vitest.dev/) and [@testing-library/react](https://testing-library.com/).

```bash
# Run unit and integration tests
npm test

# Run ESLint check
npm run lint

# Build production bundle
npm run build
```

---

## 🐳 Docker Deployment

Deploy the entire stack (React UI, Puppeteer Companion Server, SearXNG) using Docker Compose:

```bash
# Build and start all services in detached mode
docker compose up -d --build
```

Access services at:
- **Context UI**: [http://localhost:3000](http://localhost:3000)
- **Companion Server**: [http://localhost:3001](http://localhost:3001)
- **Companion Health Probe**: [http://localhost:3001/api/health](http://localhost:3001/api/health)
- **SearXNG Engine**: [http://localhost:8082](http://localhost:8082)

---

## ⚙️ Environment Variables

Copy `.env.example` to `.env` to customize runtime settings:

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3001` | Express companion server port |
| `CORS_ORIGIN` | `*` | Allowed CORS origins (comma-separated for production) |
| `SEARXNG_URL` | `http://localhost:8082` | Endpoint URL for SearXNG search engine |
| `DATA_DIR` | `~/.context-ai` | Storage directory for schedules and runs database |
| `PUPPETEER_EXECUTABLE_PATH` | System Chromium | Path to custom Chromium executable |

---

## 📄 Health Check API

The companion server exposes a `/api/health` probe endpoint for container orchestration:

```json
{
  "status": "ok",
  "timestamp": "2026-08-01T17:06:00.000Z",
  "uptime": 124.5,
  "activeSessions": 1,
  "browserConnected": true,
  "pythonCommand": "python3",
  "version": "1.0.0"
}
```

---

## 📜 License

MIT License. See `LICENSE` for details.
