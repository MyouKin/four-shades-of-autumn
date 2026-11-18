import { expect, it } from "vitest";
import { runAiTurn } from "../../src/game";
import { newGame } from "./helpers";

it("plays a deterministic conquest match from initial state to an actual victory", () => {
  let game = newGame({ seed: "autumn-2026", mapType: "dryland", aiCount: 1 });
  let turns = 0;
  while (game.status === "playing" && turns < 300) {
    game = runAiTurn(game);
    turns++;
  }
  expect(
    game.status,
    `Conquest remained open at round ${game.round}; cities ${game.players.map((player) => game.cities.filter((city) => city.owner === player.id).length).join("/")}`,
  ).toBe("finished");
  expect(game.winner).not.toBeNull();
  expect(game.players.some((player) => player.eliminated)).toBe(true);
}, 30000);
