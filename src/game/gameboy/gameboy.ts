const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    image.src = src;
  });

const gameboyImagesPromise = Promise.all([
  loadImage("/assets/background/gameboySmall.png"),
  loadImage("/assets/background/gameboyLarge.png"),
]).then(([small, large]) => ({ small, large }));

export const GAMEBOY_DRAW = async (
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement
): Promise<void> => {
  const { small, large } = await gameboyImagesPromise;

  context.fillStyle = "#f0d7b7ff";
  context.fillRect(0, 0, canvas.width, canvas.height);

  const gameboyImage = canvas.height < 800 ? small : large;
  const canvasCenterX = Math.floor((canvas.width - gameboyImage.width) / 2);
  const canvasCenterY = Math.floor((canvas.height - gameboyImage.height) / 2);
  context.drawImage(gameboyImage, canvasCenterX, canvasCenterY);
};
