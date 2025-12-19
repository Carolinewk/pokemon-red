import { getGameboyLayout } from "../gameboy/gameboy";
import type { Camera } from "../camera/camera";
import type { Player } from "../player/player";

type DebugLayoutOptions = {
  camera: Camera;
  players: Record<string, Player | undefined>;
  selfNick: string;
  worldWidth: number;
  worldHeight: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function drawTextBox(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  text: string,
  x: number,
  y: number,
  color: string
): void {
  context.save();
  context.font = "12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
  context.textAlign = "left";
  context.textBaseline = "top";

  const paddingX = 6;
  const paddingY = 3;
  const metrics = context.measureText(text);
  const textWidth = Math.ceil(metrics.width);
  const textHeight = 12;

  const boxWidth = textWidth + paddingX * 2;
  const boxHeight = textHeight + paddingY * 2;
  const boxX = clamp(Math.floor(x), 0, Math.max(0, canvas.width - boxWidth));
  const boxY = clamp(Math.floor(y), 0, Math.max(0, canvas.height - boxHeight));

  context.fillStyle = "rgba(0,0,0,0.65)";
  context.fillRect(boxX, boxY, boxWidth, boxHeight);

  context.lineWidth = 2;
  context.strokeStyle = color;
  context.strokeRect(boxX, boxY, boxWidth, boxHeight);

  context.fillStyle = color;
  context.fillText(text, boxX + paddingX, boxY + paddingY);
  context.restore();
}

function drawLabeledRect(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  x: number,
  y: number,
  width: number,
  height: number,
  label: string,
  color: string
): void {
  context.save();
  context.lineWidth = 2;
  context.strokeStyle = color;
  context.strokeRect(x, y, width, height);
  context.restore();

  const labelX = x + 4;
  const labelY = y >= 20 ? y - 20 : y + height + 4;
  drawTextBox(context, canvas, label, labelX, labelY, color);
}

function drawCrosshair(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  x: number,
  y: number,
  label: string,
  color: string
): void {
  context.save();
  context.lineWidth = 2;
  context.strokeStyle = color;
  context.beginPath();
  context.moveTo(x - 8, y);
  context.lineTo(x + 8, y);
  context.moveTo(x, y - 8);
  context.lineTo(x, y + 8);
  context.stroke();
  context.restore();

  drawTextBox(context, canvas, label, x + 10, y + 10, color);
}

function drawMeasureLine(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  label: string,
  color: string
): void {
  context.save();
  context.lineWidth = 2;
  context.strokeStyle = color;

  context.beginPath();
  context.moveTo(x1, y1);
  context.lineTo(x2, y2);
  context.stroke();

  // Ticks at endpoints
  const isHorizontal = Math.abs(y2 - y1) < Math.abs(x2 - x1);
  const tickSize = 6;
  context.beginPath();
  if (isHorizontal) {
    context.moveTo(x1, y1 - tickSize);
    context.lineTo(x1, y1 + tickSize);
    context.moveTo(x2, y2 - tickSize);
    context.lineTo(x2, y2 + tickSize);
  } else {
    context.moveTo(x1 - tickSize, y1);
    context.lineTo(x1 + tickSize, y1);
    context.moveTo(x2 - tickSize, y2);
    context.lineTo(x2 + tickSize, y2);
  }
  context.stroke();
  context.restore();

  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  drawTextBox(context, canvas, label, midX + 8, midY + 8, color);
}

export function drawLayoutOverlay(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  options: DebugLayoutOptions
): void {
  const layout = getGameboyLayout(canvas);

  const screenOffsetX = layout.screenOffsetX;
  const screenOffsetY = layout.screenOffsetY;
  const screenCenterX = layout.screenX + layout.screenWidth / 2;
  const screenCenterY = layout.screenY + layout.screenHeight / 2;

  const COLORS = {
    canvas: "#a855f7",
    gameboy: "#f97316",
    screen: "#ef4444",
    screenCenter: "#22c55e",
    screenOffset: "#eab308",
    mapBounds: "#06b6d4",
    mapOrigin: "#0ea5e9",
    selfPlayer: "#ec4899",
    otherPlayer: "#3b82f6",
  } as const;

  context.save();
  context.globalAlpha = 0.95;

  drawLabeledRect(
    context,
    canvas,
    0,
    0,
    canvas.width,
    canvas.height,
    `canvas (0,0) ${canvas.width}x${canvas.height}`,
    COLORS.canvas
  );
  drawCrosshair(context, canvas, 0, 0, "canvas origin (0,0)", COLORS.canvas);

  drawLabeledRect(
    context,
    canvas,
    layout.gameboyX,
    layout.gameboyY,
    layout.gameboyWidth,
    layout.gameboyHeight,
    `gameboy (${layout.variant}) X/Y=(${layout.gameboyX},${layout.gameboyY}) ${layout.gameboyWidth}x${layout.gameboyHeight}`,
    COLORS.gameboy
  );
  drawCrosshair(
    context,
    canvas,
    layout.gameboyX,
    layout.gameboyY,
    `gameboyX/Y=(${layout.gameboyX},${layout.gameboyY})`,
    COLORS.gameboy
  );

  drawLabeledRect(
    context,
    canvas,
    layout.screenX,
    layout.screenY,
    layout.screenWidth,
    layout.screenHeight,
    `screenX/Y=(${layout.screenX},${layout.screenY}) ${layout.screenWidth}x${layout.screenHeight}`,
    COLORS.screen
  );
  drawCrosshair(
    context,
    canvas,
    layout.screenX,
    layout.screenY,
    `screenX/Y=(${layout.screenX},${layout.screenY})`,
    COLORS.screen
  );

  drawCrosshair(
    context,
    canvas,
    screenCenterX,
    screenCenterY,
    `screenCenterX/Y=(${Math.round(screenCenterX)},${Math.round(screenCenterY)})`,
    COLORS.screenCenter
  );

  const mapX = options.camera.mapX;
  const mapY = options.camera.mapY;

  drawLabeledRect(
    context,
    canvas,
    mapX,
    mapY,
    options.worldWidth,
    options.worldHeight,
    `map bounds @ mapX/Y=(${mapX},${mapY}) ${options.worldWidth}x${options.worldHeight}`,
    COLORS.mapBounds
  );
  drawCrosshair(
    context,
    canvas,
    mapX,
    mapY,
    `mapX/mapY=(${mapX},${mapY}) (world 0,0)`,
    COLORS.mapOrigin
  );

  // Visualize Gameboy -> screen offsets (outside the actual game screen area).
  const offsetLineY = layout.screenY - 12;
  const offsetLineX = layout.screenX - 12;

  drawMeasureLine(
    context,
    canvas,
    layout.gameboyX,
    offsetLineY,
    layout.screenX,
    offsetLineY,
    `screenOffsetX=${screenOffsetX}`,
    COLORS.screenOffset
  );
  drawMeasureLine(
    context,
    canvas,
    offsetLineX,
    layout.gameboyY,
    offsetLineX,
    layout.screenY,
    `screenOffsetY=${screenOffsetY}`,
    COLORS.screenOffset
  );

  // Player markers (world -> canvas).
  for (const [playerNick, player] of Object.entries(options.players)) {
    if (!player) continue;
    const { x, y } = options.camera.worldToCanvas(player.positionX, player.positionY);
    const isSelf = playerNick === options.selfNick;
    const color = isSelf ? COLORS.selfPlayer : COLORS.otherPlayer;
    drawCrosshair(
      context,
      canvas,
      x,
      y,
      isSelf
        ? `player.positionX/Y=(${Math.round(player.positionX)},${Math.round(player.positionY)})`
        : `${playerNick}.position=(${Math.round(player.positionX)},${Math.round(player.positionY)})`,
      color
    );
  }

  context.restore();
}
