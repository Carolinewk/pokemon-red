import rawMap001 from "./map001.json";
import { getGameboyLayout } from "../gameboy/gameboy";

type TiledTilesetRef = {
  firstgid: number;
  source?: string;
};

type TiledTileLayer = {
  type: "tilelayer";
  name: string;
  data: number[];
  width: number;
  height: number;
  visible: boolean;
  opacity: number;
  x: number;
  y: number;
};

type TiledLayer = TiledTileLayer | { type: string; name: string; visible?: boolean };

type TiledMap = {
  type: "map";
  orientation: "orthogonal" | string;
  renderorder?: string;
  infinite: boolean;
  width: number;
  height: number;
  tilewidth: number;
  tileheight: number;
  layers: TiledLayer[];
  tilesets: TiledTilesetRef[];
};

export type GameMap = {
  tileSize: number;
  width: number;
  height: number;
  pixelWidth: number;
  pixelHeight: number;
  render: (
    context: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    options?: { mapX?: number; mapY?: number }
  ) => void;
  isBlocked: (tileX: number, tileY: number) => boolean;
};

const TILESET_IMAGE_SRC = "/assets/tilesets/poke1.png";
const COLLISION_LAYER_NAME = /collision/i;

const FLIP_HORIZONTAL = 0x8000_0000;
const FLIP_VERTICAL = 0x4000_0000;
const FLIP_DIAGONAL = 0x2000_0000;
const GID_MASK = ~(FLIP_HORIZONTAL | FLIP_VERTICAL | FLIP_DIAGONAL); // still confused about this 

function isTileLayer(layer: TiledLayer): layer is TiledTileLayer {
  return layer.type === "tilelayer";
}

function decodeGid(encoded: number): {
  globalTileId: number;
  flipHorizontally: boolean;
  flipVertically: boolean;
  flipDiagonally: boolean;
} {
  return {
    globalTileId: encoded & GID_MASK,
    flipHorizontally: (encoded & FLIP_HORIZONTAL) !== 0,
    flipVertically: (encoded & FLIP_VERTICAL) !== 0,
    flipDiagonally: (encoded & FLIP_DIAGONAL) !== 0,
  };
}

function createTileset(imageSrc: string) {
  const image = new Image();
  image.src = imageSrc;
  image.decoding = "async";
  return image;
}

function findCollisionLayer(map: TiledMap): TiledTileLayer | null {
  for (const layer of map.layers) {
    if (!isTileLayer(layer)) continue;
    if (COLLISION_LAYER_NAME.test(layer.name)) return layer;
  }
  return null;
}

function drawableLayers(map: TiledMap): TiledTileLayer[] {
  const out: TiledTileLayer[] = [];
  for (const layer of map.layers) {
    if (!isTileLayer(layer)) continue;
    if (layer.visible === false) continue;
    out.push(layer);
  }
  return out;
}

function renderTile(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  tileWidth: number,
  tileHeight: number,
  tilesetColumns: number,
  tilesetTileIndex: number,
  destinationCanvasX: number,
  destinationCanvasY: number,
  flipHorizontally: boolean,
  flipVertically: boolean,
  flipDiagonally: boolean
): void {
  if (tilesetTileIndex < 0) return;

  const sourceImageX = (tilesetTileIndex % tilesetColumns) * tileWidth;
  const sourceImageY = Math.floor(tilesetTileIndex / tilesetColumns) * tileHeight;

  if (!flipHorizontally && !flipVertically && !flipDiagonally) {
    context.drawImage(
      image,
      sourceImageX,
      sourceImageY,
      tileWidth,
      tileHeight,
      destinationCanvasX,
      destinationCanvasY,
      tileWidth,
      tileHeight
    );
    return;
  }

  context.save();
  context.translate(destinationCanvasX + tileWidth / 2, destinationCanvasY + tileHeight / 2);
  if (flipDiagonally) {
    context.rotate(Math.PI / 2);
  }
  context.scale(flipHorizontally ? -1 : 1, flipVertically ? -1 : 1);
  context.drawImage(
    image,
    sourceImageX,
    sourceImageY,
    tileWidth,
    tileHeight,
    -tileWidth / 2,
    -tileHeight / 2,
    tileWidth,
    tileHeight
  );
  context.restore();
}

