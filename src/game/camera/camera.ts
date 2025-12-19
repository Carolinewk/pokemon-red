import { getGameboyLayout } from "../gameboy/gameboy";
import { MAP001, type GameMap } from "../maps/map001";

export type Camera = {
  mapX: number;
  mapY: number;
  worldToCanvas: (worldX: number, worldY: number) => { x: number; y: number };
};

export function createCameraCenteredOn(
  playerX: number, // selfplayer position x and y 
  playerY: number,
  canvas: HTMLCanvasElement,
  _map: GameMap = MAP001
): Camera {
  const { screenX, screenY, screenWidth, screenHeight } = getGameboyLayout(canvas);

  const screenCenterX = screenX + screenWidth / 2;
  const screenCenterY = screenY + screenHeight / 2;

  const mapX = Math.floor(screenCenterX - playerX);
  const mapY = Math.floor(screenCenterY - playerY);

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
