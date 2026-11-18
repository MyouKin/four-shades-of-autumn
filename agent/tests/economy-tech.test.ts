import { describe, expect, it } from "vitest";
import {
  applyAction,
  BUILDINGS,
  getAvailableActions,
  getCityCapacity,
  getCityIncome,
  getIncome,
  getScore,
  getTechCost,
  populationNeeded,
  TECHNOLOGIES,
  UNITS,
} from "../../src/game";
import { addUnit, battlefield, newGame } from "./helpers";

// Independent reference values: https://wiki.polytopia.com/wiki/technology, /population, /market.
describe("standard economy and city reward levels", () => {
  it("starts with five stars, capital income two, and pays subsequent turn income once", () => {
    const game = newGame();
    expect(game.players[0].resources).toBe(5);
    expect(getIncome(game, 0)).toBe(2);
    const opponent = applyAction(game, { type: "END_TURN" }).state;
    const next = applyAction(opponent, { type: "END_TURN" }).state;
    expect(next.players[0].resources).toBe(7);
  });
  it("uses level plus one for population threshold and unit capacity", () => {
    const game = battlefield(),
      city = game.cities[0];
    expect(populationNeeded(city)).toBe(2);
    expect(getCityCapacity(city)).toBe(2);
    city.level = 4;
    expect(populationNeeded(city)).toBe(5);
    expect(getCityCapacity(city)).toBe(5);
  });
  it("rejects unaffordable investments and over-capacity training", () => {
    const game = battlefield();
    game.players[0].resources = 0;
    game.players[0].technologies = [];
    expect(
      applyAction(game, {
        type: "TRAIN",
        cityId: game.cities[0].id,
        unitType: "warrior",
      }).ok,
    ).toBe(false);
    expect(applyAction(game, { type: "RESEARCH", techId: "hunting" }).ok).toBe(
      false,
    );
    game.players[0].resources = 100;
    addUnit(game, 0, "warrior", 3, 3);
    addUnit(game, 0, "warrior", 4, 4);
    expect(
      applyAction(game, {
        type: "TRAIN",
        cityId: game.cities[0].id,
        unitType: "warrior",
      }).ok,
    ).toBe(false);
  });
  it("trains exhausted warriors for two stars and enforces unlocks", () => {
    const game = battlefield();
    game.players[0].technologies = [];
    expect(
      applyAction(game, {
        type: "TRAIN",
        cityId: game.cities[0].id,
        unitType: "knight",
      }).ok,
    ).toBe(false);
    const result = applyAction(game, {
      type: "TRAIN",
      cityId: game.cities[0].id,
      unitType: "warrior",
    });
    expect(result.ok).toBe(true);
    expect(result.state.players[0].resources).toBe(98);
    expect(result.state.units[0]).toMatchObject({
      hp: 10,
      moved: true,
      attacked: true,
    });
    expect(
      applyAction(result.state, {
        type: "TRAIN",
        cityId: game.cities[0].id,
        unitType: "warrior",
      }).ok,
    ).toBe(false);
  });
  it.each([
    ["fruit", "organization"],
    ["animal", "hunting"],
    ["fish", "fishing"],
  ] as const)(
    "harvests %s for two stars and one population",
    (resource, technology) => {
      const game = battlefield(),
        city = game.cities[0],
        tile = game.tiles[city.territory.find((id) => !game.tiles[id].cityId)!];
      tile.resource = resource;
      tile.terrain =
        resource === "fish"
          ? "shallow"
          : resource === "animal"
            ? "forest"
            : "plain";
      game.players[0].technologies = [];
      expect(applyAction(game, { type: "HARVEST", tileId: tile.id }).ok).toBe(
        false,
      );
      game.players[0].technologies.push(technology);
      const result = applyAction(game, { type: "HARVEST", tileId: tile.id });
      expect(result.ok).toBe(true);
      expect(result.state.players[0].resources).toBe(98);
      expect(result.state.tiles[tile.id].resource).toBeNull();
      expect(result.state.cities[0].population).toBe(1);
    },
  );
  it("upgrades at two population and restricts rewards to the earned level", () => {
    const game = battlefield(),
      city = game.cities[0],
      tile = game.tiles[city.territory.find((id) => !game.tiles[id].cityId)!];
    tile.resource = "crop";
    const built = applyAction(game, {
      type: "BUILD",
      tileId: tile.id,
      building: "farm",
    });
    expect(built.ok).toBe(true);
    expect(built.state.cities[0]).toMatchObject({
      level: 2,
      population: 0,
      pendingRewards: 1,
      pendingRewardLevels: [2],
    });
    expect(
      applyAction(built.state, {
        type: "CITY_REWARD",
        cityId: city.id,
        reward: "giant",
      }).ok,
    ).toBe(false);
    expect(
      applyAction(built.state, {
        type: "CITY_REWARD",
        cityId: city.id,
        reward: "resources",
      }).ok,
    ).toBe(false);
    const reward = applyAction(built.state, {
      type: "CITY_REWARD",
      cityId: city.id,
      reward: "income",
    });
    expect(reward.ok).toBe(true);
    expect(getCityIncome(reward.state, city.id)).toBe(4);
  });
  it.each([
    [3, "resources"],
    [4, "population"],
    [5, "park"],
  ] as const)("implements the level %s %s reward exactly", (level, reward) => {
    const game = battlefield(),
      city = game.cities[0];
    city.level = level;
    city.pendingRewards = 1;
    city.pendingRewardLevels = [level];
    const before = getScore(game, 0),
      result = applyAction(game, {
        type: "CITY_REWARD",
        cityId: city.id,
        reward,
      });
    expect(result.ok).toBe(true);
    if (reward === "resources")
      expect(result.state.players[0].resources).toBe(105);
    if (reward === "population")
      expect(result.state.cities[0].population).toBe(3);
    if (reward === "park") expect(getScore(result.state, 0) - before).toBe(250);
  });
  it("grants a level-five giant without charging stars or occupying a normal capacity slot", () => {
    const game = battlefield(),
      city = game.cities[0];
    city.level = 5;
    city.pendingRewards = 1;
    city.pendingRewardLevels = [5];
    const result = applyAction(game, {
      type: "CITY_REWARD",
      cityId: city.id,
      reward: "giant",
    });
    expect(result.ok).toBe(true);
    expect(
      result.state.units.some(
        (unit) => unit.type === "giant" && unit.hp === 40,
      ),
    ).toBe(true);
    expect(result.state.players[0].resources).toBe(100);
  });
  it("reduces income when development is destroyed and population becomes negative", () => {
    const game = battlefield(),
      city = game.cities[0],
      tile = game.tiles[city.territory.find((id) => !game.tiles[id].cityId)!];
    tile.building = "farm";
    tile.resource = "crop";
    tile.buildingLevel = 1;
    city.population = 0;
    const result = applyAction(game, { type: "DESTROY", tileId: tile.id });
    expect(result.ok).toBe(true);
    expect(result.state.cities[0].population).toBe(-2);
    expect(getCityIncome(result.state, city.id)).toBe(0);
  });
});

