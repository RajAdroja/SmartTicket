# SmartTicket: The Multi-Tenant Support Ecosystem

SmartTicket is a production-ready, AI-driven customer support platform designed for modern SaaS companies. It bridges the gap between automated AI self-service and high-touch human support through a seamless, real-time ecosystem.

--- Project Architecture

<img width="6737" height="4045" alt="UDP Communication Timeout-2026-04-30-182811" src="https://github.com/user-attachments/assets/58a49a33-9dcd-49d8-98b0-9ef2242a1ae6" />


--- User Workflow Diagram

<img width="3569" height="6323" alt="UDP Communication Timeout-2026-04-30-182941" src="https://github.com/user-attachments/assets/00152fa8-4661-4771-b297-f96c4fe4fab8" />


---

## Key Features

### 1. RAG-Powered AI Agent (Gemini)

- **Context-Aware Responses**: Uses Google's Gemini 2.5 Flash to answer customer queries using a Retrieval-Augmented Generation (RAG) knowledge base.
- **Smart Escalation**: Automatically detects when a user is frustrated or when a question is outside the AI's knowledge, triggering a seamless handoff to a human agent.
- **Sentiment Analysis**: Monitors chat tone to prioritize urgent or angry customers.

### 2. Hard Data Isolation (Multi-Tenancy)

- **Company Scoping**: Each company (e.g., AcmeCorp, FlowMint) has its own private Knowledge Base and security tokens.
- **Zero Leakage**: The AI is strictly limited to the data of the company currently being served.

### 3. Professional Agent Dashboard

- **Real-Time Monitoring**: Built with Socket.io for instant ticket updates and typing indicators.
- **AI Sidekick**: Provides agents with AI-generated summaries, suggested tags, and smart reply templates to resolve tickets 50% faster.
- **Live Metrics**: Integrated analytics dashboard showing CSAT, resolution times, and AI efficiency.

### 4. Embeddable Support Widget

- **Plug-and-Play**: A single script tag that companies can drop into any website to instantly add support capabilities.
- **Themed Interface**: Beautiful, responsive UI that matches the hosting brand's aesthetics.

---

## Technical Stack

| Component      | Technology                                      |
| :------------- | :---------------------------------------------- |
| **Frontend**   | React 18, Vite, Material UI (MUI), Lucide Icons |
| **Backend**    | Node.js, Express, Socket.io                     |
| **Database**   | MongoDB Atlas (Persistent Storage)              |
| **AI / LLM**   | Google Gemini 2.5 Flash (SDK 1.x)               |
| **DevOps**     | Docker, Docker Compose (Containerization)       |
| **Deployment** | Vercel (Frontend), Render (Backend)             |

---

## Project Structure

```text
SmartTicket/
├── client/                 # React Frontend (Agent Dashboard & Widget)
│   ├── src/components/     # UI Components (Chat, Layout, Metrics)
│   ├── src/context/        # TicketContext (Real-time Socket Logic)
│   └── src/pages/          # Agent Dashboard & Customer Views
├── server/                 # Express Backend
│   ├── src/index.ts        # Main Server & Socket Handlers
│   ├── src/gemini.ts       # AI Engine & Prompt Engineering
│   └── src/store.ts        # MongoDB Models & KB Logic
├── docker-compose.yml      # Multi-container Orchestration
└── README.md
```

---

## API Documentation

### Chat & AI

- `POST /api/chat`: Main AI entry point. Handles history, company context, and escalation decisions.
- `POST /api/suggest-replies`: Generates context-aware reply templates for agents.

### Knowledge Base (KB)

- `GET /api/kb`: Fetches the KB content for a specific company.
- `POST /api/kb/upload`: Accepts PDF uploads and extracts text for AI training.
- `POST /api/company/register`: Generates unique security tokens for new tenants.

### Management & Metrics

- `GET /api/tickets`: Fetches all active tickets for the agent dashboard.
- `GET /api/metrics`: Real-time calculation of resolution rates and agent performance.
- `POST /api/feedback`: Records AI helpfulness scores for continuous improvement.

---

## Team Roles & Contributions

- **Raj Adroja (Lead Developer)**: Architected the multi-tenant system, designed the Agent Dashboard UI, implemented Docker containerization, and managed production deployment on Vercel, Render, and MongoDB Atlas.
- **Manish Maryala (Backend & Analytics)**: Implemented the Agent Performance Dashboard, auto-assignment engine, and the Widget Embed Generator for secure multi-tenancy.
- **Venkat Sai Kedari Nath Gandham (UI/UX Developer)**: Developed real-time UI components including status badges, CSAT ratings, and the dynamic SLA tracking system.
- **Sai Tareesh Reddy Eppeti (Features & Integration)**: Built the ticket search and labeling system, the agent transfer workflow, and enhanced the Knowledge Base guided Gemini responses.
- **Jianan Peng (QA & Documentation)**: Focused on quality assurance, system testing across multiple browser environments, and project documentation.
- **Antigravity (AI Coding Assistant)**: Collaborated on the Gemini RAG implementation, prompt engineering for "Smart Escalation," and real-time socket optimization.

---

## Reflection: Trade-offs & Lessons

### Challenges

- **Real-Time Sync**: Managing state between the AI bot, the customer widget, and multiple agents simultaneously required robust Socket.io room management.
- **LLM Latency**: Gemini is fast, but we implemented "Typing Indicators" to ensure the customer never felt the bot was "frozen."
- **Prompt Precision**: Balancing AI confidence (so it doesn't escalate too much) while maintaining safety (so it doesn't give wrong advice) was an iterative process.

### Responsible AI Usage

We used Gemini as a **Tier-1 assistant**. Every AI response includes a "Talk to Human" escape hatch, and the system is strictly instructed never to hallucinate billing actions. We implemented **Explainability** in the Agent Dashboard so agents can see _why_ the AI decided to escalate a specific ticket.

---

## Setup Instructions

### Option A: Docker Quickstart (Recommended)

If you have Docker installed, you can spin up the entire stack with one command:

```bash
docker-compose up --build
```

### Option B: Manual Setup

1.  **Clone the repo**
2.  **Server Setup**:
    ```bash
    cd server
    npm install
    # Create .env with MONGO_URI and GEMINI_API_KEY
    npm run dev
    ```
3.  **Client Setup**:
    ```bash
    cd client
    npm install
    # Create .env with VITE_API_URL
    npm run dev
    ```

---

**SmartTicket** — _Elevating support with the speed of AI and the heart of a human._
