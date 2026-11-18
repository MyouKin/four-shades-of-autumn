import { describe, expect, it } from "vitest";
import { applyAction, getIncome, runAiTurn } from "../../src/game";
import { addCity, addUnit, battlefield, newGame } from "./helpers";

describe("standard occupation and complete results", () => {
  it("requires a full occupation turn for neutral villages as well as enemy cities", () => {
    const game = battlefield(),
      village = addCity(game, 5, 5),
      unit = addUnit(game, 0, "warrior", 4, 5);
    const moved = applyAction(game, {
      type: "MOVE",
      unitId: unit.id,
      to: 5 * 12 + 5,
    });
    expect(moved.ok).toBe(true);
    expect(
      applyAction(moved.state, { type: "CAPTURE", unitId: unit.id }).ok,
    ).toBe(false);
    const next = applyAction(
      applyAction(moved.state, { type: "END_TURN" }).state,
      { type: "END_TURN" },
    ).state;
    const captured = applyAction(next, { type: "CAPTURE", unitId: unit.id });
    expect(captured.ok).toBe(true);
    expect(
      captured.state.cities.find((city) => city.id === village.id)?.owner,
    ).toBe(0);
    expect(getIncome(captured.state, 0)).toBeGreaterThan(getIncome(next, 0));
    expect(captured.state.players[0].resources).toBe(next.players[0].resources);
  });
  it("enemy siege stops city income and capture produces conquest victory", () => {
    const game = battlefield(),
      city = game.cities[1],
      unit = addUnit(game, 0, "warrior", city.x - 1, city.y);
    const moved = applyAction(game, {
      type: "MOVE",
      unitId: unit.id,
      to: city.y * 12 + city.x,
    }).state;
    expect(getIncome(moved, 1)).toBe(0);
    const next = applyAction(applyAction(moved, { type: "END_TURN" }).state, {
      type: "END_TURN",
    }).state;
    const captured = applyAction(next, { type: "CAPTURE", unitId: unit.id });
    expect(captured.ok).toBe(true);
    expect(captured.state.status).toBe("finished");
    expect(captured.state.winner).toBe(0);
    expect(applyAction(captured.state, { type: "END_TURN" }).ok).toBe(false);
  });
  it("produces a real human loss through the same city capture command", () => {
    const game = battlefield();
    game.currentPlayer = 1;
    const city = game.cities[0],
      unit = addUnit(game, 1, "warrior", city.x, city.y);
    unit.capturedTurn = 0;
    const captured = applyAction(game, { type: "CAPTURE", unitId: unit.id });
    expect(captured.ok).toBe(true);
    expect(captured.state.status).toBe("finished");
    expect(captured.state.winner).toBe(1);
  });
  it("does not annex a neutral city center through border expansion", () => {
    const game = battlefield(),
      city = game.cities[0],
      village = addCity(game, city.x + 2, city.y);
    city.level = 4;
    city.pendingRewards = 1;
    city.pendingRewardLevels = [4];
    const result = applyAction(game, {
      type: "CITY_REWARD",
      cityId: city.id,
      reward: "territory",
    });
    expect(result.ok).toBe(true);
    expect(result.state.tiles[village.y * 12 + village.x].owner).toBeNull();
    expect(
      result.state.cities.find((candidate) => candidate.id === city.id)
        ?.territory,
    ).not.toContain(village.y * 12 + village.x);
  });
});

describe("bounded standard-rule AI", () => {
  it.each(["easy", "normal"] as const)(
    "%s AI ends its turn without mutating input or cheating resources",
    (difficulty) => {
      const game = applyAction(newGame({ difficulty }), {
          type: "END_TURN",
        }).state,
        before = structuredClone(game);
      const result = runAiTurn(game, 32);
      expect(game).toEqual(before);
      expect(
        result.status === "finished" ||
          result.currentPlayer !== game.currentPlayer,
      ).toBe(true);
      expect(result.players.every((player) => player.resources >= 0)).toBe(
        true,
      );
      expect(
        new Set(
          result.units.map((unit) => unit.y * result.options.size + unit.x),
        ).size,
      ).toBe(result.units.length);
    },
  );
  it("reproduces AI choices from identical state", () => {
    const game = applyAction(newGame(), { type: "END_TURN" }).state;
    expect(runAiTurn(game, 24)).toEqual(runAiTurn(game, 24));
  });
  it.each(["story", "free", "fair"] as const)(
    "can finish a complete %s score-mode match",
    (scenario) => {
      let game = newGame({
        scenario,
        civilization: scenario === "story" ? "imperia" : "neutral",
        mode: "score",
        maxRounds: 30,
        aiCount: 2,
      });
      let turns = 0;
      while (
        game.status === "playing" &&
        turns < game.options.maxRounds * game.players.length + 1
      ) {
        game = runAiTurn(game, 24);
        turns++;
      }
      expect(game.status).toBe("finished");
      expect(game.winner).not.toBeNull();
    },
    30000,
  );
  it("can advance all eleven participants on the maximum map without invalid player indices", () => {
    let game = newGame({ size: 64, aiCount: 10 });
    for (let turn = 0; turn < 11; turn++) game = runAiTurn(game, 80);
    expect(game.currentPlayer).toBe(0);
    expect(game.round).toBe(2);
    expect(
      game.players.every(
        (player) => Number.isFinite(player.resources) && player.resources >= 0,
      ),
    ).toBe(true);
  }, 30000);
});
