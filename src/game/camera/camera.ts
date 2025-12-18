import { MAP001 } from "../maps/map001";

export const CAMERA = (player, context, canvas) => {
    // later implement a camera that chooses the MAP from the position of the player 
    const mapSettings = {
        playerX: player.positionX,
        playerY: player.positionY,
    }

    MAP001.render(mapSettings, context, canvas);
}

// How the map should be drawn?