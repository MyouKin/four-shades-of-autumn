import { describe, expect, it } from "vitest";
import {
  applyAction,
  getBuildingLevel,
  getCityIncome,
  getIncome,
  getReachableTiles,
  getScore,
  getTerrainDefense,
  isUnitVisible,
  OPENING_PROFILES,
  UNITS,
} from "../../src/game";
import type { Action, GameState } from "../../src/game/types";
import { addCity, addUnit, battlefield, newGame } from "./helpers";

function act(game: GameState, action: Action): GameState {
  const result = applyAction(game, action);
  expect(result.error).toBeUndefined();
  expect(result.ok).toBe(true);
  return result.state;
}
function own(game: GameState, ...ids: number[]): void {
  const city = game.cities[0];
  for (const id of ids) {
    game.tiles[id].owner = 0;
    if (!city.territory.includes(id)) city.territory.push(id);
  }
}
function cycle(game: GameState): GameState {
  return act(act(game, { type: "END_TURN" }), { type: "END_TURN" });
}
const at = (x: number, y: number) => y * 12 + x;

describe("documented regular opening profiles", () => {
  // https://wiki.polytopia.com/wiki/whatsnew-balance-adjustments-2025
  const openings = [
    ["climbing", "climbing", "warrior", 7, 1],
    ["organization", "organization", "warrior", 5, 1],
    ["hunting", "hunting", "warrior", 5, 1],
    ["fishing", "fishing", "warrior", 5, 1],
    ["riding", "riding", "rider", 6, 1],
    ["archery", "archery", "archer", 7, 1],
    ["luxury", null, "warrior", 2, 2],
    ["smithery", "smithery", "swordsman", 5, 1],
    ["farming", "farming", "warrior", 5, 1],
    ["philosophy", "philosophy", "mindBender", 5, 1],
    ["strategy", "strategy", "defender", 7, 1],
    ["roads", "roads", "warrior", 7, 1],
  ] as const;
  it.each(openings)(
    "provides the documented %s assets equally when selected",
    (id, technology, unitType, stars, cityLevel) => {
      const profile = { id, technology, unit: unitType, stars, cityLevel };
      expect(
        OPENING_PROFILES.find((candidate) => candidate.id === id),
      ).toMatchObject(profile);
      const game = newGame({
        size: 20,
        aiCount: 4,
        startingProfiles: Array(5).fill(profile.id),
      });
      for (const player of game.players) {
        expect(player.resources).toBe(profile.stars);
        expect(player.technologies).toEqual(
          profile.technology ? [profile.technology] : [],
        );
        expect(game.units.find((unit) => unit.owner === player.id)?.type).toBe(
          profile.unit,
        );
        expect(
          game.cities.find((city) => city.owner === player.id)?.level,
        ).toBe(profile.cityLevel);
      }
    },
  );
});

