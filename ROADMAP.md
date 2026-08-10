# Context AI — Feature Roadmap & Enhancement Proposals

This document outlines proposed features, technical improvements, and architectural enhancements for the **Context AI Workstation** to elevate its capabilities, performance, and user experience.

---

## 🏗️ System Overview & Objectives

Context AI is an autonomous agent workspace combining real-time web browsing (Puppeteer), privacy-focused search (SearXNG), background task scheduling (`node-cron`), isolated code execution, and LLM reasoning. 

The proposed features aim to:
1. Expand model flexibility (Local LLMs, multi-provider options).
2. Deepen agentic autonomy via dynamic function calling (ReAct loops).
3. Improve web automation resilience (cookie persistence, anti-bot handling, content cleaning).
4. Enhance developer experience with split-screen views, interactive live artifacts, and persistent RAG memory.
5. Provide enterprise-grade safety, structured web data extraction, multi-agent swarms, visual workflows, and air-gapped privacy.

---

## 🎯 Feature Proposals by Category

### 1. 🤖 LLM & Agent Capabilities

#### A. Dynamic Multi-Tool Function Calling Loop (ReAct Agent)
* **Description**: Upgrade the Vercel AI SDK integration (`streamText`) in `llm.cjs` to expose browser control, code execution, web search, and task scheduling directly as dynamic tool definitions.
* **Benefits**: Enables the AI to autonomously plan and execute multi-step tool calls (e.g., search web $\rightarrow$ scrape page $\rightarrow$ run python calculation $\rightarrow$ schedule summary task) in a single unified prompt flow.

#### B. Multi-Provider & Local LLM Support (Ollama / OpenAI / Anthropic)
* **Description**: Abstract the LLM client layer in `server/llm.cjs` to support multiple model providers alongside Google Gemini (`@ai-sdk/google`).
* **Benefits**: Offline privacy via local models (Ollama, vLLM), plus access to OpenAI (GPT-4o, o3-mini) and Anthropic (Claude 3.5 Sonnet).

#### C. Multi-Agent Swarm Orchestration
* **Description**: Allow Context to spawn specialized sub-agents (e.g., *Researcher Agent*, *Code Evaluator Agent*, *Scraper Agent*) that work in parallel on complex multi-part user requests.
* **Benefits**: Dramatically reduces task completion time for multi-source research or heavy automation workloads.

#### D. Real-Time Audio / Voice Stream Agent (WebRTC / Gemini Live)
* **Description**: Enable bidirectional real-time audio interaction with the agent using WebRTC or WebSocket streaming (e.g., OpenAI Realtime API or Gemini Live).
* **Benefits**: Hands-free real-time voice conversations while watching the Puppeteer browser stream act on instructions live.

---

### 2. 🌐 Web Browser Agent & Vision AI

#### A. Visual Bounding-Box Overlay (OmniParser Style)
* **Description**: Render numbered visual bounding boxes over interactive web elements directly on the live Puppeteer frame stream.
* **Benefits**: Improves LLM vision model accuracy when selecting buttons, inputs, and links on complex JavaScript-heavy web applications.

#### B. Persistent Browser Profiles & Session Cookie Store
* **Description**: Add persistent browser user profiles saved to disk (`DATA_DIR/profiles/`).
* **Benefits**: Maintains login sessions, cookies, and localStorage across automated browser runs so tasks can act inside authenticated portals.

#### C. Smart Page Content Extraction (Readability + Turndown)
* **Description**: Process HTML pages through `@mozilla/readability` and `turndown` before sending content to the LLM.
* **Benefits**: Strips out ads, navigation boilerplate, and scripts, reducing LLM token consumption by up to 70%.

#### D. Structured Web Data Extraction (JSON Schema / Zod)
* **Description**: Scrape any webpage into typed, structured JSON matching a user-defined Zod or JSON Schema.
* **Benefits**: Turn unstructured HTML pages into clean datasets (price tracking, job boards, news aggregators).

#### E. DOM Snapshot & Diff Tracker
* **Description**: Compare web page snapshots over scheduled cron runs and detect visual or textual changes.
* **Benefits**: Notifies users when a price drops, a competitor updates a page, or a web element changes.

---

### 3. ⚡ Visual Automation & Workflow Builder

#### A. Drag-and-Drop Visual Workflow Editor (Node Editor)
* **Description**: Integrate a visual node-based workflow builder (using React Flow) allowing users to construct complex automation pipelines without code.
* **Benefits**: Visually link triggers (`Cron Schedule`, `Webhook`), actions (`Puppeteer Scrape`, `Python Code`), and outputs (`Telegram Alert`, `Database Store`).

#### B. TOTP 2FA Auto-Authenticator Protocol
* **Description**: Integrate a TOTP seed key manager to automatically generate 2FA verification codes during automated browser login flows.
* **Benefits**: Unlocks fully automated end-to-end access to MFA-protected web services.

---

### 4. 🛡️ Security, Vault & Air-Gapped Privacy

