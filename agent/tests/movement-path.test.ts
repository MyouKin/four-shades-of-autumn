import { describe, expect, it } from "vitest";
import {
  applyAction,
  getMovementPath,
  getReachableTiles,
  movementCost,
  UNITS,
} from "../../src/game";
import { addUnit, battlefield } from "./helpers";

const at = (x: number, y: number) => y * 12 + x;

describe("shared weighted movement paths", () => {
  it("preserves reachable ordering and includes both route endpoints without changing state", () => {
    const game = battlefield(),
      unit = addUnit(game, 0, "warrior", 3, 3);
    const before = structuredClone(game);
    expect(getReachableTiles(game, unit.id)).toEqual([
      at(2, 2),
      at(3, 2),
      at(4, 2),
      at(2, 3),
      at(4, 3),
      at(2, 4),
      at(3, 4),
      at(4, 4),
    ]);
    expect(getMovementPath(game, unit.id, at(4, 4))).toEqual([
      at(3, 3),
      at(4, 4),
    ]);
    expect(game).toEqual(before);
  });

  it.each(["mountain", "shallow", "deep"] as const)(
    "routes around impassable %s without changing movement rules",
    (terrain) => {
      const game = battlefield(),
        unit = addUnit(game, 0, "rider", 3, 3);
      game.players[0].technologies = [];
      game.tiles[at(4, 3)].terrain = terrain;
      const path = getMovementPath(game, unit.id, at(5, 3));
      expect(path).toHaveLength(3);
      expect(path[0]).toBe(at(3, 3));
      expect(path.at(-1)).toBe(at(5, 3));
      expect(path).not.toContain(at(4, 3));
      expect(getMovementPath(game, unit.id, at(4, 3))).toEqual([]);
      expect(
        applyAction(game, { type: "MOVE", unitId: unit.id, to: at(5, 3) }).ok,
      ).toBe(true);
    },
  );

  it("avoids occupied squares and respects hostile zones of control", () => {
    const game = battlefield(),
      unit = addUnit(game, 0, "knight", 3, 3);
    addUnit(game, 0, "warrior", 4, 3);
    const path = getMovementPath(game, unit.id, at(5, 3));
    expect(path).not.toContain(at(4, 3));
    expect(path.at(-1)).toBe(at(5, 3));
    expect(getMovementPath(game, unit.id, at(4, 3))).toEqual([]);
    addUnit(game, 1, "warrior", 5, 4);
    const controlled = getMovementPath(game, unit.id, at(6, 3));
    // Entering a controlled tile ends movement; it cannot be an intermediate leg.
    for (const id of controlled.slice(1, -1)) {
      const tile = game.tiles[id];
      expect(
        Math.max(Math.abs(tile.x - 5), Math.abs(tile.y - 4)),
      ).toBeGreaterThan(1);
    }
  });

  it("uses the cheaper road route and can reach four road steps with a rider", () => {
    const game = battlefield(),
      unit = addUnit(game, 0, "rider", 3, 3);
    expect(getMovementPath(game, unit.id, at(7, 3))).toEqual([]);
    for (let x = 3; x <= 7; x++) game.tiles[at(x, 3)].road = true;
    const longPath = getMovementPath(game, unit.id, at(7, 3));
    expect(longPath).toEqual([
      at(3, 3),
      at(4, 3),
      at(5, 3),
      at(6, 3),
      at(7, 3),
    ]);
    expect(
      longPath
        .slice(1)
        .reduce(
          (cost, id, i) =>
            cost +
            movementCost(game, unit, game.tiles[longPath[i]], game.tiles[id]),
          0,
        ),
    ).toBe(2);
    game.tiles[at(4, 3)].road = false;
    game.tiles[at(4, 4)].road = true;
    expect(getMovementPath(game, unit.id, at(5, 3))).toEqual([
      at(3, 3),
      at(4, 4),
      at(5, 3),
    ]);
  });

  it("retains the existing final-step forest movement cost", () => {
    const game = battlefield(),
      unit = addUnit(game, 0, "rider", 3, 3);
    game.tiles[at(5, 3)].terrain = "forest";
    const path = getMovementPath(game, unit.id, at(5, 3));
    expect(path).toHaveLength(3);
    expect(path.at(-1)).toBe(at(5, 3));
    expect(
      applyAction(game, { type: "MOVE", unitId: unit.id, to: at(5, 3) }).ok,
    ).toBe(true);
  });

  it("returns no route for invalid, unreachable, unexplored, or unchanged destinations", () => {
    const game = battlefield(),
      unit = addUnit(game, 0, "warrior", 3, 3);
    for (const destination of [-1, 144, 3.5, NaN, Infinity, at(3, 3), at(9, 9)])
      expect(getMovementPath(game, unit.id, destination)).toEqual([]);
    game.players[0].explored = [at(3, 3)];
    expect(getMovementPath(game, unit.id, at(4, 3))).toEqual([]);
    expect(getMovementPath(game, "missing-unit", at(4, 3))).toEqual([]);
    const enemy = addUnit(game, 1, "warrior", 7, 7);
    expect(getMovementPath(game, enemy.id, at(8, 7))).toEqual([]);
    game.status = "finished";
    expect(getMovementPath(game, unit.id, at(4, 3))).toEqual([]);
  });

  it("honors exhausted movement and the rider's single escape allowance", () => {
    const game = battlefield(),
      unit = addUnit(game, 0, "rider", 3, 3);
    const moved = applyAction(game, {
      type: "MOVE",
      unitId: unit.id,
      to: at(4, 3),
    }).state;
    expect(getMovementPath(moved, unit.id, at(5, 3))).toEqual([]);
    const enemy = addUnit(moved, 1, "warrior", 5, 3);
    const attacked = applyAction(moved, {
      type: "ATTACK",
      unitId: unit.id,
      targetId: enemy.id,
    }).state;
    expect(getMovementPath(attacked, unit.id, at(3, 3))).toEqual([
      at(4, 3),
      at(3, 3),
    ]);
    const escaped = applyAction(attacked, {
      type: "MOVE",
      unitId: unit.id,
      to: at(3, 3),
    }).state;
    expect(getMovementPath(escaped, unit.id, at(2, 3))).toEqual([]);
  });

  it("matches the caller's hidden-obstacle convention", () => {
    const game = battlefield(),
      unit = addUnit(game, 0, "rider", 3, 3);
    const cloak = addUnit(game, 1, "cloak", 4, 3);
    cloak.hidden = true;
    expect(getMovementPath(game, unit.id, at(4, 3))).toEqual([
      at(3, 3),
      at(4, 3),
    ]);
    expect(getMovementPath(game, unit.id, at(4, 3), true)).toEqual([]);
    expect(getReachableTiles(game, unit.id)).toContain(at(4, 3));
    expect(getReachableTiles(game, unit.id, true)).not.toContain(at(4, 3));
  });

  it.each(["warrior", "rider", "knight", "cloak"] as const)(
    "returns contiguous legal paths for every reachable %s destination, and only those destinations",
    (type) => {
      const game = battlefield(),
        unit = addUnit(game, 0, type, 4, 4);
      game.tiles[at(5, 4)].terrain = "deep";
      game.tiles[at(3, 4)].terrain = "mountain";
      game.players[0].technologies = ["roads"];
      addUnit(game, 0, "warrior", 4, 3);
      addUnit(game, 1, "warrior", 6, 5);
      for (const id of [at(4, 4), at(3, 3), at(2, 2)])
        game.tiles[id].road = true;
      const reachable = getReachableTiles(game, unit.id, true);
      expect(reachable.length).toBeGreaterThan(0);
      const withPaths = game.tiles
        .filter((tile) => getMovementPath(game, unit.id, tile.id, true).length)
        .map((tile) => tile.id);
      expect(withPaths.sort((a, b) => a - b)).toEqual(
        [...reachable].sort((a, b) => a - b),
      );
      for (const destination of reachable) {
        const path = getMovementPath(game, unit.id, destination, true);
        expect(path[0]).toBe(at(4, 4));
        expect(path.at(-1)).toBe(destination);
        expect(new Set(path).size).toBe(path.length);
        let cost = 0;
        for (let index = 1; index < path.length; index++) {
          const from = game.tiles[path[index - 1]],
            to = game.tiles[path[index]];
          expect(
            Math.max(Math.abs(from.x - to.x), Math.abs(from.y - to.y)),
          ).toBe(1);
          cost += movementCost(game, unit, from, to);
        }
        expect(cost).toBeLessThanOrEqual(UNITS[type].movement);
        expect(
          applyAction(game, { type: "MOVE", unitId: unit.id, to: destination })
            .ok,
        ).toBe(true);
      }
    },
  );
});
