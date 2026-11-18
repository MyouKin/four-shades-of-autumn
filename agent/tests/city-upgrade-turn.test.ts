import { describe, expect, it } from "vitest";
import { applyAction, getAvailableActions, getPendingUpgradeCity, runAiTurnDetailed } from "../../src/game";
import type { City } from "../../src/game/types";
import { deserializeGame, serializeGame } from "../../src/store/save";
import { addCity, addUnit, battlefield, newGame } from "./helpers";

function queueLevels(city: City, ...levels: number[]) {
  city.level = levels[levels.length - 1];
  city.pendingRewardLevels = levels;
  city.pendingRewards = levels.length;
}

describe("mandatory city upgrade choices", () => {
  it("requires every level of every owned city and leaves other players' rewards for their turns", () => {
    const game = battlefield();
    const [capital, opponent] = game.cities;
    const town = addCity(game, 5, 5, 0);
    queueLevels(capital, 2, 3);
    queueLevels(town, 2);
    queueLevels(opponent, 2);
    const rejected = applyAction(game, { type: "END_TURN" });
    expect(rejected.ok).toBe(false);
    expect(rejected.state).toBe(game);
    expect(getAvailableActions(game)).not.toContainEqual({ type: "END_TURN" });

    let state = applyAction(game, { type: "CITY_REWARD", cityId: capital.id, reward: "income" }).state;
    expect(getPendingUpgradeCity(state)?.id).toBe(capital.id);
    state = applyAction(state, { type: "CITY_REWARD", cityId: capital.id, reward: "resources" }).state;
    expect(getPendingUpgradeCity(state)?.id).toBe(town.id);
    expect(applyAction(state, { type: "END_TURN" }).ok).toBe(false);
    state = applyAction(state, { type: "CITY_REWARD", cityId: town.id, reward: "income" }).state;
    expect(getAvailableActions(state)).toContainEqual({ type: "END_TURN" });
    const next = applyAction(state, { type: "END_TURN" });
    expect(next.ok).toBe(true);
    expect(next.state.currentPlayer).toBe(1);
    expect(getPendingUpgradeCity(next.state)?.id).toBe(opponent.id);
  });

  it("preserves a chained level-five choice across save and reload", () => {
    const game = newGame();
    const capital = game.cities.find((city) => city.owner === 0)!;
    queueLevels(capital, 4);
    capital.population = 3;
    const grown = applyAction(game, { type: "CITY_REWARD", cityId: capital.id, reward: "population" });
    expect(grown.ok).toBe(true);
    const restored = deserializeGame(serializeGame(grown.state));
    expect(getPendingUpgradeCity(restored)?.pendingRewardLevels).toEqual([5]);
    expect(applyAction(restored, { type: "END_TURN" }).ok).toBe(false);
    const park = applyAction(restored, { type: "CITY_REWARD", cityId: capital.id, reward: "park" });
    expect(park.ok).toBe(true);
    expect(applyAction(park.state, { type: "END_TURN" }).ok).toBe(true);
  });

  it("requires the last score-turn reward before scoring and still allows resignation", () => {
    const game = battlefield();
    game.options.mode = "score";
    game.round = game.options.maxRounds;
    game.currentPlayer = 1;
    const city = game.cities[1];
    queueLevels(city, 5);
    expect(applyAction(game, { type: "END_TURN" }).ok).toBe(false);
    expect(applyAction(game, { type: "RESIGN" }).ok).toBe(true);
    const rewarded = applyAction(game, { type: "CITY_REWARD", cityId: city.id, reward: "park" }).state;
    const end = applyAction(rewarded, { type: "END_TURN" });
    expect(end.ok).toBe(true);
    expect(end.state.status).toBe("finished");
    expect(end.state.winner).toBe(1);
  });

  it.each(["easy", "normal"] as const)("%s AI resolves an upgrade earned on its last budgeted command", (difficulty) => {
    const game = battlefield();
    game.currentPlayer = 1;
    game.options.difficulty = difficulty;
    const player = game.players[1], capital = game.cities[1];
    player.technologies = ["organization"];
    player.resources = 2;
    player.unlockedMonuments = [];
    capital.population = 1;
    const fruit = game.tiles[capital.territory.find((id) => !game.tiles[id].cityId)!];
    fruit.resource = "fruit";
    const guard = addUnit(game, 1, "warrior", capital.x, capital.y);
    guard.moved = guard.attacked = true;
    const result = runAiTurnDetailed(game, 1);
    expect(result.actions.map((action) => action.type)).toEqual(["HARVEST", "CITY_REWARD", "END_TURN"]);
    expect(result.diagnostics.actionCount).toBe(1);
    expect(result.diagnostics.requiredRewardCount).toBe(1);
    expect(result.state.currentPlayer).toBe(0);
    let replay = game;
    for (const action of result.actions) {
      const applied = applyAction(replay, action);
      expect(applied.ok).toBe(true);
      replay = applied.state;
    }
    expect(replay).toEqual(result.state);
  });
});