describe("25 standard technologies with actual rule effects", () => {
  it("defines five tier-one, ten tier-two and ten tier-three technologies without custom tide effects", () => {
    expect(TECHNOLOGIES).toHaveLength(25);
    expect(
      [1, 2, 3].map(
        (tier) => TECHNOLOGIES.filter((tech) => tech.tier === tier).length,
      ),
    ).toEqual([5, 10, 10]);
    expect(TECHNOLOGIES.some((tech) => tech.id === "forecasting")).toBe(false);
  });
  it("charges tier times city count plus four and rounds philosophy discounts upward", () => {
    const game = battlefield();
    game.players[0].technologies = [];
    expect(getTechCost(game, 0, "organization")).toBe(5);
    expect(getTechCost(game, 0, "farming")).toBe(6);
    expect(getTechCost(game, 0, "construction")).toBe(7);
    game.cities[1].owner = 0;
    expect(getTechCost(game, 0, "construction")).toBe(10);
    game.players[0].technologies = ["philosophy"];
    expect(getTechCost(game, 0, "construction")).toBe(7);
  });
  it("requires tree adjacency, deducts exact prices and supports backwards research", () => {
    const game = battlefield();
    game.players[0].technologies = [];
    expect(applyAction(game, { type: "RESEARCH", techId: "mining" }).ok).toBe(
      false,
    );
    const first = applyAction(game, { type: "RESEARCH", techId: "climbing" });
    expect(first.ok).toBe(true);
    expect(first.state.players[0].resources).toBe(95);
    expect(
      applyAction(first.state, { type: "RESEARCH", techId: "climbing" }).ok,
    ).toBe(false);
    game.players[0].technologies = ["smithery"];
    expect(applyAction(game, { type: "RESEARCH", techId: "mining" }).ok).toBe(
      true,
    );
  });
  it("exposes genuine actions for every technology branch", () => {
    const game = battlefield();
    const trainable = Object.values(UNITS).filter(
      (unit) => unit.trainable && unit.tech,
    );
    expect(trainable.map((unit) => unit.tech)).toEqual(
      expect.arrayContaining([
        "riding",
        "strategy",
        "archery",
        "smithery",
        "mathematics",
        "chivalry",
        "philosophy",
        "diplomacy",
      ]),
    );
    for (const building of Object.values(BUILDINGS))
      if (building.tech)
        expect(TECHNOLOGIES.some((tech) => tech.id === building.tech)).toBe(
          true,
        );
    const legal = getAvailableActions(game);
    expect(legal.some((action) => action.type === "ROAD")).toBe(true);
    expect(
      legal.some(
        (action) => action.type === "TRAIN" && action.unitType === "catapult",
      ),
    ).toBe(true);
  });
});
