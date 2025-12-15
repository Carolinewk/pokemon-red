import { Vibi } from "../engine/vibi";
import { on_sync, ping, gen_name } from "../network/client";
import * as syncClient from "../network/client";

// Player data tracked for each nickname
type Player = {
  px: number;  // current position (tile-centered)
  py: number;
  tx: number;  // target tile center being walked toward
  ty: number;
  moving: boolean;
  w: number;   // input state
  a: number;
  s: number;
  d: number;
};

// Map of nick -> player
type GameState = {
  [nick: string]: Player;
};

// Messages sent between clients
type GamePost =
  | { $: "spawn"; nick: string; px: number; py: number }
  | { $: "down"; key: "w" | "a" | "s" | "d"; player: string }
  | { $: "up"; key: "w" | "a" | "s" | "d"; player: string };

// Simulation + world tuning
const TICK_RATE         = 24;
const TOLERANCE         = 10; // ms of leeway when reconciling posts
const TILE_SIZE         = 24;
const WORLD_COLS        = 40;
const WORLD_ROWS        = 22;
const WORLD_WIDTH       = TILE_SIZE * WORLD_COLS;
const WORLD_HEIGHT      = TILE_SIZE * WORLD_ROWS;
const PIXELS_PER_SECOND = TILE_SIZE * 6; // tiles per second
const PIXELS_PER_TICK   = PIXELS_PER_SECOND / TICK_RATE;
const HALF_TILE         = TILE_SIZE / 2;

const initial: GameState = {};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function tileCenterFromIndex(index: number): number {
  return index * TILE_SIZE + HALF_TILE;
}

function nearestTileIndex(value: number, maxIndex: number): number {
  const snapped = Math.round((value - HALF_TILE) / TILE_SIZE);
  return clamp(snapped, 0, maxIndex);
}

function pickDirection(player: Player): "w" | "a" | "s" | "d" | null {
  if (player.w) return "w";
  if (player.a) return "a";
  if (player.s) return "s";
  if (player.d) return "d";
  return null;
}

function stepToward(current: number, target: number): number {
  const delta = target - current;
  if (Math.abs(delta) <= PIXELS_PER_TICK) {
    return target;
  }
  return current + Math.sign(delta) * PIXELS_PER_TICK;
}

// Update all players based on their pressed keys
function on_tick(state: GameState): GameState {
  const next: GameState = {};

  for (const [nick, player] of Object.entries(state)) {
    if (!player) continue;

    let { px, py, tx, ty, moving } = player;

    // Ensure we stick to tile centers once we reach a target
    if (Math.abs(px - tx) < 0.001 && Math.abs(py - ty) < 0.001) {
      px     = tx;
      py     = ty;
      moving = false;
    }

    // If idle, see if a direction key is pressed to start a new tile step
    if (!moving) {
      const dir = pickDirection(player);
      if (dir) {
        const tileX = nearestTileIndex(tx, WORLD_COLS - 1);
        const tileY = nearestTileIndex(ty, WORLD_ROWS - 1);

        let nextTileX = tileX;
        let nextTileY = tileY;

        switch (dir) {
          case "w":
            nextTileY = clamp(tileY - 1, 0, WORLD_ROWS - 1);
            break;
          case "a":
            nextTileX = clamp(tileX - 1, 0, WORLD_COLS - 1);
            break;
          case "s":
            nextTileY = clamp(tileY + 1, 0, WORLD_ROWS - 1);
            break;
          case "d":
            nextTileX = clamp(tileX + 1, 0, WORLD_COLS - 1);
            break;
        }

        const nextTx = tileCenterFromIndex(nextTileX);
        const nextTy = tileCenterFromIndex(nextTileY);

        if (nextTx !== tx || nextTy !== ty) {
          tx     = nextTx;
          ty     = nextTy;
          moving = true;
        }
      }
    }

    // Continue walking toward the target tile center
    if (moving) {
      px = stepToward(px, tx);
      py = stepToward(py, ty);

      if (Math.abs(px - tx) < 0.001 && Math.abs(py - ty) < 0.001) {
        px     = tx;
        py     = ty;
        moving = false;
      }
    }

    next[nick] = {
      px,
      py,
      tx,
      ty,
      moving,
      w: player.w,
      a: player.a,
      s: player.s,
      d: player.d,
    };
  }

  return next;
}