describe("real development, transport and support actions", () => {
  it("grows, clears and burns forests at the current standard prices", () => {
    let game = battlefield();
    const tileId = at(2, 2);
    game = act(game, { type: "GROW_FOREST", tileId });
    expect(game.tiles[tileId].terrain).toBe("forest");
    expect(game.players[0].resources).toBe(95);
    game = act(game, { type: "CLEAR_FOREST", tileId });
    expect(game.tiles[tileId].terrain).toBe("plain");
    expect(game.players[0].resources).toBe(96);
    game = act(game, { type: "GROW_FOREST", tileId });
    game = act(game, { type: "BURN_FOREST", tileId });
    expect(game.tiles[tileId]).toMatchObject({
      terrain: "plain",
      resource: "crop",
    });
    expect(game.players[0].resources).toBe(88);
  });
  it("adds production adjacency population and loses it when the supplier is destroyed", () => {
    let game = battlefield();
    own(game, at(3, 1));
    game.cities[0].level = 10;
    game.tiles[at(2, 1)].resource = "crop";
    game = act(game, { type: "BUILD", tileId: at(2, 1), building: "farm" });
    game = act(game, { type: "BUILD", tileId: at(3, 1), building: "windmill" });
    expect(game.cities[0].population).toBe(3);
    expect(getBuildingLevel(game, game.tiles[at(3, 1)])).toBe(1);
    game = act(game, { type: "DESTROY", tileId: at(2, 1) });
    expect(game.cities[0].population).toBe(0);
  });
  it("allows the current forest forge and gives two population per adjacent mine", () => {
    let game = battlefield();
    own(game, at(3, 1));
    game.cities[0].level = 10;
    Object.assign(game.tiles[at(2, 1)], {
      terrain: "mountain",
      resource: "ore",
    });
    game.tiles[at(3, 1)].terrain = "forest";
    game = act(game, { type: "BUILD", tileId: at(2, 1), building: "mine" });
    game = act(game, { type: "BUILD", tileId: at(3, 1), building: "forge" });
    expect(game.cities[0].population).toBe(4);
    expect(getBuildingLevel(game, game.tiles[at(3, 1)])).toBe(1);
  });
  it("caps market income at eight and permits only one market per city", () => {
    let game = battlefield();
    game.cities[0].level = 10;
    for (let y = 2; y <= 6; y++)
      for (let x = 2; x <= 6; x++) own(game, at(x, y));
    for (const [x, y] of [
      [3, 3],
      [4, 3],
      [5, 3],
      [3, 4],
      [5, 4],
      [3, 5],
      [4, 5],
      [5, 5],
    ])
      game.tiles[at(x, y)].building = "windmill";
    for (const [x, y] of [
      [2, 2],
      [3, 2],
      [4, 2],
      [5, 2],
      [6, 2],
      [2, 3],
      [6, 3],
      [2, 4],
      [6, 4],
      [2, 5],
      [6, 5],
      [2, 6],
      [3, 6],
      [4, 6],
      [5, 6],
      [6, 6],
    ])
      game.tiles[at(x, y)].building = "farm";
    game = act(game, { type: "BUILD", tileId: at(4, 4), building: "market" });
    expect(getBuildingLevel(game, game.tiles[at(4, 4)])).toBe(8);
    expect(getCityIncome(game, game.cities[0].id)).toBe(19);
    expect(
      applyAction(game, { type: "BUILD", tileId: at(2, 1), building: "market" })
        .ok,
    ).toBe(false);
  });
  it("connects cities via roads, granting one population at both ends and faster travel", () => {
    let game = battlefield();
    const city = addCity(game, 5, 1, 0);
    game.cities[0].level = 10;
    city.level = 10;
    for (const x of [2, 3, 4])
      game = act(game, { type: "ROAD", tileId: at(x, 1) });
    expect(
      game.cities.find((candidate) => candidate.id === city.id)?.connected,
    ).toBe(true);
    expect(game.cities[0].population).toBe(1);
    expect(
      game.cities.find((candidate) => candidate.id === city.id)?.population,
    ).toBe(1);
    const unit = addUnit(game, 0, "warrior", 1, 1);
    expect(getReachableTiles(game, unit.id)).toContain(at(3, 1));
    expect(game.players[0].resources).toBe(91);
  });
  it("creates a real bridge across shallow water for land units", () => {
    let game = battlefield();
    const tileId = at(2, 1);
    game.tiles[tileId].terrain = "shallow";
    game = act(game, { type: "BUILD", tileId, building: "bridge" });
    const unit = addUnit(game, 0, "warrior", 1, 1);
    expect(getReachableTiles(game, unit.id)).toContain(tileId);
    expect(game.players[0].resources).toBe(95);
  });
  it("boards a port, upgrades the raft and disembarks preserving the original unit", () => {
    let game = battlefield();
    const tileId = at(2, 1);
    game.tiles[tileId].terrain = "shallow";
    game = act(game, { type: "BUILD", tileId, building: "port" });
    expect(game.players[0].resources).toBe(93);
    const unit = addUnit(game, 0, "defender", 1, 1);
    unit.hp = 11;
    game = act(game, { type: "MOVE", unitId: unit.id, to: tileId });
    expect(game.units[0]).toMatchObject({
      type: "raft",
      hp: 11,
      maxHp: 15,
      carried: { type: "defender" },
    });
    game = act(game, {
      type: "UPGRADE_NAVAL",
      unitId: unit.id,
      unitType: "scout",
    });
    expect(game.players[0].resources).toBe(88);
    game = cycle(game);
    game = act(game, { type: "MOVE", unitId: unit.id, to: at(3, 1) });
    expect(game.units[0]).toMatchObject({
      type: "defender",
      hp: 11,
      maxHp: 15,
      attacked: true,
    });
    expect(game.units[0].carried).toBeUndefined();
  });
  it("requires sailing for deep sea and navigation to harvest eight-star starfish", () => {
    let game = battlefield();
    const unit = addUnit(game, 0, "raft", 4, 4);
    game.tiles[at(4, 4)].terrain = "shallow";
    game.tiles[at(5, 4)].terrain = "deep";
    game.players[0].technologies = ["fishing"];
    expect(getReachableTiles(game, unit.id)).not.toContain(at(5, 4));
    game.players[0].technologies.push("sailing");
    expect(getReachableTiles(game, unit.id)).toContain(at(5, 4));
    game.tiles[at(4, 4)].resource = "starfish";
    expect(applyAction(game, { type: "HARVEST", tileId: at(4, 4) }).ok).toBe(
      false,
    );
    game.players[0].technologies.push("navigation");
    game = act(game, { type: "HARVEST", tileId: at(4, 4) });
    expect(game.players[0].resources).toBe(108);
    expect(game.tiles[at(4, 4)].resource).toBeNull();
  });
  it("applies aquatism defense only after research", () => {
    const game = battlefield(),
      unit = addUnit(game, 0, "rammer", 4, 4);
    game.tiles[at(4, 4)].terrain = "shallow";
    game.players[0].technologies = [];
    expect(getTerrainDefense(game, unit)).toBe(1);
    game.players[0].technologies.push("aquatism");
    expect(getTerrainDefense(game, unit)).toBe(1.5);
  });
  it("heals all adjacent friends by four and converts an enemy into the mind bender home city", () => {
    let game = battlefield();
    const healer = addUnit(game, 0, "mindBender", 4, 4),
      friend = addUnit(game, 0, "warrior", 4, 5),
      enemy = addUnit(game, 1, "warrior", 5, 4);
    friend.hp = 3;
    game = act(game, { type: "HEAL_OTHERS", unitId: healer.id });
    expect(game.units.find((unit) => unit.id === friend.id)?.hp).toBe(7);
    expect(
      applyAction(game, {
        type: "CONVERT",
        unitId: healer.id,
        targetId: enemy.id,
      }).ok,
    ).toBe(false);
    game = cycle(game);
    game = act(game, {
      type: "CONVERT",
      unitId: healer.id,
      targetId: enemy.id,
    });
    expect(game.units.find((unit) => unit.id === enemy.id)).toMatchObject({
      owner: 0,
      homeCityId: healer.homeCityId,
      moved: true,
      attacked: true,
    });
  });
  it("disbands only with free spirit and refunds half the unit price rounded down", () => {
    let game = battlefield();
    const unit = addUnit(game, 0, "rider", 4, 4);
    game.players[0].technologies = [];
    expect(applyAction(game, { type: "DISBAND", unitId: unit.id }).ok).toBe(
      false,
    );
    game.players[0].technologies.push("freeSpirit");
    game = act(game, { type: "DISBAND", unitId: unit.id });
    expect(game.units).toHaveLength(0);
    expect(game.players[0].resources).toBe(101);
  });
  it("grows temple score by one hundred every two turns to a five-hundred cap", () => {
    let game = battlefield();
    game = act(game, { type: "BUILD", tileId: at(2, 1), building: "temple" });
    const base = getScore(game, 0);
    game = cycle(cycle(game));
    expect(getBuildingLevel(game, game.tiles[at(2, 1)])).toBe(2);
    expect(getScore(game, 0) - base).toBe(100);
    game.round = 20;
    expect(getBuildingLevel(game, game.tiles[at(2, 1)])).toBe(5);
  });
  it("gates the peace monument and permits each monument only once", () => {
    let game = battlefield();
    game.players[0].lastAttackRound = 1;
    game.round = 5;
    expect(
      applyAction(game, {
        type: "BUILD",
        tileId: at(2, 1),
        building: "altarOfPeace",
      }).ok,
    ).toBe(false);
    game.round = 6;
    game = act(game, {
      type: "BUILD",
      tileId: at(2, 1),
      building: "altarOfPeace",
    });
    expect(game.players[0].builtMonuments).toContain("altarOfPeace");
    expect(
      applyAction(game, {
        type: "BUILD",
        tileId: at(2, 2),
        building: "altarOfPeace",
      }).ok,
    ).toBe(false);
  });
});

