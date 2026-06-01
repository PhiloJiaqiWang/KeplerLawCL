# Collaborative Learning Study App

A modular Next.js + TypeScript prototype for a room-based collaborative learning study.

## Quick Start

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Database Setup (PostgreSQL + Prisma)

This repo now includes Prisma configured for PostgreSQL (Railway-ready).

1. Copy env file and set connection string:
```bash
cp .env.example .env
```
2. Ensure `DATABASE_URL` points to a running Postgres database.
3. Create/apply migrations locally:
```bash
npm run db:migrate -- --name init
```
4. Generate Prisma client:
```bash
npm run db:generate
```

Useful commands:
- `npm run db:studio` (browse data)
- `npm run db:push` (sync schema without migration files)
- `npm run db:deploy` (apply committed migrations in production)

Railway deploy:
- Add a PostgreSQL service in Railway and connect it to this app.
- Railway injects `DATABASE_URL`.
- Use build command: `npm run railway:build`
- Use start command: `npm run start`

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
- full application data migrated from in-memory store to PostgreSQL
