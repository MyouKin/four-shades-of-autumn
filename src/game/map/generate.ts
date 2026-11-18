import type { CivilizationId, GameOptions, Position, Tile } from "../types";
import { hashSeed, seededRandom } from "./random";
import { createStoryMap } from "./story";

export const distance = (a: Position, b: Position): number =>
  Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
export const isWater = (tile: Tile): boolean =>
  tile.terrain === "shallow" || tile.terrain === "deep";
export function neighbors(tiles: Tile[], size: number, tile: Position): Tile[] {
  const found: Tile[] = [];
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const x = tile.x + dx,
        y = tile.y + dy;
      if ((dx || dy) && x >= 0 && y >= 0 && x < size && y < size)
        found.push(tiles[y * size + x]);
    }
  return found;
}
const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n));
const smooth = (n: number) => n * n * (3 - 2 * n);
/** Continuous seeded value noise; four octaves produce broad coasts and smaller details. */
export function valueNoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x),
    yi = Math.floor(y),
    u = smooth(x - xi),
    v = smooth(y - yi);
  const corner = (a: number, b: number) => {
    let h = Math.imul(a ^ seed, 374761393) ^ Math.imul(b + seed, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  };
  const a = corner(xi, yi),
    b = corner(xi + 1, yi),
    c = corner(xi, yi + 1),
    d = corner(xi + 1, yi + 1);
  return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
}
function fractalNoise(x: number, y: number, seed: number) {
  let result = 0,
    weight = 0,
    amplitude = 1;
  for (let octave = 0; octave < 4; octave++) {
    result += valueNoise(x, y, seed + octave * 1877) * amplitude;
    weight += amplitude;
    amplitude *= 0.47;
    x *= 2.05;
    y *= 2.05;
  }
  return result / weight;
}
function markCoasts(tiles: Tile[], size: number) {
  for (const t of tiles) if (isWater(t)) t.terrain = "deep";
  for (const t of tiles)
    if (
      t.terrain === "deep" &&
      neighbors(tiles, size, t).some((n) => !isWater(n))
    )
      t.terrain = "shallow";
}
function distributeStarts(
  tiles: Tile[],
  size: number,
  count: number,
  random: () => number,
  balanced: boolean,
  allowIslands: boolean,
): number[] {
  const interior = tiles.filter(
    (t) => t.x > 0 && t.y > 0 && t.x < size - 1 && t.y < size - 1,
  );
  const candidates = interior.filter(
    (t) => !isWater(t) && t.terrain !== "mountain",
  );
  const pool = allowIslands ? interior : candidates;
  const starts: number[] = [];
  const minGap = 3;
  for (let i = 0; i < count; i++) {
    let best: Tile | undefined,
      bestScore = -Infinity;
    for (const t of pool) {
      const gap = starts.length
        ? Math.min(...starts.map((id) => distance(t, tiles[id])))
        : size;
      if (gap < minGap) continue;
      const usable = neighbors(tiles, size, t).filter(
        (n) => !isWater(n) && n.terrain !== "mountain",
      ).length;
      const edge = Math.min(t.x, t.y, size - 1 - t.x, size - 1 - t.y);
      const score = balanced
        ? gap + (usable / 8) * 1.2 + Math.min(edge, 3) * 0.15 + random() * 0.6
        : random() * size + gap * 0.18;
      if (score > bestScore) {
        best = t;
        bestScore = score;
      }
    }
    if (!best) {
      // Dense small boards can defeat greedy farthest-point placement despite
      // valid spacing. Retry nine offset lattices before rejecting the setup.
      for (let ox = 1; ox <= 3; ox++)
        for (let oy = 1; oy <= 3; oy++) {
          const lattice = pool.filter(
            (t) => (t.x - ox) % 3 === 0 && (t.y - oy) % 3 === 0,
          );
          if (lattice.length >= count)
            return lattice
              .map((tile) => ({ id: tile.id, rank: random() }))
              .sort((a, b) => a.rank - b.rank)
              .slice(0, count)
              .map((t) => t.id);
        }
      throw new Error(
        `当前地形无法容纳 ${count} 个相距至少 3 格的出生点，请增大地图、提高陆地比例或减少对手。`,
      );
    }
    starts.push(best.id);
  }
  return starts;
}
export function validateCustomSpawns(
  tiles: Tile[],
  size: number,
  count: number,
  points: Position[],
): number[] {
  if (points.length !== count)
    throw new Error(
      `自定义出生位置需要 ${count} 个点，目前设置了 ${points.length} 个。`,
    );
  const ids: number[] = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (
      !Number.isInteger(p.x) ||
      !Number.isInteger(p.y) ||
      p.x < 1 ||
      p.y < 1 ||
      p.x >= size - 1 ||
      p.y >= size - 1
    )
      throw new Error(
        `第 ${i + 1} 个出生点必须位于地图内部的整数坐标，不能在边缘或界外。`,
      );
    const tile = tiles[p.y * size + p.x];
    if (isWater(tile) || tile.terrain === "mountain")
      throw new Error(`第 ${i + 1} 个出生点位于水域或山地，请选择平原或森林。`);
    if (ids.some((id) => distance(tile, tiles[id]) < 3))
      throw new Error(
        `第 ${i + 1} 个出生点与其他位置过近；出生点至少相距 3 格。`,
      );
    ids.push(tile.id);
  }
  return ids;
}
/** Independent implementation inspired by documented terrain profiles and city
 * spacing. This is not the proprietary Polytopia map generator. */