#### A. Encrypted Secret Manager (Credentials Vault)
* **Description**: Build a secure AES-256 encrypted credential store (`DATA_DIR/vault.enc`) to manage API keys, web logins, proxy passwords, and SSH keys.
* **Benefits**: Keeps sensitive credentials safe from plain-text exposure in prompts or config files.

#### B. Human-in-the-Loop (HITL) Approval Gate
* **Description**: Intercept high-risk actions (e.g., destructive code execution, web form submissions, payment buttons, deleting files) and require explicit user confirmation via UI modal.
* **Benefits**: Prevents unintentional actions or dangerous side-effects during autonomous runs.

#### C. Air-Gapped / Offline Private Mode
* **Description**: A one-click toggle that blocks all outbound external internet calls and routes reasoning strictly through local Ollama models, local SearXNG, and local sandboxed Python.
* **Benefits**: Meets enterprise compliance for strict data privacy and zero cloud leakage.

---

### 5. 💻 Sandbox, Data Science & Workspace Indexing

#### A. Interactive Plotly / Recharts Visualizer
* **Description**: Capture pandas DataFrames and matplotlib outputs in the Python sandbox and render interactive charts directly in the chat window.
* **Benefits**: Provides immediate visual analytics for CSVs, Excel files, and web-scraped tabular data.

#### B. Export to Jupyter Notebook (`.ipynb`) / PDF Reports
* **Description**: Export any chat session, code executions, and browser scrape results into a clean, reproducible Jupyter Notebook or styled PDF report.
* **Benefits**: Easy sharing and publishing of agent research and data analysis workflows.

#### C. Local Codebase Indexing & Git Integration
* **Description**: Allow Context to read local software repositories, understand project structure, generate git diffs, and create branch/commit proposals.
* **Benefits**: Functions as an in-repo autonomous coding assistant.

---

### 6. 💾 Data Persistence & Memory (RAG)

#### A. SQLite Persistence Layer Migration
* **Description**: Replace file-based JSON storage (`readJSON`/`writeJSON`) with SQLite (via `better-sqlite3` or Drizzle ORM).
* **Benefits**: Guarantees ACID compliance, transactional integrity, indexing, and faster execution log querying under concurrent background tasks.

#### B. Local Vector Database for Long-Term Memory (RAG)
* **Description**: Integrate a lightweight embedded vector database (SQLite VSS, LanceDB, or Voy) for chat memory and document search.
* **Benefits**: Retains knowledge across chat sessions, allowing the agent to recall user preferences, past research findings, and uploaded files.

---

### 7. 🔔 Notifications & Webhook Triggers

#### A. Multi-Channel Task Alerts (Slack / Discord / Telegram / Webhook)
* **Description**: Add configurable alert destinations for background scheduled tasks.
* **Benefits**: Sends automated notifications and execution summaries directly to chat apps when background jobs complete or detect changes.

#### B. Incoming Webhook Triggers
* **Description**: Expose HTTP endpoint `/api/webhooks/trigger/:scheduleId` to allow external tools (GitHub Actions, Zapier, n8n) to run Context tasks on demand.
* **Benefits**: Enables seamless integration into existing devops and automation workflows.

---

### 8. 🎨 UI/UX & Workstation Enhancements

#### A. Split-Screen Resizable Layout
* **Description**: Implement a drag-to-resize split-screen dashboard view.
* **Benefits**: Side-by-side workspace: main chat on the left, live Puppeteer stream, code sandbox output, or interactive artifact preview on the right.

#### B. Voice Input / Speech-to-Text Integration
* **Description**: Add a voice recording button in `Composer.tsx` using the native Web Speech API.
* **Benefits**: Hands-free prompt composition for accessibility and convenience.

---

## 🗺️ Extended Execution Roadmap

```mermaid
graph TD
    subgraph Phase 1: Foundation, Safety & Secret Vault
        P1A[Multi-Provider LLM: Ollama / OpenAI / Anthropic]
        P1B[SQLite Database Migration]
        P1C[Encrypted Secret Vault AES-256]
        P1D[Human-in-the-Loop Approval Gate]
    end

    subgraph Phase 2: Autonomous Core & Visual Artifacts
        P2A[Dynamic ReAct Function Calling Loop]
        P2B[Smart Page Extraction & Structured JSON]
        P2C[Visual Bounding-Box Overlay]
        P2D[Live Interactive Artifacts Canvas & Charts]
    end

    subgraph Phase 3: Workflows, Swarms & Air-Gapped Mode
        P3A[Drag-and-Drop Visual Workflow Editor]
        P3B[Multi-Agent Swarm Orchestration]
        P3C[TOTP 2FA Auto-Authenticator]
        P3D[Air-Gapped Offline Mode]
        P3E[Multi-Channel Alerts: Telegram/Slack]
        P3F[Split-Screen Workspace Layout]
    end

    P1A --> P2A
    P1B --> P2A
    P1C --> P3C
    P1D --> P2A
    P2A --> P3A
    P2B --> P3A
    P2C --> P3A
    P2D --> P3F
```