describe("diplomacy and infiltration use the same command validator", () => {
  it("requires a peace offer and acceptance, then blocks attacks and doubles embassy income", () => {
    let game = battlefield();
    const left = addUnit(game, 0, "warrior", 4, 4),
      right = addUnit(game, 1, "warrior", 5, 4);
    game = act(game, { type: "EMBASSY", targetPlayer: 1 });
    const income = getIncome(game, 0);
    game = act(game, { type: "PEACE", targetPlayer: 1 });
    expect(game.players[0].peaceWith).toEqual([]);
    game = act(game, { type: "END_TURN" });
    game = act(game, { type: "PEACE", targetPlayer: 0 });
    game = act(game, { type: "END_TURN" });
    expect(game.players[0].peaceWith).toEqual([1]);
    expect(getIncome(game, 0)).toBe(income + 2);
    expect(
      applyAction(game, { type: "ATTACK", unitId: left.id, targetId: right.id })
        .ok,
    ).toBe(false);
    game = act(game, { type: "BREAK_PEACE", targetPlayer: 1 });
    expect(game.players[0].peaceWith).toEqual([]);
    expect(game.units.find((unit) => unit.id === left.id)?.attacked).toBe(true);
  });
  it("hides a moving cloak and blocks same-turn infiltration unless it began hidden", () => {
    const game = battlefield(),
      cloak = addUnit(game, 0, "cloak", 8, 8),
      city = game.cities[1];
    const moved = act(game, { type: "MOVE", unitId: cloak.id, to: at(9, 9) });
    expect(isUnitVisible(moved, moved.units[0], 1)).toBe(false);
    expect(
      applyAction(moved, {
        type: "INFILTRATE",
        unitId: cloak.id,
        cityId: city.id,
      }).ok,
    ).toBe(false);
  });
  it("infiltrates, steals base income and produces exhausted independent daggers that can later capture", () => {
    let game = battlefield();
    game.round = 2;
    const city = game.cities[1];
    city.level = 3;
    const cloak = addUnit(game, 0, "cloak", 9, 9);
    cloak.hiddenAtTurnStart = cloak.hidden = true;
    const income = getCityIncome(game, city.id);
    game = act(game, { type: "INFILTRATE", unitId: cloak.id, cityId: city.id });
    expect(game.players[0].resources).toBe(100 + income);
    expect(game.units.some((unit) => unit.id === cloak.id)).toBe(false);
    const daggers = game.units.filter((unit) => unit.type === "dagger");
    expect(daggers).toHaveLength(3);
    expect(
      daggers.every(
        (unit) =>
          unit.attacked &&
          unit.moved &&
          UNITS[unit.type].skills.includes("independent"),
      ),
    ).toBe(true);
    const occupying = daggers.find(
      (unit) => unit.x === city.x && unit.y === city.y,
    )!;
    expect(occupying).toBeDefined();
    game = cycle(game);
    expect(
      applyAction(game, { type: "CAPTURE", unitId: occupying.id }).ok,
    ).toBe(true);
  });
});