export interface GeneratedMap {
  tiles: Tile[];
  starts: number[];
  villages: number[];
  storyCities?: {
    tileId: number;
    name: string;
    capitalOfCivilization?: CivilizationId;
  }[];
}
export function generateMap(options: GameOptions): GeneratedMap {
  if (options.scenario === "story") return createStoryMap(options.civilization);
  const size = options.size,
    count = options.aiCount + 1;
  if (!Number.isInteger(size) || size < 12 || size > 64)
    throw new Error("地图边长必须是 12 到 64 的整数。");
  if (!Number.isInteger(count) || count < 2 || count > 11)
    throw new Error("对手数量必须是 1 到 10。");
  const free = options.scenario === "free";
  const settings = options.mapSettings;
  const rand = seededRandom(options.seed + ":terrain");
  const seed = hashSeed(options.seed);
  const profile = {
    dryland: { land: 1, scale: 4 },
    lakes: { land: 0.76, scale: 6 },
    continents: { land: 0.57, scale: 3.2 },
    archipelago: { land: 0.32, scale: 8 },
    waterworld: { land: 0.08, scale: 10 },
  }[options.mapType];
  const landRatio = free ? clamp(settings.landRatio, 0.05, 1) : profile.land;
  const frequency = free ? clamp(settings.noiseScale, 1, 20) : profile.scale;
  const forestRatio = free ? clamp(settings.forestRatio, 0, 0.85) : 0.38;
  const mountainRatio = free
    ? clamp(settings.mountainRatio, 0, 0.85 - forestRatio)
    : 0.14;
  const resourceDensity = free ? clamp(settings.resourceDensity, 0, 1) : 0.48;
  const villageDensity = free ? clamp(settings.villageDensity, 0, 0.2) : 0.047;
  const heights = Array.from({ length: size * size }, (_, id) => {
    const x = id % size,
      y = Math.floor(id / size);
    const edge = Math.min(x, y, size - 1 - x, size - 1 - y) / size;
    const falloff =
      options.mapType === "continents" || options.mapType === "archipelago"
        ? Math.max(0, 0.09 - edge) * 1.4
        : 0;
    return (
      fractalNoise(
        (x / size) * frequency + 2.37,
        (y / size) * frequency + 9.41,
        seed,
      ) - falloff
    );
  });
  // Quantiles make the land-ratio setting meaningful across seeds and scales.
  const ranked = heights
    .map((height, id) => ({ height, id }))
    .sort((a, b) => b.height - a.height || a.id - b.id);
  const land = new Set(
    ranked.slice(0, Math.round(size * size * landRatio)).map((t) => t.id),
  );
  const tiles: Tile[] = heights.map((_, id) => {
    const roll = rand();
    return {
      id,
      x: id % size,
      y: Math.floor(id / size),
      terrain: land.has(id)
        ? roll < mountainRatio
          ? "mountain"
          : roll < mountainRatio + forestRatio
            ? "forest"
            : "plain"
        : "deep",
      resource: null,
      owner: null,
      cityId: null,
      building: null,
      road: false,
      ruin: false,
    };
  });
  const corners = [0, size - 1, size * (size - 1), size * size - 1];
  for (const id of corners) {
    tiles[id].lighthouse = true;
    tiles[id].terrain = "plain";
  }
  // Lakes retain an enclosing land rim; no land bridges are carved across oceans.
  if (!free && options.mapType === "lakes")
    for (const t of tiles)
      if (t.x === 0 || t.y === 0 || t.x === size - 1 || t.y === size - 1)
        t.terrain = "plain";
  const spawnRand = seededRandom(options.seed + ":spawns");
  let starts: number[];
  if (free && settings.spawnMode === "custom")
    starts = validateCustomSpawns(tiles, size, count, settings.customSpawns);
  else {
    try {
      starts = distributeStarts(
        tiles,
        size,
        count,
        spawnRand,
        !free || settings.spawnMode === "balanced",
        !free && options.mapType === "waterworld",
      );
    } catch (error) {
      if (free) throw error;
      // Very crowded fair maps may need additional small capital islands.
      starts = distributeStarts(tiles, size, count, spawnRand, true, true);
    }
  }
  if (!free) {
    for (const id of starts) {
      const center = tiles[id];
      center.terrain = "plain";
      const adjacent = neighbors(tiles, size, center);
      let landCount = 0;
      for (const n of adjacent)
        if (!isWater(n) && !n.lighthouse) {
          n.terrain = "plain";
          landCount++;
        }
      // Preserve natural coastline so coastal capitals can build ports at level 1.
      // Four nearby land tiles guarantee equal basic growth opportunities.
      if (landCount < 4)
        for (const n of [...adjacent].sort(
          (a, b) =>
            Math.abs(a.x - center.x) +
            Math.abs(a.y - center.y) -
            (Math.abs(b.x - center.x) + Math.abs(b.y - center.y)),
        )) {
          if (landCount >= 4) break;
          if (n.lighthouse) continue;
          if (isWater(n)) {
            n.terrain = "plain";
            landCount++;
          }
        }
    }
  }
  const villages: number[] = [];
  const towns = [...starts];
  const villageRand = seededRandom(options.seed + ":villages");
  const candidateTiles = tiles
    .filter(
      (t) =>
        !isWater(t) && t.x > 0 && t.y > 0 && t.x < size - 1 && t.y < size - 1,
    )
    .map((tile) => ({ tile, rank: villageRand() }))
    .sort((a, b) => a.rank - b.rank);
  const wanted = free
    ? Math.round(tiles.filter((t) => !isWater(t)).length * villageDensity)
    : Math.max(count, Math.round(size * size * landRatio * villageDensity));
  // Nearby expansion opportunities are scored before filling the rest of the map.
  if (!free && options.mapType !== "waterworld")
    for (const start of starts) {
      const candidates = candidateTiles.filter(
        ({ tile }) =>
          distance(tile, tiles[start]) >= 3 &&
          distance(tile, tiles[start]) <= 5,
      );
      for (const { tile } of candidates) {
        if (towns.every((id) => distance(tile, tiles[id]) >= 3)) {
          villages.push(tile.id);
          towns.push(tile.id);
          break;
        }
      }
    }
  for (const { tile } of candidateTiles) {
    if (villages.length >= wanted) break;
    if (towns.every((id) => distance(tile, tiles[id]) >= 3)) {
      villages.push(tile.id);
      towns.push(tile.id);
    }
  }
  // Dense water worlds can have no spare natural islands; add isolated village
  // islets, never routes between capitals. Naval research remains necessary.
  if (!free && options.mapType === "waterworld" && villages.length < wanted) {
    const candidates = tiles
      .filter((t) => t.x > 0 && t.y > 0 && t.x < size - 1 && t.y < size - 1)
      .map((tile) => ({ tile, r: villageRand() }))
      .sort((a, b) => a.r - b.r);
    for (const { tile } of candidates) {
      if (villages.length >= wanted) break;
      if (towns.every((id) => distance(tile, tiles[id]) >= 3)) {
        tile.terrain = "plain";
        villages.push(tile.id);
        towns.push(tile.id);
      }
    }
  }
  if (!free)
    for (const id of towns) {
      tiles[id].terrain = "plain";
    }
  markCoasts(tiles, size);
  const nearTown = new Uint8Array(size * size).fill(255);
  for (const id of towns) {
    const city = tiles[id];
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const x = city.x + dx,
          y = city.y + dy;
        if (x < 0 || y < 0 || x >= size || y >= size) continue;
        nearTown[y * size + x] = Math.min(
          nearTown[y * size + x],
          Math.max(Math.abs(dx), Math.abs(dy)),
        );
      }
  }
  const resourceRand = seededRandom(options.seed + ":resources");
  for (const t of tiles) {
    const r = resourceRand(),
      density =
        resourceDensity *
        (nearTown[t.id] <= 1
          ? 1.25
          : nearTown[t.id] <= 2
            ? 0.65
            : free
              ? 0.5
              : 0);
    if (r < density) {
      if (t.terrain === "plain")
        t.resource = resourceRand() < 0.5 ? "fruit" : "crop";
      else if (t.terrain === "forest") t.resource = "animal";
      else if (t.terrain === "mountain") t.resource = "ore";
      else if (t.terrain === "shallow") t.resource = "fish";
    }
    if (t.terrain === "deep" && r < resourceDensity * 0.09)
      t.resource = "starfish";
    if (!isWater(t) && resourceRand() < 0.018 && !towns.includes(t.id)) {
      t.ruin = true;
      t.resource = null;
    }
  }
  if (!free)
    for (const id of starts) {
      const around = neighbors(tiles, size, tiles[id]).filter(
        (t) => !isWater(t) && !t.lighthouse,
      );
      around.slice(0, 2).forEach((t) => {
        t.terrain = "plain";
        t.resource = "fruit";
        t.ruin = false;
      });
      if (around[2]) {
        around[2].terrain = "forest";
        around[2].resource = "animal";
        around[2].ruin = false;
      }
      if (around[3]) {
        around[3].terrain = "plain";
        around[3].resource = "crop";
        around[3].ruin = false;
      }
      const water = neighbors(tiles, size, tiles[id]).filter(isWater);
      water.slice(0, 2).forEach((t) => {
        t.resource = "fish";
      });
    }
  for (const id of [...towns, ...corners]) {
    tiles[id].resource = null;
    tiles[id].ruin = false;
  }
  return { tiles, starts, villages };
}
