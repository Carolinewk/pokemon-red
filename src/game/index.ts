import { Vibi } from "../engine/vibi";
import { on_sync, ping, gen_name } from "../network/client";
import * as syncClient from "../network/client";
import { GAMEBOY_DRAW } from "./gameboy/gameboy";
import { MAP001 } from "./maps/map001";

type MovementKey = "w" | "a" | "s" | "d";

type Player = {
  positionX: number; // current position (tile-centered, pixels)
  positionY: number;
  targetX: number;   // target tile center being walked toward (pixels)
  targetY: number;
  isMoving: boolean;
  upPressed: boolean;    // input state (WASD)
  leftPressed: boolean;
  downPressed: boolean;
  rightPressed: boolean;
};

type GameState = {
  [nick: string]: Player;
};

// Messages sent between clients
type GamePost =
  | { $: "spawn"; nick: string; px: number; py: number }
  | { $: "down"; key: MovementKey; player: string }
  | { $: "up"; key: MovementKey; player: string };

// Simulation + world tuning
const TICK_RATE         = 24;
const TOLERANCE         = 10; // ms of leeway when reconciling posts
const TILE_SIZE         = MAP001.tileSize;
const WORLD_COLS        = MAP001.width;
const WORLD_ROWS        = MAP001.height;
const WORLD_WIDTH       = MAP001.pixelWidth;
const WORLD_HEIGHT      = MAP001.pixelHeight;
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

function pickMovementKey(player: Player): MovementKey | null {
  if (player.upPressed) return "w";
  if (player.leftPressed) return "a";
  if (player.downPressed) return "s";
  if (player.rightPressed) return "d";
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

    let { positionX, positionY, targetX, targetY, isMoving } = player;

    // Ensure we stick to tile centers once we reach a target
    if (Math.abs(positionX - targetX) < 0.001 && Math.abs(positionY - targetY) < 0.001) {
      positionX = targetX;
      positionY = targetY;
      isMoving = false;
    }

    // If idle, see if a direction key is pressed to start a new tile step
    if (!isMoving) {
      const movementKey = pickMovementKey(player);
      if (movementKey) {
        const currentTileX = nearestTileIndex(targetX, WORLD_COLS - 1);
        const currentTileY = nearestTileIndex(targetY, WORLD_ROWS - 1);

        let nextTileX = currentTileX;
        let nextTileY = currentTileY;

        switch (movementKey) {
          case "w":
            nextTileY = clamp(currentTileY - 1, 0, WORLD_ROWS - 1);
            break;
          case "a":
            nextTileX = clamp(currentTileX - 1, 0, WORLD_COLS - 1);
            break;
          case "s":
            nextTileY = clamp(currentTileY + 1, 0, WORLD_ROWS - 1);
            break;
          case "d":
            nextTileX = clamp(currentTileX + 1, 0, WORLD_COLS - 1);
            break;
        }

        const nextTargetX = tileCenterFromIndex(nextTileX);
        const nextTargetY = tileCenterFromIndex(nextTileY);

        if (
          (nextTargetX !== targetX || nextTargetY !== targetY) &&
          !MAP001.isBlocked(nextTileX, nextTileY)
        ) {
          targetX = nextTargetX;
          targetY = nextTargetY;
          isMoving = true;
        }
      }
    }

    // Continue walking toward the target tile center
    if (isMoving) {
      positionX = stepToward(positionX, targetX);
      positionY = stepToward(positionY, targetY);

      if (Math.abs(positionX - targetX) < 0.001 && Math.abs(positionY - targetY) < 0.001) {
        positionX = targetX;
        positionY = targetY;
        isMoving = false;
      }
    }

    next[nick] = {
      positionX,
      positionY,
      targetX,
      targetY,
      isMoving,
      upPressed: player.upPressed,
      leftPressed: player.leftPressed,
      downPressed: player.downPressed,
      rightPressed: player.rightPressed,
    };
  }

  return next;
}

function setMovementKeyPressed(player: Player, key: MovementKey, isPressed: boolean): Player {
  switch (key) {
    case "w":
      return { ...player, upPressed: isPressed };
    case "a":
      return { ...player, leftPressed: isPressed };
    case "s":
      return { ...player, downPressed: isPressed };
    case "d":
      return { ...player, rightPressed: isPressed };
  }

  return player;
}

