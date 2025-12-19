# pokemon-red
recreating pokemon red?

## Project structure
- src/game/index.ts - client-side game logic entry point
- src/engine/vibi.ts - VIBI state/timeline logic (game state machine)
- src/network/client.ts - WebSocket sync helper used by the client
- src/server.ts - local HTTP + WebSocket server (for debugging only)
- public/index.html - static HTML shell and other assets not compiled by TypeScript

## Debug borders
Add `?debugBorders=1` to the URL (example: `http://localhost:3000/?debugBorders=1`).
