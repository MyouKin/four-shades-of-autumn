import { describe, expect, it } from "vitest";
import {
  CIVILIZATIONS,
  generateMap,
  getCityIncome,
  getReachableTiles,
  OPENING_PROFILES,
} from "../../src/game";
import { newGame } from "./helpers";

const storyNames = ["中京", "大台", "春州", "长守", "漠海", "丰化", "千华"];
const shape = (game: ReturnType<typeof newGame>) => ({
  terrain: game.tiles.map((tile) => [tile.terrain, tile.resource]),
  cities: game.cities.map((city) => [city.name, city.x, city.y]).sort(),
});

describe("three distinct world modes", () => {
  it("reproduces identical fair starts from identical seeds", () => {
    expect(newGame()).toEqual(newGame());
    expect(newGame({ seed: "different-season" }).tiles).not.toEqual(
      newGame().tiles,
    );
  });
  it("keeps authored story geography and proper city names invariant across seed and faction", () => {
    const first = newGame({
      scenario: "story",
      civilization: "imperia",
      seed: "one",
    });
    const second = newGame({
      scenario: "story",
      civilization: "rina",
      seed: "two",
    });
    expect(first.options.size).toBe(32);
    expect(first.players).toHaveLength(5);
    expect(shape(first)).toEqual(shape(second));
    for (const name of storyNames)
      expect(first.cities.some((city) => city.name === name)).toBe(true);
    expect(first.players[0].civilization).toBe("imperia");
    expect(second.players[0].civilization).toBe("rina");
  });
  it.each(CIVILIZATIONS.map((civ) => civ.id))(
    "selects %s in story without adding a different ruleset",
    (civilization) => {
      const game = newGame({ scenario: "story", civilization });
      expect(game.players[0].civilization).toBe(civilization);
      const profiles: Record<string, string> = {
        imperia: "organization",
        determia: "strategy",
        nosta: "luxury",
        ida: "hunting",
        rina: "fishing",
      };
      for (const player of game.players) {
        const profile = OPENING_PROFILES.find(
          (candidate) => candidate.id === profiles[player.civilization],
        )!;
        expect(player.resources).toBe(profile.stars);
        expect(player.technologies).toEqual(
          profile.technology ? [profile.technology] : [],
        );
        expect(game.units.find((unit) => unit.owner === player.id)?.type).toBe(
          profile.unit,
        );
      }
    },
  );
  it.each(["free", "fair"] as const)(
    "%s uses independent names and identical initial assets",
    (scenario) => {
      const game = newGame({ scenario, aiCount: 4, size: 20 });
      expect(
        game.players.every((player) => player.civilization === "neutral"),
      ).toBe(true);
      expect(new Set(game.players.map((player) => player.name)).size).toBe(5);
      expect(game.cities.some((city) => storyNames.includes(city.name))).toBe(
        false,
      );
      expect(
        game.players.every(
          (player) =>
            player.resources === 5 &&
            player.technologies.join(",") === "organization",
        ),
      ).toBe(true);
      for (const player of game.players) {
        const city = game.cities.find(
          (candidate) => candidate.owner === player.id,
        )!;
        expect(getCityIncome(game, city.id)).toBe(2);
        expect(
          game.units.filter((unit) => unit.owner === player.id),
        ).toHaveLength(1);
        expect(game.units.find((unit) => unit.owner === player.id)?.type).toBe(
          "warrior",
        );
      }
    },
  );
  it("accepts custom names in free mode", () => {
    const game = newGame({
      scenario: "free",
      factionNames: ["松岬联盟", "白川共和"],
    });
    expect(game.players.map((player) => player.name)).toEqual([
      "松岬联盟",
      "白川共和",
    ]);
  });
});