describe("standard special combat and score details", () => {
  it("reveals a hidden cloak on collision without consuming the attacker movement", () => {
    const game = battlefield(),
      warrior = addUnit(game, 0, "warrior", 4, 4),
      cloak = addUnit(game, 1, "cloak", 5, 4);
    cloak.hidden = true;
    const result = act(game, {
      type: "MOVE",
      unitId: warrior.id,
      to: at(5, 4),
    });
    expect(result.units.find((unit) => unit.id === warrior.id)).toMatchObject({
      x: 4,
      y: 4,
      moved: false,
      attacked: false,
    });
    expect(result.units.find((unit) => unit.id === cloak.id)?.hidden).toBe(
      false,
    );
    expect(
      applyAction(result, {
        type: "ATTACK",
        unitId: warrior.id,
        targetId: cloak.id,
      }).ok,
    ).toBe(true);
  });
  it("calculates bomber splash separately from the primary target and cannot retaliate", () => {
    const game = battlefield(),
      bomber = addUnit(game, 0, "bomber", 3, 4),
      target = addUnit(game, 1, "warrior", 5, 4),
      adjacent = addUnit(game, 1, "warrior", 5, 5),
      friend = addUnit(game, 0, "warrior", 5, 3);
    const weak = addUnit(game, 1, "warrior", 6, 5);
    weak.hp = 2;
    const result = act(game, {
      type: "ATTACK",
      unitId: bomber.id,
      targetId: target.id,
    });
    expect(result.units.find((unit) => unit.id === target.id)?.hp).toBe(2);
    expect(result.units.find((unit) => unit.id === adjacent.id)?.hp).toBe(6);
    expect(result.units.find((unit) => unit.id === friend.id)?.hp).toBe(10);
    expect(result.units.some((unit) => unit.id === weak.id)).toBe(false);
    expect(result.units.find((unit) => unit.id === bomber.id)?.kills).toBe(1);
    expect(result.units.find((unit) => unit.id === bomber.id)?.hp).toBe(10);
  });
  it("stomps adjacent enemies when a giant boards its juggernaut", () => {
    const game = battlefield(),
      giant = addUnit(game, 0, "giant", 4, 4),
      target = addUnit(game, 1, "warrior", 6, 4);
    Object.assign(game.tiles[at(5, 4)], {
      terrain: "shallow",
      building: "port",
      owner: 0,
    });
    own(game, at(5, 4));
    const result = act(game, { type: "MOVE", unitId: giant.id, to: at(5, 4) });
    expect(result.units.find((unit) => unit.id === giant.id)).toMatchObject({
      type: "juggernaut",
      hp: 40,
    });
    expect(result.units.find((unit) => unit.id === target.id)?.hp).toBe(4);
  });
  it("counts standard unit value while excluding unspent stars from score", () => {
    const game = battlefield(),
      baseline = getScore(game, 0);
    game.players[0].resources += 500;
    expect(getScore(game, 0)).toBe(baseline);
    addUnit(game, 0, "warrior", 4, 4);
    expect(getScore(game, 0)).toBe(baseline + 10);
    addUnit(game, 0, "giant", 5, 4);
    expect(getScore(game, 0)).toBe(baseline + 60);
  });
});

