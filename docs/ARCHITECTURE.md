# Collaborative Learning Study App: Code Architecture Document

## 1. Purpose and Scope

This project is a modular Next.js + TypeScript prototype for a collaborative learning study.

It currently provides:
- Room entry
- Role selection (`Participant A` / `Participant B`)
- Shared room view with:
  - simulation placeholder (left)
  - shared chat (right)
  - event log (bottom)
  - room context bar (top)
- Role exclusivity (two users cannot take the same role)
- Mock backend behavior using server memory (no database yet)

It intentionally does not include:
- Real orbit simulation
- LLM API integration
- Persistent storage across server restarts
- Authentication/authorization

## 2. Technology Stack

- Framework: Next.js (App Router)
- Language: TypeScript
- UI: React + Tailwind CSS utility classes
- State (server): In-memory `Map` in `roomStore.ts`
- State (client): Local React state + polling for refresh
- API: Next.js route handlers under `src/app/api/...`

## 3. High-Level Architecture

The app separates concerns into three layers:

1. Page/Route Layer (`src/app/**`)
- Defines navigation and URL-driven flows.
- Maps user steps: enter room -> select role -> join room.

2. Component Layer (`src/components/**`)
- Encapsulates UI and interaction logic into modular units.
- `RoomManager` composes feature components.

3. Domain + Data Layer (`src/lib/**`)
- Type definitions (`types.ts`) define canonical room schema.
- `roomStore.ts` implements room lifecycle and mutation rules.

### Data Flow Summary

1. User enters `roomId` on landing page.
2. App navigates to role page for that room.
3. Role page fetches room state and attempts role join through API.
4. Joined user is redirected to room page with role in query string.
5. Room page mounts `RoomManager`, which:
- polls room state periodically
- posts chat messages
- updates agent condition
6. Mutations are processed by API handlers via `roomStore`.
7. Updated room state returns to client and re-renders panels.

## 4. Directory and File Structure

```text
src/
  app/
    layout.tsx
    globals.css
    page.tsx

    rooms/[roomId]/
      page.tsx
      role/page.tsx

    api/rooms/[roomId]/
      route.ts
      join/route.ts
      messages/route.ts
      agent/route.ts

  components/
    RoomManager.tsx
    RoleSelector.tsx
    SimulationRunner.tsx
    ChatRoom.tsx
    AgentController.tsx
    EventLogger.tsx

  lib/
    types.ts
    roomStore.ts
```

## 5. Routing and User Journey

### 5.1 Landing Page
File: `src/app/page.tsx`

Responsibilities:
- Capture free-form room ID
- Navigate to role-selection route

Route transition:
- `/` -> `/rooms/{roomId}/role`

### 5.2 Role Selection Page
File: `src/app/rooms/[roomId]/role/page.tsx`

Responsibilities:
- Fetch room snapshot (`GET /api/rooms/{roomId}`)
- Display role availability via `RoleSelector`
- Submit join attempt (`POST /api/rooms/{roomId}/join`)
- Handle conflict (`409`) when role is already occupied
- Redirect to room page on success

Route transition:
- `/rooms/{roomId}/role` -> `/rooms/{roomId}?role=participantA|participantB`

### 5.3 Room Page
File: `src/app/rooms/[roomId]/page.tsx`

Responsibilities:
- Validate required `role` search param
- Redirect back to role page when invalid or missing
- Render `RoomManager`

Guard behavior:
- Missing/invalid role -> `redirect(/rooms/{roomId}/role)`

## 6. Domain Model

File: `src/lib/types.ts`

Core types:
- `ParticipantRole`: `"participantA" | "participantB"`
- `ParticipantSlot`: `{ id, name, joinedAt }`
- `Activity`: `"Orientation" | "Simulation" | "Debrief"`
- `Stage`: `"Stage 1" | "Stage 2" | "Stage 3"`
- `AgentCondition`: `"Control" | "Assistive" | "Observation"`

Messaging/logging:
- `ChatMessage`: `{ id, senderRole, content, createdAt }`
- `EventLog`: `{ id, type, message, createdAt }` where type is `SYSTEM | CHAT | ROOM`

Room schema:
- `RoomState` includes:
  - `roomId`
  - `participantA`
  - `participantB`
  - `currentActivity`
  - `currentStage`
  - `agentCondition`
  - `chatMessages`
  - `eventLogs`

## 7. Room Store (Mock Backend)

File: `src/lib/roomStore.ts`

Storage strategy:
- Process-local `Map<string, RoomState>` keyed by room ID.

