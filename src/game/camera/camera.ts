import { getGameboyLayout } from "../gameboy/gameboy";
import { MAP001, type GameMap } from "../maps/map001";

export type Camera = {
  // Where the map pixel (0,0) should be drawn on the canvas.
  // If the player walks left, this number goes UP (map moves right).
  mapX: number;
  mapY: number;
  // Convert world pixel coordinates (map space) to canvas pixel coordinates.
  worldToCanvas: (worldX: number, worldY: number) => { x: number; y: number };
};

export function createCameraCenteredOn(
  focusWorldX: number,
  focusWorldY: number,
  canvas: HTMLCanvasElement,
  _map: GameMap = MAP001
): Camera {
  const { screenX, screenY, screenWidth, screenHeight } = getGameboyLayout(canvas);

  const screenCenterX = screenX + screenWidth / 2;
  const screenCenterY = screenY + screenHeight / 2;

  // Pokemon Red-style camera:
  // keep the player centered and scroll the background (map) instead.
  //
  // If we want focusWorldX/focusWorldY to be drawn at the screen center:
  //   mapX + focusWorldX = screenCenterX
  //   mapY + focusWorldY = screenCenterY
  //
  // Note: we intentionally do NOT clamp to the map bounds here. Gen 1 Pokémon uses
  // border tiles to fill outside the map, keeping the player centered even at edges.
  const mapX = Math.floor(screenCenterX - focusWorldX);
  const mapY = Math.floor(screenCenterY - focusWorldY);

  return {
    mapX,
    mapY,
    worldToCanvas: (worldX, worldY) => ({ x: mapX + worldX, y: mapY + worldY }),
  };
}

export function renderMapWithCamera(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  camera: Camera,
  map: GameMap = MAP001
): void {
  map.render(context, canvas, { mapX: camera.mapX, mapY: camera.mapY });
}
