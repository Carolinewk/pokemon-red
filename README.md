# pokemon-red
recreating pokemon red?

## Project structure
- src/game/index.ts - client-side game logic entry point
- src/engine/vibi.ts - VIBI state/timeline logic (game state machine)
- src/network/client.ts - WebSocket sync helper used by the client
- src/server.ts - local HTTP + WebSocket server (for debugging only)
- public/index.html - static HTML shell and other assets not compiled by TypeScript
