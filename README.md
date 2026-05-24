# Collaborative Learning Study App

A modular Next.js + TypeScript prototype for a room-based collaborative learning study.

## Quick Start

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Documentation

- Detailed architecture and code walkthrough: `docs/ARCHITECTURE.md`

## Current Scope

Implemented:
- landing page with `roomId` entry
- role selection with `Participant A / Participant B`
- room layout with simulation placeholder, shared chat, event log, and top context bar
- server-side role exclusivity enforcement
- in-memory mock backend

Not yet implemented:
- real orbit simulation
- LLM API integration
- persistent storage
