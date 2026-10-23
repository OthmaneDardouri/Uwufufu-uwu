// The game in progress, persisted so a refresh (or closing the phone) never loses it.
import { load, save } from "./services/storage.js";
import { createBracket } from "./core/bracket.js";

/** { categoryId, bracket, size, recorded } or null */
export const currentGame = () => load("game", null);
export const saveGame = (game) => save("game", game);
export const clearGame = () => save("game", undefined);

export function startGame(category, items, size) {
  const game = { categoryId: category.id, size, bracket: createBracket(items, size), recorded: false };
  saveGame(game);
  return game;
}