export function createMap001(): GameMap { // function will return result of type GameMap
  const map = rawMap001 as unknown as TiledMap; // double assertion. Debug later

  if (map.type !== "map") {
    throw new Error("map001.json is not a Tiled map");
  }
  if (map.orientation !== "orthogonal") {
    throw new Error(`Unsupported Tiled orientation: ${map.orientation}`);
  }
  if (map.infinite) {
    throw new Error("Infinite Tiled maps are not supported");
  }

  const tileSize = map.tilewidth;
  if (tileSize !== map.tileheight) {
    throw new Error("Non-square tiles are not supported");
  }

  const tilesetRef = map.tilesets[0];
  if (!tilesetRef) {
    throw new Error("map001.json must reference at least one tileset");
  }

  const tilesetImage = createTileset(TILESET_IMAGE_SRC); // return the poke1.png 

  const collisionLayer = findCollisionLayer(map); // it finds the collision layer through regex

  const collisionData =
    collisionLayer?.data?.length === map.width * map.height
      ? collisionLayer.data // holds collision data if the amount of tiles is correct
      : new Array(map.width * map.height).fill(0);
  const layersToDraw = drawableLayers(map); // only draw the ones that are visible

  const pixelWidth = map.width * tileSize;
  const pixelHeight = map.height * tileSize;

  const isBlocked = (tileX: number, tileY: number): boolean => {
    if (tileX < 0 || tileY < 0 || tileX >= map.width || tileY >= map.height) return true;
    return collisionData[tileY * map.width + tileX] !== 0;
  }; 

  const render = (
    context: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    options?: { mapX?: number; mapY?: number }
  ): void => {

    // fit the game map in the game area screen inside game boy

    const { screenX, screenY, screenWidth, screenHeight } = getGameboyLayout(canvas);
    const defaultX = Math.floor(screenX + (screenWidth - pixelWidth) / 2);
    const defaultY = Math.floor(screenY + (screenHeight - pixelHeight) / 2);
    const mapX = Math.floor(options?.mapX ?? defaultX); // mapX = screencenterx - player.position.x
    const mapY = Math.floor(options?.mapY ?? defaultY);

    // const canDrawTiles = false
    const canDrawTiles = tilesetImage.complete && tilesetImage.naturalWidth > 0;
    if (!canDrawTiles) {
      const centerX = Math.floor(screenX + screenWidth / 2);
      const centerY = Math.floor(screenY + screenHeight / 2);
      context.fillStyle = "#0f172a";
      context.fillRect(screenX, screenY, screenWidth, screenHeight);
      context.fillStyle = "#e2e8f0";
      context.font = "14px monospace";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText("Loading tileset...", centerX, centerY);
      return;
    }

    const tilesetColumns = Math.max(1, Math.floor(tilesetImage.naturalWidth / tileSize));

    context.save();
    context.beginPath();
    context.rect(screenX, screenY, screenWidth, screenHeight);
    context.clip();

    // With a Pokémon-style centered camera, the map can scroll past its own bounds.
    // Always clear the full screen area first so we never leave stale pixels behind.
    context.fillStyle = "#0f172a";
    context.fillRect(screenX, screenY, screenWidth, screenHeight);

    for (const layer of layersToDraw) {
      if (!layer.data || layer.data.length !== map.width * map.height) continue;
      if (layer.opacity !== undefined && layer.opacity < 1) {
        context.save();
        context.globalAlpha = layer.opacity;
      }

      for (let row = 0; row < map.height; row++) {
        const rowOffset = row * map.width;
        for (let col = 0; col < map.width; col++) {
          const encodedGlobalTileId = layer.data[rowOffset + col];
          if (!encodedGlobalTileId) continue;

          const { globalTileId, flipHorizontally, flipVertically, flipDiagonally } =
            decodeGid(encodedGlobalTileId);
          if (!globalTileId) continue;
          const tilesetTileIndex = globalTileId - tilesetRef.firstgid;
          if (tilesetTileIndex < 0) continue;

          const destinationCanvasX = mapX + col * tileSize;
          const destinationCanvasY = mapY + row * tileSize;
          renderTile(
            context,
            tilesetImage,
            tileSize,
            tileSize,
            tilesetColumns,
            tilesetTileIndex,
            destinationCanvasX,
            destinationCanvasY,
            flipHorizontally,
            flipVertically,
            flipDiagonally
          );
        }
      }

      if (layer.opacity !== undefined && layer.opacity < 1) {
        context.restore();
      }
    }

    context.restore();
  };

  return {
    tileSize,
    width: map.width,
    height: map.height,
    pixelWidth,
    pixelHeight,
    render,
    isBlocked,
  };
}

export const MAP001: GameMap = createMap001();