describe("remaining development branches and reusable ruins", () => {
  it.each([
    ["forestTemple", "forest", 15],
    ["mountainTemple", "mountain", 20],
    ["waterTemple", "shallow", 20],
  ] as const)(
    "builds %s with its real terrain, technology and cost",
    (building, terrain, cost) => {
      let game = battlefield();
      game.tiles[at(2, 2)].terrain = terrain;
      game.cities[0].level = 10;
      const blocked = structuredClone(game);
      blocked.players[0].technologies = [];
      expect(
        applyAction(blocked, { type: "BUILD", tileId: at(2, 2), building }).ok,
      ).toBe(false);
      game = act(game, { type: "BUILD", tileId: at(2, 2), building });
      expect(game.players[0].resources).toBe(100 - cost);
      expect(game.cities[0].population).toBe(1);
    },
  );
  it("builds forestry and mathematics production with real population gains", () => {
    let game = battlefield();
    own(game, at(3, 1));
    game.cities[0].level = 10;
    game.tiles[at(2, 1)].terrain = "forest";
    game = act(game, {
      type: "BUILD",
      tileId: at(2, 1),
      building: "lumberHut",
    });
    game = act(game, { type: "BUILD", tileId: at(3, 1), building: "sawmill" });
    expect(game.cities[0].population).toBe(2);
    expect(game.players[0].resources).toBe(92);
  });
  it("requires waiting after entering ruins and deterministically resolves exploration only once", () => {
    let game = battlefield();
    game.tiles[at(5, 4)].ruin = true;
    const unit = addUnit(game, 0, "warrior", 4, 4);
    game = act(game, { type: "MOVE", unitId: unit.id, to: at(5, 4) });
    expect(applyAction(game, { type: "EXAMINE", unitId: unit.id }).ok).toBe(
      false,
    );
    game = cycle(game);
    const action = { type: "EXAMINE" as const, unitId: unit.id };
    expect(applyAction(game, action)).toEqual(applyAction(game, action));
    const result = act(game, action);
    expect(result.tiles[at(5, 4)].ruin).toBe(false);
    expect(applyAction(result, action).ok).toBe(false);
  });
});