// Apply a post (spawn or key change) to the state
function on_post(post: GamePost, state: GameState): GameState {
  switch (post.$) {
    case "spawn": {
      if (state[post.nick]) {
        return state;
      }

      const player: Player = {
        px: tileCenterFromIndex(nearestTileIndex(post.px, WORLD_COLS - 1)),
        py: tileCenterFromIndex(nearestTileIndex(post.py, WORLD_ROWS - 1)),
        tx: tileCenterFromIndex(nearestTileIndex(post.px, WORLD_COLS - 1)),
        ty: tileCenterFromIndex(nearestTileIndex(post.py, WORLD_ROWS - 1)),
        moving: false,
        w: 0,
        a: 0,
        s: 0,
        d: 0,
      };

      return { ...state, [post.nick]: player };
    }

    case "down": {
      const target = state[post.player];
      if (!target) return state;
      const updated = { ...target, [post.key]: 1 } as Player;
      return { ...state, [post.player]: updated };
    }

    case "up": {
      const target = state[post.player];
      if (!target) return state;
      const updated = { ...target, [post.key]: 0 } as Player;
      return { ...state, [post.player]: updated };
    }
  }

  return state;
}

// Create a VIBI instance for this game
export function createGame(room: string, smooth: (past: GameState, curr: GameState) => GameState) {
  return new Vibi<GameState, GamePost>(room, initial, on_tick, on_post, smooth, TICK_RATE, TOLERANCE);
}

function makeCanvas(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.id = "game";
  canvas.style.width = "100vw";
  canvas.style.height = "100vh";
  canvas.style.display = "block";
  canvas.style.background = "#b7c8d5";
  return canvas;
}

