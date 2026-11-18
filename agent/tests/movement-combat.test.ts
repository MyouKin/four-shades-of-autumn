import { describe, expect, it } from "vitest";
import {
  applyAction,
  getAttackTargets,
  getReachableTiles,
  previewCombat,
  UNITS,
} from "../../src/game";
import { addUnit, battlefield } from "./helpers";

// Baseline: https://wiki.polytopia.com/wiki/warrior and /defender;
// formula: https://polytopia.fandom.com/wiki/Combat (4.5, nearest integer, pre-hit forces).
describe("standard movement and action skills", () => {
  it("allows one diagonal warrior move, preserving input and bounds", () => {
    const game = battlefield(),
      unit = addUnit(game, 0, "warrior", 3, 3),
      snapshot = structuredClone(game);
    const result = applyAction(game, {
      type: "MOVE",
      unitId: unit.id,
      to: 4 * 12 + 4,
    });
    expect(result.ok).toBe(true);
    expect(game).toEqual(snapshot);
    expect(
      result.state.units.find((candidate) => candidate.id === unit.id),
    ).toMatchObject({ x: 4, y: 4, moved: true });
    expect(getReachableTiles(result.state, unit.id)).toEqual([]);
    expect(
      applyAction(game, { type: "MOVE", unitId: unit.id, to: 4 * 12 + 5 }).ok,
    ).toBe(false);
    expect(
      applyAction(game, { type: "MOVE", unitId: unit.id, to: -1 }).ok,
    ).toBe(false);
    expect(
      applyAction(game, { type: "MOVE", unitId: unit.id, to: 144 }).ok,
    ).toBe(false);
  });
  it("rejects occupied destinations and other players’ units", () => {
    const game = battlefield(),
      unit = addUnit(game, 0, "rider", 3, 3);
    addUnit(game, 0, "warrior", 4, 3);
    const enemy = addUnit(game, 1, "warrior", 3, 4);
    expect(
      applyAction(game, { type: "MOVE", unitId: unit.id, to: 3 * 12 + 4 }).ok,
    ).toBe(false);
    expect(
      applyAction(game, { type: "MOVE", unitId: unit.id, to: 4 * 12 + 3 }).ok,
    ).toBe(false);
    expect(
      applyAction(game, { type: "MOVE", unitId: enemy.id, to: 5 * 12 + 3 }).ok,
    ).toBe(false);
  });
  it("does not let land units cross an ocean without embarkation", () => {
    const game = battlefield(),
      unit = addUnit(game, 0, "rider", 5, 5);
    game.tiles
      .filter(
        (tile) => Math.max(Math.abs(tile.x - 5), Math.abs(tile.y - 5)) === 1,
      )
      .forEach((tile) => {
        tile.terrain = "deep";
      });
    expect(getReachableTiles(game, unit.id)).toEqual([]);
  });
  it("requires climbing for mountains", () => {
    const game = battlefield(),
      unit = addUnit(game, 0, "warrior", 3, 3);
    game.players[0].technologies = [];
    game.tiles[4 * 12 + 4].terrain = "mountain";
    expect(getReachableTiles(game, unit.id)).not.toContain(4 * 12 + 4);
    game.players[0].technologies.push("climbing");
    expect(getReachableTiles(game, unit.id)).toContain(4 * 12 + 4);
  });
  it.each(["defender", "catapult", "giant", "mindBender"] as const)(
    "%s cannot move and then attack without dash",
    (type) => {
      const game = battlefield(),
        unit = addUnit(game, 0, type, 3, 3),
        enemy = addUnit(game, 1, "warrior", 5, 3);
      const moved = applyAction(game, {
        type: "MOVE",
        unitId: unit.id,
        to: 3 * 12 + 4,
      });
      expect(moved.ok).toBe(true);
      expect(
        applyAction(moved.state, {
          type: "ATTACK",
          unitId: unit.id,
          targetId: enemy.id,
        }).ok,
      ).toBe(false);
    },
  );
  it("dash allows warrior movement followed by one attack", () => {
    const game = battlefield(),
      unit = addUnit(game, 0, "warrior", 3, 3),
      enemy = addUnit(game, 1, "warrior", 5, 3);
    const moved = applyAction(game, {
      type: "MOVE",
      unitId: unit.id,
      to: 3 * 12 + 4,
    }).state;
    const hit = applyAction(moved, {
      type: "ATTACK",
      unitId: unit.id,
      targetId: enemy.id,
    });
    expect(hit.ok).toBe(true);
    expect(
      applyAction(hit.state, {
        type: "ATTACK",
        unitId: unit.id,
        targetId: enemy.id,
      }).ok,
    ).toBe(false);
  });
  it("escape grants rider one movement after an attack, not another attack", () => {
    const game = battlefield(),
      rider = addUnit(game, 0, "rider", 3, 3),
      enemy = addUnit(game, 1, "warrior", 5, 3);
    const moved = applyAction(game, {
      type: "MOVE",
      unitId: rider.id,
      to: 3 * 12 + 4,
    }).state;
    const hit = applyAction(moved, {
      type: "ATTACK",
      unitId: rider.id,
      targetId: enemy.id,
    });
    expect(hit.ok).toBe(true);
    const escape = applyAction(hit.state, {
      type: "MOVE",
      unitId: rider.id,
      to: 3 * 12 + 3,
    });
    expect(escape.ok).toBe(true);
    expect(getReachableTiles(escape.state, rider.id)).toEqual([]);
    expect(getAttackTargets(escape.state, rider.id)).toEqual([]);
  });
  it("persist chains attacks only after a knight kills", () => {
    const game = battlefield(),
      knight = addUnit(game, 0, "knight", 3, 3);
    const first = addUnit(game, 1, "warrior", 4, 3),
      second = addUnit(game, 1, "warrior", 5, 3);
    first.hp = second.hp = 1;
    const one = applyAction(game, {
      type: "ATTACK",
      unitId: knight.id,
      targetId: first.id,
    });
    expect(one.ok).toBe(true);
    expect(one.state.units.find((unit) => unit.id === knight.id)?.x).toBe(4);
    const two = applyAction(one.state, {
      type: "ATTACK",
      unitId: knight.id,
      targetId: second.id,
    });
    expect(two.ok).toBe(true);
    expect(two.state.players[0].stats.kills).toBe(2);
  });
});