// Apply a post (spawn or key change) to the state
function on_post(post: GamePost, state: GameState): GameState {
  switch (post.$) {
    case "spawn": {
      if (state[post.nick]) {
        return state;
      }

      const spawnPixelX = post.px;
      const spawnPixelY = post.py;
      const spawnTileX = nearestTileIndex(spawnPixelX, WORLD_COLS - 1);
      const spawnTileY = nearestTileIndex(spawnPixelY, WORLD_ROWS - 1);
      const spawnTileCenterX = tileCenterFromIndex(spawnTileX);
      const spawnTileCenterY = tileCenterFromIndex(spawnTileY);

      const player: Player = {
        positionX: spawnTileCenterX,
        positionY: spawnTileCenterY,
        targetX: spawnTileCenterX,
        targetY: spawnTileCenterY,
        isMoving: false,
        upPressed: false,
        leftPressed: false,
        downPressed: false,
        rightPressed: false,
      };

      return { ...state, [post.nick]: player };
    }

    case "down":
    case "up": {
      const targetPlayer = state[post.player];
      if (!targetPlayer) return state;
      const updated = setMovementKeyPressed(targetPlayer, post.key, post.$ === "down");
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

function drawMap(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement) {
  MAP001.render(context, canvas);
}

function drawPlayer(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  nick: string,
  player: Player,
  isSelf: boolean
): void {
  const mapWidth  = WORLD_COLS * TILE_SIZE;
  const mapHeight = WORLD_ROWS * TILE_SIZE;
  const offsetX   = Math.floor((canvas.width - mapWidth) / 2);
  const offsetY   = Math.floor((canvas.height - mapHeight) / 2);

  const spriteW = TILE_SIZE;
  const spriteH = TILE_SIZE;
  const x = offsetX + player.positionX - spriteW / 2;
  const y = offsetY + player.positionY - spriteH / 2;

  // Simple blocky sprite (head + body + shoes)
  context.fillStyle = isSelf ? "#e2574c" : "#3a6ea5";
  context.fillRect(x + spriteW * 0.1, y + spriteH * 0.35, spriteW * 0.8, spriteH * 0.5);

  context.fillStyle = "#2b2d42";
  context.fillRect(x + spriteW * 0.2, y + spriteH * 0.15, spriteW * 0.6, spriteH * 0.25);

  context.fillStyle = "#f4d3ae";
  context.fillRect(x + spriteW * 0.35, y + spriteH * 0.32, spriteW * 0.3, spriteH * 0.2);

  context.fillStyle = "#111";
  context.fillRect(x + spriteW * 0.25, y + spriteH * 0.78, spriteW * 0.2, spriteH * 0.14);
  context.fillRect(x + spriteW * 0.55, y + spriteH * 0.78, spriteW * 0.2, spriteH * 0.14);

  context.fillStyle = "#0f172a";
  context.font = `${Math.max(10, Math.floor(spriteH * 0.35))}px monospace`;
  context.textAlign = "center";
  context.textBaseline = "top";
  context.fillText(nick, x + spriteW / 2, y - spriteH * 0.35);
}

function render(
  game: Vibi<GameState, GamePost>,
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  room: string,
  nick: string
): void {
  drawMap(context, canvas);

  const state = game.compute_render_state();

  for (const [playerNick, player] of Object.entries(state)) {
    if (!player) continue;
    drawPlayer(context, canvas, playerNick, player, playerNick === nick);
  }

  // Simple HUD with timing info
  context.fillStyle = "#0f172a";
  context.font = "14px monospace";
  context.textAlign = "left";
  context.textBaseline = "top";

  const serverTick = game.server_tick();
  const roundTripTimeMs = ping();
  context.fillText(`room: ${room}`, 12, 12);
  context.fillText(`tick: ${serverTick}`, 12, 30);
  if (isFinite(roundTripTimeMs)) {
    context.fillText(`ping: ${Math.round(roundTripTimeMs)} ms`, 12, 48);
  }
  context.fillText("WASD to move", 12, 66);
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
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D context unavailable");
  context.imageSmoothingEnabled = false;
  container.innerHTML = "";
  container.appendChild(canvas);
  const drawStaticGameboy = () =>
    GAMEBOY_DRAW(context, canvas).catch((error) =>
      console.error("Failed to draw Gameboy background", error)
    );

  resizeCanvas(canvas);
  drawStaticGameboy();
  window.addEventListener("resize", () => {
    resizeCanvas(canvas);
    drawStaticGameboy();
  });

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

  document.title = `Pokemon Red (${room})`;

  const smooth = (past: GameState, curr: GameState): GameState => {
    if (curr[nick]) {
      past[nick] = curr[nick];
    }
    return past;
  };

  const game: Vibi<GameState, GamePost> = createGame(room, smooth);

  const keyStates: Record<MovementKey, boolean> = {
    w: false,
    a: false,
    s: false,
    d: false,
  };

  on_sync(() => {
    const spawnPixelX = Math.floor(WORLD_WIDTH / 2);
    const spawnPixelY = Math.floor(WORLD_HEIGHT / 2);
    game.post({ $: "spawn", nick, px: spawnPixelX, py: spawnPixelY });

    const validKeys = new Set(["w", "a", "s", "d"]);

    const handleKeyEvent = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (!validKeys.has(key)) return;

      const isDown = event.type === "keydown";
      const keyName = key as MovementKey;
      if (keyStates[keyName] === isDown) return;

      keyStates[keyName] = isDown;
      const action = isDown ? "down" : "up";
      game.post({ $: action, key: keyName, player: nick });
    };

    window.addEventListener("keydown", handleKeyEvent);
    window.addEventListener("keyup", handleKeyEvent);

    const step = () => {
      render(game, context, canvas, room, nick);
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
