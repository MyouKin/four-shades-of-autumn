import { describe, expect, it } from "vitest";
import { applyAction, previewCombat } from "../../src/game";
import { addUnit, battlefield } from "./helpers";

describe("standard combat reference positions", () => {
  it("rounds an exact 3.5 hit up for a wounded warrior against a wounded defender", () => {
    const game = battlefield();
    const attacker = addUnit(game, 0, "warrior", 3, 3);
    const defender = addUnit(game, 1, "defender", 4, 3);
    attacker.hp = 7;
    defender.hp = 11;
    // Forces 1.4 and 2.2 produce exactly 3.5 outgoing damage.
    expect(previewCombat(game, attacker.id, defender.id)).toEqual({
      damage: 4,
      retaliation: 7,
      canAttack: true,
    });
    const hit = applyAction(game, {
      type: "ATTACK",
      unitId: attacker.id,
      targetId: defender.id,
    });
    expect(hit.ok).toBe(true);
    expect(hit.state.units).toHaveLength(1);
    expect(hit.state.units[0]).toMatchObject({ id: defender.id, hp: 7 });
  });

  it.each([
    { landing: true, expectedType: "giant" },
    { landing: false, expectedType: "juggernaut" },
  ])(
    "advances a melee juggernaut and stomps once on its destination (landing: $landing)",
    ({ landing, expectedType }) => {
      const game = battlefield();
      const ship = addUnit(game, 0, "juggernaut", 3, 3);
      ship.carried = { type: "giant", maxHp: 40, veteran: false, kills: 0 };
      game.tiles[3 * game.options.size + 3].terrain = "shallow";
      if (!landing) game.tiles[3 * game.options.size + 4].terrain = "shallow";
      const target = addUnit(game, 1, landing ? "warrior" : "raft", 4, 3);
      const adjacent = addUnit(game, 1, "warrior", 5, 3);
      target.hp = 1;
      const hit = applyAction(game, {
        type: "ATTACK",
        unitId: ship.id,
        targetId: target.id,
      });
      expect(hit.ok).toBe(true);
      expect(hit.state.units.find((unit) => unit.id === ship.id)).toMatchObject(
        {
          type: expectedType,
          x: 4,
          y: 3,
          hp: 40,
          kills: 1,
        },
      );
      expect(hit.state.units.find((unit) => unit.id === adjacent.id)?.hp).toBe(
        4,
      );
      expect(
        hit.state.events
          .filter((event) => event.type === "attack")
          .map((event) => event.damage),
      ).toEqual([1, 6]);
    },
  );

  it.each([
    { seesAttacker: true, retaliation: 2 },
    { seesAttacker: false, retaliation: 0 },
  ])(
    "only returns ranged fire with sight (sees attacker: $seesAttacker)",
    ({ seesAttacker, retaliation }) => {
      const game = battlefield();
      const attacker = addUnit(game, 0, "archer", 3, 3);
      const defender = addUnit(game, 1, "archer", 5, 3);
      const from = attacker.y * game.options.size + attacker.x;
      if (!seesAttacker) {
        game.players[1].visible = game.players[1].visible.filter(
          (id) => id !== from,
        );
        game.players[1].explored = game.players[1].explored.filter(
          (id) => id !== from,
        );
      }
      expect(previewCombat(game, attacker.id, defender.id)).toEqual({
        damage: 6,
        retaliation,
        canAttack: true,
      });
      const hit = applyAction(game, {
        type: "ATTACK",
        unitId: attacker.id,
        targetId: defender.id,
      });
      expect(hit.ok).toBe(true);
      expect(hit.state.units.find((unit) => unit.id === attacker.id)?.hp).toBe(
        10 - retaliation,
      );
      expect(hit.state.units.find((unit) => unit.id === defender.id)?.hp).toBe(
        4,
      );
    },
  );

  it("reports the actual HP lost on a lethal counterattack", () => {
    const game = battlefield();
    const city = game.cities[1];
    city.defenseBonus = 1;
    const attacker = addUnit(game, 0, "warrior", city.x - 1, city.y);
    const defender = addUnit(game, 1, "defender", city.x, city.y);
    expect(previewCombat(game, attacker.id, defender.id)).toEqual({
      damage: 1,
      retaliation: 10,
      canAttack: true,
    });
    const hit = applyAction(game, {
      type: "ATTACK",
      unitId: attacker.id,
      targetId: defender.id,
    });
    expect(hit.ok).toBe(true);
    expect(
      hit.state.events
        .filter((event) => event.type === "attack")
        .map((event) => event.damage),
    ).toEqual([1, 10]);
    expect(
      hit.state.units.find((unit) => unit.id === attacker.id),
    ).toBeUndefined();
    expect(
      hit.state.units.find((unit) => unit.id === defender.id),
    ).toMatchObject({ hp: 14, kills: 1 });
  });

  it("caps lethal primary and splash feedback after halving each splash target's own damage", () => {
    const game = battlefield();
    const bomber = addUnit(game, 0, "bomber", 2, 3);
    game.tiles[bomber.y * game.options.size + bomber.x].terrain = "shallow";
    const target = addUnit(game, 1, "warrior", 5, 3);
    const secondary = addUnit(game, 1, "warrior", 6, 3);
    target.hp = secondary.hp = 1;
    const hit = applyAction(game, {
      type: "ATTACK",
      unitId: bomber.id,
      targetId: target.id,
    });
    expect(hit.ok).toBe(true);
    expect(
      hit.state.events
        .filter((event) => event.type === "attack")
        .map((event) => event.damage),
    ).toEqual([1, 1]);
    expect(hit.state.units).toHaveLength(1);
    expect(hit.state.units[0]).toMatchObject({ id: bomber.id, kills: 2 });
  });

  it.each([
    { archery: true, forestChosen: true },
    { archery: false, forestChosen: false },
  ])(
    "prioritizes the city then spawn tiles with an available terrain bonus (archery: $archery)",
    ({ archery, forestChosen }) => {
      const game = battlefield();
      const city = game.cities[1];
      city.level = 2;
      const cloak = addUnit(game, 0, "cloak", city.x - 1, city.y);
      const forest = game.tiles[city.territory.at(-1)!];
      forest.terrain = "forest";
      game.players[0].technologies = archery ? ["archery"] : [];
      const infiltrated = applyAction(game, {
        type: "INFILTRATE",
        unitId: cloak.id,
        cityId: city.id,
      });
      expect(infiltrated.ok).toBe(true);
      const daggers = infiltrated.state.units.filter(
        (unit) => unit.type === "dagger",
      );
      expect(daggers).toHaveLength(2);
      expect(
        daggers.some((unit) => unit.x === city.x && unit.y === city.y),
      ).toBe(true);
      expect(
        daggers.some((unit) => unit.x === forest.x && unit.y === forest.y),
      ).toBe(forestChosen);
    },
  );
});