describe("map sizes, topology and configurable generation", () => {
  it.each([
    "dryland",
    "lakes",
    "continents",
    "archipelago",
    "waterworld",
  ] as const)(
    "%s provides usable, separate starts and coherent tile indices",
    (mapType) => {
      const game = newGame({ mapType, size: 20, aiCount: 4 });
      expect(game.tiles).toHaveLength(400);
      const capitals = game.cities.filter((city) => city.capitalOf !== null);
      expect(capitals).toHaveLength(5);
      expect(new Set(capitals.map((city) => city.y * 20 + city.x)).size).toBe(
        5,
      );
      game.tiles.forEach((tile, id) =>
        expect([tile.id, tile.x, tile.y]).toEqual([
          id,
          id % 20,
          Math.floor(id / 20),
        ]),
      );
      for (const player of game.players) {
        const unit = game.units.find(
          (candidate) => candidate.owner === player.id,
        )!;
        expect(
          getReachableTiles({ ...game, currentPlayer: player.id }, unit.id)
            .length,
        ).toBeGreaterThan(0);
      }
    },
  );
  it("supports a 64 by 64 world with ten AI opponents", () => {
    const game = newGame({ size: 64, aiCount: 10 });
    expect(game.tiles).toHaveLength(4096);
    expect(game.players).toHaveLength(11);
    expect(game.cities.filter((city) => city.capitalOf !== null)).toHaveLength(
      11,
    );
    expect(new Set(game.players.map((player) => player.color)).size).toBe(11);
    expect(
      game.units.every((unit) => unit.owner < 11 && unit.x < 64 && unit.y < 64),
    ).toBe(true);
  }, 15000);
  it("makes free-mode sliders materially affect terrain and resources", () => {
    const initial = newGame({ scenario: "free", size: 32 });
    const low = newGame({
      scenario: "free",
      size: 32,
      mapSettings: {
        ...initial.options.mapSettings,
        landRatio: 0.3,
        forestRatio: 0.05,
        mountainRatio: 0.05,
        resourceDensity: 0.1,
        villageDensity: 0.2,
      },
    });
    const high = newGame({
      scenario: "free",
      size: 32,
      mapSettings: {
        ...initial.options.mapSettings,
        landRatio: 0.85,
        forestRatio: 0.6,
        mountainRatio: 0.2,
        resourceDensity: 0.9,
        villageDensity: 0.8,
      },
    });
    expect(
      high.tiles.filter(
        (tile) => tile.terrain !== "shallow" && tile.terrain !== "deep",
      ).length,
    ).toBeGreaterThan(
      low.tiles.filter(
        (tile) => tile.terrain !== "shallow" && tile.terrain !== "deep",
      ).length,
    );
    expect(
      high.tiles.filter((tile) => tile.terrain === "forest").length,
    ).toBeGreaterThan(
      low.tiles.filter((tile) => tile.terrain === "forest").length,
    );
    expect(high.tiles.filter((tile) => tile.resource).length).toBeGreaterThan(
      low.tiles.filter((tile) => tile.resource).length,
    );
    expect(high.cities.length).toBeGreaterThan(low.cities.length);
    const detail = newGame({
      scenario: "free",
      size: 32,
      mapSettings: { ...initial.options.mapSettings, noiseScale: 12 },
    });
    expect(detail.tiles.map((tile) => tile.terrain)).not.toEqual(
      initial.tiles.map((tile) => tile.terrain),
    );
  });
  it("uses custom free-mode positions exactly and rejects duplicates or outside coordinates", () => {
    const base = newGame({ scenario: "free", size: 20, mapType: "dryland" });
    const spawns = base.cities
      .filter((city) => city.capitalOf !== null)
      .map((city) => ({ x: city.x, y: city.y }))
      .reverse();
    const options = {
      ...base.options,
      mapSettings: {
        ...base.options.mapSettings,
        spawnMode: "custom" as const,
        customSpawns: spawns,
      },
    };
    const world = generateMap(options);
    expect(world.starts).toEqual(
      spawns.map((position) => position.y * 20 + position.x),
    );
    expect(() =>
      generateMap({
        ...options,
        mapSettings: {
          ...options.mapSettings,
          customSpawns: [spawns[0], spawns[0]],
        },
      }),
    ).toThrow();
    expect(() =>
      generateMap({
        ...options,
        mapSettings: {
          ...options.mapSettings,
          customSpawns: [{ x: -1, y: 0 }, spawns[1]],
        },
      }),
    ).toThrow();
  });
});

describe("opening choices preserve authored and previewed geography", () => {
  it.each(["balanced", "custom"] as const)(
    "preserves free-mode %s terrain and resources after selecting different openings",
    (spawnMode) => {
      const base = newGame({ scenario: "free", size: 20, aiCount: 4 });
      const customSpawns = base.cities
        .filter((city) => city.capitalOf !== null)
        .map((city) => ({ x: city.x, y: city.y }))
        .reverse();
      const settings = { ...base.options.mapSettings, spawnMode, customSpawns };
      const selected = newGame({
        ...base.options,
        mapSettings: settings,
        startingProfiles: ["fishing", "hunting", "farming", "organization", "fishing"],
      });
      const preview = generateMap(selected.options);
      const naturalFeatures = (tiles: typeof selected.tiles) => tiles.map((tile) => [
        tile.terrain, tile.resource, tile.ruin, tile.lighthouse,
      ]);
      expect(naturalFeatures(selected.tiles)).toEqual(naturalFeatures(preview.tiles));
      if (spawnMode === "custom") {
        expect(selected.cities.filter((city) => city.capitalOf !== null).map((city) => ({ x: city.x, y: city.y }))).toEqual(customSpawns);
      }
    },
  );
  it("preserves the authored story terrain and resources through civilization initialization", () => {
    const game = newGame({ scenario: "story", civilization: "rina", seed: "fixed-story" });
    const authored = generateMap(game.options);
    expect(game.tiles.map((tile) => [tile.terrain, tile.resource, tile.ruin, tile.lighthouse])).toEqual(
      authored.tiles.map((tile) => [tile.terrain, tile.resource, tile.ruin, tile.lighthouse]),
    );
  });
  it("keeps fair dryland completely dry even when all eleven factions select fishing", () => {
    const game = newGame({ size: 64, aiCount: 10, scenario: "fair", mapType: "dryland", startingProfiles: Array(11).fill("fishing") });
    expect(game.players.every((player) => player.technologies.includes("fishing"))).toBe(true);
    expect(game.tiles.some((tile) => tile.terrain === "shallow" || tile.terrain === "deep")).toBe(false);
  });
});
