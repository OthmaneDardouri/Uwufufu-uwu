// The game in progress, persisted so a refresh (or closing the phone) never loses it.
import { load, save } from "./services/storage.js";
import { createBracket } from "./core/bracket.js";

/** { categoryId, bracket, size, recorded, twitch? } or null */
export const currentGame = () => load("game", null);
export const saveGame = (game) => save("game", game);
export const clearGame = () => save("game", undefined);

/** options.twitch = { channel, seconds } turns on chat voting for this game. */
export function startGame(category, items, size, options = {}) {
  const game = { categoryId: category.id, size, bracket: createBracket(items, size), recorded: false, ...options };
  saveGame(game);
  return game;
}
