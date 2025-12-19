const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    image.src = src;
  });

let cachedGameboyImages: { small: HTMLImageElement; large: HTMLImageElement } | null = null;
const gameboyImagesPromise = Promise.all([
  loadImage("/assets/background/gameboySmall.png"),
  loadImage("/assets/background/gameboyLarge.png"),
]).then(([small, large]) => {
  cachedGameboyImages = { small, large };
  return cachedGameboyImages;
});

const GAMEBOY_SCREEN_WIDTH = 472;
const GAMEBOY_SCREEN_HEIGHT = 330;

const SMALL_GAMEBOY_WIDTH = 614;
const SMALL_GAMEBOY_HEIGHT = 775;
const SMALL_SCREEN_OFFSET_X = 71;
const SMALL_SCREEN_OFFSET_Y = 71;

const LARGE_GAMEBOY_WIDTH = 627;
const LARGE_GAMEBOY_HEIGHT = 823;
const LARGE_SCREEN_OFFSET_X = 77;
const LARGE_SCREEN_OFFSET_Y = 78;

export type GameboyLayout = {
  variant: "small" | "large";
  gameboyX: number;
  gameboyY: number;
  gameboyWidth: number;
  gameboyHeight: number;
  screenOffsetX: number;
  screenOffsetY: number;
  screenX: number;
  screenY: number;
  screenWidth: number;
  screenHeight: number;
};

export function getGameboyLayout(canvas: HTMLCanvasElement): GameboyLayout {
  const isSmall = canvas.height < 800;
  const variant = isSmall ? "small" : "large";
  const gameboyWidth = isSmall ? SMALL_GAMEBOY_WIDTH : LARGE_GAMEBOY_WIDTH;
  const gameboyHeight = isSmall ? SMALL_GAMEBOY_HEIGHT : LARGE_GAMEBOY_HEIGHT;
  const screenOffsetX = isSmall ? SMALL_SCREEN_OFFSET_X : LARGE_SCREEN_OFFSET_X;
  const screenOffsetY = isSmall ? SMALL_SCREEN_OFFSET_Y : LARGE_SCREEN_OFFSET_Y;

  const gameboyX = Math.floor((canvas.width - gameboyWidth) / 2);
  const gameboyY = Math.floor((canvas.height - gameboyHeight) / 2);
  const screenX = gameboyX + screenOffsetX;
  const screenY = gameboyY + screenOffsetY;

  return {
    variant,
    gameboyX,
    gameboyY,
    gameboyWidth,
    gameboyHeight,
    screenOffsetX,
    screenOffsetY,
    screenX,
    screenY,
    screenWidth: GAMEBOY_SCREEN_WIDTH,
    screenHeight: GAMEBOY_SCREEN_HEIGHT,
  };
}

export const GAMEBOY_DRAW = async (
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement
): Promise<void> => {
  await gameboyImagesPromise;
  drawGameboyBackground(context, canvas);
};

export function drawGameboyBackground(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement
): void {
  context.fillStyle = "#f0d7b7ff";
  context.fillRect(0, 0, canvas.width, canvas.height);

  const images = cachedGameboyImages;
  if (!images) {
    return;
  }

  const gameboyImage = canvas.height < 800 ? images.small : images.large;
  const canvasCenterX = Math.floor((canvas.width - gameboyImage.width) / 2);
  const canvasCenterY = Math.floor((canvas.height - gameboyImage.height) / 2);
  context.drawImage(gameboyImage, canvasCenterX, canvasCenterY);
}
