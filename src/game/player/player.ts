import { MAP001 } from "../maps/map001";
import { getGameboyLayout } from "../gameboy/gameboy";
// import { CAMERA } from "../camera/camera";

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

const TILE_SIZE         = MAP001.tileSize;
const WORLD_COLS        = MAP001.width;
const WORLD_ROWS        = MAP001.height;

export function drawPlayerAndCamera(
    context: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    nick: string,
    player: Player,
    isSelf: boolean
    ): void {
    const mapWidth  = WORLD_COLS * TILE_SIZE;
    const mapHeight = WORLD_ROWS * TILE_SIZE;
    const { screenX, screenY, screenWidth, screenHeight } = getGameboyLayout(canvas);
    const offsetX   = Math.floor(screenX + (screenWidth - mapWidth) / 2);
    const offsetY   = Math.floor(screenY + (screenHeight - mapHeight) / 2);

    const spriteW = TILE_SIZE;
    const spriteH = TILE_SIZE;
    const x = canvas.width / 2 - spriteW;
    const y = screenY + screenHeight / 2 - spriteW / 2;

    context.save();
    context.beginPath();
    context.rect(screenX, screenY, screenWidth, screenHeight);
    context.clip();

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
    // ==============================================

    context.restore();

    // CAMERA(player, context, canvas);


}

export { Player };