Exported operations:
- `createOrGetRoom(roomId)`
- `getRoom(roomId)`
- `joinRole(roomId, role, name)`
- `postMessage(roomId, role, content)`
- `updateAgentCondition(roomId, condition)`

Role protection:
- `joinRole` throws `ROLE_TAKEN` when slot is occupied.
- API translates that into HTTP `409`.

Caveats:
- Data resets on server restart.
- Not suitable for horizontally scaled deployments without shared storage.

## 8. API Contracts

### `GET /api/rooms/{roomId}`
File: `src/app/api/rooms/[roomId]/route.ts`

- Returns `{ room }`.
- Creates the room when missing.

### `POST /api/rooms/{roomId}/join`
File: `src/app/api/rooms/[roomId]/join/route.ts`

Request body:
```json
{ "role": "participantA", "name": "Alice" }
```

Responses:
- `200` success
- `400` missing role/name
- `409` role already taken
- `500` unexpected error

### `POST /api/rooms/{roomId}/messages`
File: `src/app/api/rooms/[roomId]/messages/route.ts`

Request body:
```json
{ "role": "participantA", "content": "Hello" }
```

Responses:
- `200` success
- `400` missing role/content

### `POST /api/rooms/{roomId}/agent`
File: `src/app/api/rooms/[roomId]/agent/route.ts`

Request body:
```json
{ "condition": "Assistive" }
```

Responses:
- `200` success
- `400` invalid condition

## 9. Component Breakdown

### `RoomManager`
File: `src/components/RoomManager.tsx`

- Main room orchestrator.
- Polls room state every 2s.
- Handles chat send and agent condition updates.
- Renders top bar + main 2-panel layout + event logger footer.

### `RoleSelector`
File: `src/components/RoleSelector.tsx`

- Collects display name.
- Shows role availability.
- Blocks occupied role buttons.
- Surfaces join errors.

### `SimulationRunner`
File: `src/components/SimulationRunner.tsx`

- Explicit simulation placeholder.

### `ChatRoom`
File: `src/components/ChatRoom.tsx`

- Displays shared chat messages.
- Sends messages with role context.

### `AgentController`
File: `src/components/AgentController.tsx`

- Top-bar selector for `Control / Assistive / Observation`.

### `EventLogger`
File: `src/components/EventLogger.tsx`

- Displays chronological room/system/chat events.

## 10. State Synchronization

Current model:
- Polling-based snapshot refresh (2s)
- Immediate refresh after mutations

Why this model:
- Low complexity for prototype stage
- Reliable for shared state visibility

Upgrade path:
- Replace polling with SSE/WebSocket.

## 11. Error Handling

Current behavior:
- API validates inputs and returns status codes (`400`, `409`, `500`).
- Role UI displays conflict and request errors.
- Room panel actions throw generic failures when request fails.

Known gaps:
- No centralized error boundaries
- No retry/backoff
- No full user-facing notification system

## 12. Security and Research-Use Caveats

Prototype assumptions:
- Trusted users
- No authentication
- No session ownership for roles

Pre-production requirements:
- Auth/session binding
- Role claim authorization checks
- Persistent audit logging
- Data lifecycle/retention policy

## 13. Extensibility Roadmap

1. Add persistence (Postgres/Redis) behind `roomStore` contract.
2. Add real-time transport (SSE/WebSocket).
3. Introduce session-bound participant identity.
4. Implement simulation in `SimulationRunner` without breaking other modules.
5. Add agent orchestration backend and richer event types.

## 14. Requirement-to-Code Mapping

1. Landing page with room ID
- `src/app/page.tsx`

2. Role selection page
- `src/app/rooms/[roomId]/role/page.tsx`
- `src/components/RoleSelector.tsx`

3. Room page with required panels/top bar
- `src/app/rooms/[roomId]/page.tsx`
- `src/components/RoomManager.tsx`
- `src/components/SimulationRunner.tsx`
- `src/components/ChatRoom.tsx`
- `src/components/EventLogger.tsx`
- `src/components/AgentController.tsx`

4. Room state model fields
- `src/lib/types.ts`

5. Prevent duplicate role assignment
- `src/lib/roomStore.ts` (`joinRole`)
- `src/app/api/rooms/[roomId]/join/route.ts`

6. Modular component architecture
- `src/components/*`

## 15. Running and Verification

```bash
npm install
npm run dev
npm run lint
```

Open `http://localhost:3000` and test:
1. Create room and join `Participant A` in one tab.
2. Open second tab to same room and verify `Participant A` is blocked.
3. Join `Participant B`, send chat, verify event logs update.

---

This document is intended as the primary onboarding and architecture reference for this codebase.