function resizeCanvas(canvas: HTMLCanvasElement) {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

function drawGrid(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) {
  // Fill full canvas background
  ctx.fillStyle = "#b7c8d5";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const mapWidth  = WORLD_WIDTH;
  const mapHeight = WORLD_HEIGHT;
  const centerX   = Math.floor((canvas.width  - mapWidth) / 2);
  const centerY   = Math.floor((canvas.height - mapHeight) / 2);

  const tileColor = "#ffffff";

  for (let row = 0; row < WORLD_ROWS; row++) {
    for (let col = 0; col < WORLD_COLS; col++) {
      const x = centerX + col * TILE_SIZE;
      const y = centerY + row * TILE_SIZE;
      ctx.fillStyle = tileColor;
      ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
    }
  }

  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 1;

  // Vertical lines
  for (let c = 0; c <= WORLD_COLS; c++) {
    const x = Math.floor(centerX + c * TILE_SIZE) + 0.5;
    ctx.beginPath();
    ctx.moveTo(x, centerY);
    ctx.lineTo(x, centerY + mapHeight);
    ctx.stroke();
  }

  // Horizontal lines
  for (let r = 0; r <= WORLD_ROWS; r++) {
    const y = Math.floor(centerY + r * TILE_SIZE) + 0.5;
    ctx.beginPath();
    ctx.moveTo(centerX, y);
    ctx.lineTo(centerX + mapWidth, y);
    ctx.stroke();
  }
}

function drawPlayer(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  nick: string,
  player: Player,
  isSelf: boolean
): void {
  const mapWidth  = WORLD_COLS * TILE_SIZE;
  const mapHeight = WORLD_ROWS * TILE_SIZE;
  const offsetX   = (canvas.width  - mapWidth) / 2;
  const offsetY   = (canvas.height - mapHeight) / 2;

  const spriteW = TILE_SIZE;
  const spriteH = TILE_SIZE;
  const x = offsetX + player.px - spriteW / 2;
  const y = offsetY + player.py - spriteH / 2;

  // Simple blocky sprite (head + body + shoes)
  ctx.fillStyle = isSelf ? "#e2574c" : "#3a6ea5";
  ctx.fillRect(x + spriteW * 0.1, y + spriteH * 0.35, spriteW * 0.8, spriteH * 0.5);

  ctx.fillStyle = "#2b2d42";
  ctx.fillRect(x + spriteW * 0.2, y + spriteH * 0.15, spriteW * 0.6, spriteH * 0.25);

  ctx.fillStyle = "#f4d3ae";
  ctx.fillRect(x + spriteW * 0.35, y + spriteH * 0.32, spriteW * 0.3, spriteH * 0.2);

  ctx.fillStyle = "#111";
  ctx.fillRect(x + spriteW * 0.25, y + spriteH * 0.78, spriteW * 0.2, spriteH * 0.14);
  ctx.fillRect(x + spriteW * 0.55, y + spriteH * 0.78, spriteW * 0.2, spriteH * 0.14);

  ctx.fillStyle = "#0f172a";
  ctx.font = `${Math.max(10, Math.floor(spriteH * 0.35))}px monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(nick, x + spriteW / 2, y - spriteH * 0.35);
}

function render(
  game: Vibi<GameState, GamePost>,
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  room: string,
  nick: string
): void {
  drawGrid(ctx, canvas);

  const state = game.compute_render_state();

  for (const [id, player] of Object.entries(state)) {
    if (!player) continue;
    drawPlayer(ctx, canvas, id, player, id === nick);
  }

  // Simple HUD with timing info
  ctx.fillStyle = "#0f172a";
  ctx.font = "14px monospace";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";

  const serverTick = game.server_tick();
  const rtt        = ping();
  ctx.fillText(`room: ${room}`, 12, 12);
  ctx.fillText(`tick: ${serverTick}`, 12, 30);
  if (isFinite(rtt)) {
    ctx.fillText(`ping: ${Math.round(rtt)} ms`, 12, 48);
  }
  ctx.fillText("WASD to move", 12, 66);
}

let started = false;

/**
 * Entry point for client-side game logic.
 * Sets up the canvas, networking, and render loop.
 */
export function startGame(): void {
  if (started) return;
  started = true;

  const container = document.getElementById("app");
  if (!container) {
    throw new Error("Missing #app container");
  }

  const canvas = makeCanvas();
  const ctx    = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.imageSmoothingEnabled = false;
  container.innerHTML = "";
  container.appendChild(canvas);
  resizeCanvas(canvas);
  window.addEventListener("resize", () => resizeCanvas(canvas));

  let room = prompt("Enter ROOM name:") || "";
  room = room.trim() || gen_name();

  let nick = "";
  while (true) {
    const input = prompt("Enter your nickname (1-14 characters):") || "";
    const trimmed = input.trim();

    if (trimmed.length === 0 || trimmed.length > 14) {
      alert("Nickname must be between 1 and 14 characters.");
      continue;
    }

    nick = trimmed;
    break;
  }

  document.title = `Pokemon Grid (${room})`;

  const smooth = (past: GameState, curr: GameState): GameState => {
    if (curr[nick]) {
      past[nick] = curr[nick];
    }
    return past;
  };

  const game: Vibi<GameState, GamePost> = createGame(room, smooth);

  const keyStates: Record<"w" | "a" | "s" | "d", boolean> = {
    w: false,
    a: false,
    s: false,
    d: false,
  };

  on_sync(() => {
    const spawnX = Math.floor(WORLD_WIDTH / 2);
    const spawnY = Math.floor(WORLD_HEIGHT / 2);
    game.post({ $: "spawn", nick, px: spawnX, py: spawnY });

    const validKeys = new Set(["w", "a", "s", "d"]);

    const handleKeyEvent = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (!validKeys.has(key)) return;

      const isDown = event.type === "keydown";
      const keyName = key as "w" | "a" | "s" | "d";
      if (keyStates[keyName] === isDown) return;

      keyStates[keyName] = isDown;
      const action = isDown ? "down" : "up";
      game.post({ $: action, key: keyName, player: nick });
    };

    window.addEventListener("keydown", handleKeyEvent);
    window.addEventListener("keyup", handleKeyEvent);

    const step = () => {
      render(game, ctx, canvas, room, nick);
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

export { Vibi, syncClient };

// Auto-start when loaded in the browser bundle
if (typeof window !== "undefined") {
  startGame();
}