describe("verified deterministic damage", () => {
  it("full-health warriors each lose five HP, using pre-hit retaliation", () => {
    const game = battlefield(),
      attacker = addUnit(game, 0, "warrior", 4, 4),
      defender = addUnit(game, 1, "warrior", 5, 4);
    expect(previewCombat(game, attacker.id, defender.id)).toEqual({
      damage: 5,
      retaliation: 5,
      canAttack: true,
    });
    const result = applyAction(game, {
      type: "ATTACK",
      unitId: attacker.id,
      targetId: defender.id,
    });
    expect(result.ok).toBe(true);
    expect(result.state.units.map((unit) => unit.hp)).toEqual([5, 5]);
  });
  it("uses defender defense rather than attack for retaliation", () => {
    const game = battlefield(),
      attacker = addUnit(game, 0, "warrior", 4, 4),
      defender = addUnit(game, 1, "defender", 5, 4);
    expect(previewCombat(game, attacker.id, defender.id)).toEqual({
      damage: 4,
      retaliation: 8,
      canAttack: true,
    });
  });
  it("uses health fraction directly, without an artificial minimum strength", () => {
    const game = battlefield(),
      attacker = addUnit(game, 0, "warrior", 4, 4),
      defender = addUnit(game, 1, "warrior", 5, 4);
    attacker.hp = 5;
    expect(previewCombat(game, attacker.id, defender.id).damage).toBe(3);
  });
  it("defensive terrain bonuses require their technology", () => {
    const game = battlefield(),
      attacker = addUnit(game, 0, "warrior", 4, 4),
      defender = addUnit(game, 1, "warrior", 5, 4);
    game.players[1].technologies = [];
    game.tiles[4 * 12 + 5].terrain = "forest";
    expect(previewCombat(game, attacker.id, defender.id).damage).toBe(5);
    game.players[1].technologies.push("archery");
    expect(previewCombat(game, attacker.id, defender.id).damage).toBe(4);
  });
  it("city walls apply a x4 force bonus only to fortify units and allow zero damage", () => {
    const game = battlefield(),
      city = game.cities[1];
    city.defenseBonus = 1;
    const attacker = addUnit(game, 0, "warrior", city.x - 1, city.y),
      defender = addUnit(game, 1, "defender", city.x, city.y);
    attacker.hp = 1;
    expect(previewCombat(game, attacker.id, defender.id).damage).toBe(0);
    defender.type = "giant";
    defender.hp = defender.maxHp = 40;
    attacker.hp = 10;
    expect(previewCombat(game, attacker.id, defender.id).damage).toBe(3);
  });
  it("does not retaliate at range or with stiff, and surprise prevents retaliation", () => {
    const game = battlefield(),
      archer = addUnit(game, 0, "archer", 3, 3),
      warrior = addUnit(game, 1, "warrior", 5, 3);
    expect(previewCombat(game, archer.id, warrior.id).retaliation).toBe(0);
    archer.x = 4;
    warrior.type = "catapult";
    expect(previewCombat(game, archer.id, warrior.id).retaliation).toBe(0);
    archer.type = "dagger";
    warrior.type = "warrior";
    expect(previewCombat(game, archer.id, warrior.id).retaliation).toBe(0);
  });
  it("removes killed units, awards kills and suppresses retaliation on death", () => {
    const game = battlefield(),
      attacker = addUnit(game, 0, "warrior", 3, 3),
      defender = addUnit(game, 1, "warrior", 4, 3);
    defender.hp = 1;
    const result = applyAction(game, {
      type: "ATTACK",
      unitId: attacker.id,
      targetId: defender.id,
    });
    expect(result.ok).toBe(true);
    expect(
      result.state.units.find((unit) => unit.id === defender.id),
    ).toBeUndefined();
    expect(
      result.state.units.find((unit) => unit.id === attacker.id),
    ).toMatchObject({ hp: 10, kills: 1, x: 4 });
  });
  it("promotes after three kills, restoring health and adding five maximum HP exactly once", () => {
    const game = battlefield(),
      unit = addUnit(game, 0, "warrior", 3, 3);
    unit.kills = 3;
    unit.hp = 2;
    const result = applyAction(game, { type: "PROMOTE", unitId: unit.id });
    expect(result.ok).toBe(true);
    expect(result.state.units[0]).toMatchObject({
      veteran: true,
      hp: 15,
      maxHp: 15,
    });
    expect(
      applyAction(result.state, { type: "PROMOTE", unitId: unit.id }).ok,
    ).toBe(false);
    const giant = addUnit(game, 0, "giant", 4, 4);
    giant.kills = 3;
    expect(applyAction(game, { type: "PROMOTE", unitId: giant.id }).ok).toBe(
      false,
    );
  });
  it("heals two outside territory and four inside, consuming the full action", () => {
    for (const ownLand of [false, true]) {
      const game = battlefield(),
        unit = addUnit(game, 0, "warrior", ownLand ? 1 : 4, ownLand ? 1 : 4);
      unit.hp = 1;
      const result = applyAction(game, { type: "HEAL", unitId: unit.id });
      expect(result.ok).toBe(true);
      expect(result.state.units[0].hp).toBe(ownLand ? 5 : 3);
      expect(
        applyAction(result.state, { type: "HEAL", unitId: unit.id }).ok,
      ).toBe(false);
    }
    expect(UNITS.warrior).toMatchObject({
      cost: 2,
      hp: 10,
      movement: 1,
      attack: 2,
      defense: 2,
    });
  });
});
