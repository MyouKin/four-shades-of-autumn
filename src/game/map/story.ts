import type { CivilizationId, Position, Tile } from "../types";

/** Hand-authored, immutable setting map. Each character covers a 2×2 region.
 * The fixed coastline, ranges, rivers, forests, cities and resources below are
 * data, not a random generation seed. Choosing a faction only reorders starts. */
export const STORY_SIZE = 32;
const COASTLINE = [
  "~~~~~~....~~~~~~",
  "~~~........~~~~~",
  "~~..........~~~~",
  "~~..........~~..",
  "~~........~~~...",
  "~~~........~~...",
  "~~~.........~...",
  "~~..........~...",
  "~~........~~~...",
  "~~~.......~~~...",
  "~~~~.......~~...",
  "~~~~~.....~~~...",
  "~~~~~...~~~~....",
  "~~~~..~..~~~....",
  "~~~~.~~~..~~~...",
  "~~~~~~~~~~~~~~~~",
];
export const STORY_FACTIONS: CivilizationId[] = [
  "imperia",
  "determia",
  "nosta",
  "ida",
  "rina",
];
export const STORY_CITIES: {
  x: number;
  y: number;
  name: string;
  capitalOfCivilization?: CivilizationId;
}[] = [
  { x: 12, y: 15, name: "中京", capitalOfCivilization: "imperia" },
  { x: 6, y: 6, name: "定衡", capitalOfCivilization: "determia" },
  { x: 18, y: 5, name: "丰化", capitalOfCivilization: "nosta" },
  { x: 17, y: 27, name: "绯川", capitalOfCivilization: "ida" },
  { x: 28, y: 16, name: "千华", capitalOfCivilization: "rina" },
  { x: 19, y: 16, name: "大台" },
  { x: 19, y: 21, name: "春州" },
  { x: 15, y: 23, name: "长守" },
  { x: 8, y: 10, name: "漠海" },
  { x: 14, y: 4, name: "北汀" },
  { x: 19, y: 9, name: "丰原" },
  { x: 12, y: 10, name: "望川" },
  { x: 16, y: 12, name: "山亭" },
  { x: 6, y: 15, name: "西岚" },
  { x: 9, y: 19, name: "青棠" },
  { x: 12, y: 20, name: "南渡" },
  { x: 11, y: 26, name: "云浦" },
  { x: 9, y: 29, name: "海芒" },
  { x: 24, y: 27, name: "潮屿" },
  { x: 29, y: 25, name: "远湾" },
  { x: 27, y: 21, name: "澄海" },
  { x: 28, y: 11, name: "镜川" },
  { x: 30, y: 7, name: "东见" },
  { x: 22, y: 13, name: "关津" },
];
const MOUNTAINS: Position[][] = [
  [
    { x: 11, y: 15 },
    { x: 14, y: 15 },
    { x: 16, y: 16 },
    { x: 18, y: 16 },
  ],
  [
    { x: 20, y: 16 },
    { x: 22, y: 15 },
    { x: 23, y: 13 },
  ],
  [
    { x: 12, y: 24 },
    { x: 14, y: 25 },
    { x: 16, y: 25 },
    { x: 18, y: 24 },
  ],
  [
    { x: 27, y: 10 },
    { x: 29, y: 13 },
    { x: 29, y: 15 },
  ],
  [
    { x: 28, y: 18 },
    { x: 29, y: 20 },
    { x: 28, y: 23 },
  ],
  [
    { x: 5, y: 9 },
    { x: 6, y: 11 },
    { x: 7, y: 12 },
  ],
];
const RIVERS: Position[][] = [
  [
    { x: 13, y: 16 },
    { x: 15, y: 17 },
    { x: 18, y: 17 },
    { x: 20, y: 18 },
    { x: 23, y: 18 },
  ],
  [
    { x: 16, y: 8 },
    { x: 18, y: 7 },
    { x: 21, y: 7 },
    { x: 23, y: 8 },
  ],
];
function trace(points: Position[], visit: (x: number, y: number) => void) {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i],
      steps = Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
    for (let j = 0; j <= steps; j++)
      visit(
        Math.round(a.x + ((b.x - a.x) * j) / steps),
        Math.round(a.y + ((b.y - a.y) * j) / steps),
      );
  }
}
export function createStoryMap(civilization: CivilizationId) {
  const tiles: Tile[] = Array.from({ length: STORY_SIZE ** 2 }, (_, id) => {
    const x = id % STORY_SIZE,
      y = Math.floor(id / STORY_SIZE);
    const land = COASTLINE[Math.floor(y / 2)][Math.floor(x / 2)] === ".";
    return {
      id,
      x,
      y,
      terrain: land ? "plain" : "deep",
      resource: null,
      owner: null,
      cityId: null,
      building: null,
      road: false,
      ruin: false,
    };
  });
  // Fixed woodland bands are intentionally interrupted around major valleys.
  for (const tile of tiles)
    if (tile.terrain === "plain" && (tile.x * 3 + tile.y * 7) % 13 < 5)
      tile.terrain = "forest";
  for (const range of MOUNTAINS)
    trace(range, (x, y) => {
      const t = tiles[y * 32 + x];
      if (t.terrain !== "deep") t.terrain = "mountain";
    });
  for (const river of RIVERS)
    trace(river, (x, y) => {
      tiles[y * 32 + x].terrain = "shallow";
    });
  // Explicit clearings are part of the authored terrain and do not depend on faction choice.
  for (const city of STORY_CITIES) {
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const tile = tiles[(city.y + dy) * 32 + city.x + dx];
        if (
          tile &&
          (Math.abs(dx) + Math.abs(dy) <= 1 || city.capitalOfCivilization)
        )
          tile.terrain = dx === -1 && dy === -1 ? "forest" : "plain";
      }
    tiles[city.y * 32 + city.x].terrain = "plain";
  }
  for (const id of [0, 31, 992, 1023]) {
    tiles[id].lighthouse = true;
    tiles[id].terrain = "plain";
  }
  for (const t of tiles)
    if (t.terrain === "deep") {
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const x = t.x + dx,
            y = t.y + dy;
          if (
            x >= 0 &&
            y >= 0 &&
            x < 32 &&
            y < 32 &&
            ["plain", "forest", "mountain"].includes(tiles[y * 32 + x].terrain)
          )
            t.terrain = "shallow";
        }
    }
  for (const t of tiles) {
    if (t.lighthouse) continue;
    const near = STORY_CITIES.some(
      (c) => Math.max(Math.abs(c.x - t.x), Math.abs(c.y - t.y)) <= 2,
    );
    const code = (t.x * 7 + t.y * 11) % 11;
    if (near && code < 6) {
      if (t.terrain === "plain") t.resource = code % 2 ? "fruit" : "crop";
      else if (t.terrain === "forest") t.resource = "animal";
      else if (t.terrain === "mountain") t.resource = "ore";
      else if (t.terrain === "shallow") t.resource = "fish";
    } else if (t.terrain === "deep" && code === 0 && (t.x + t.y) % 3 === 0)
      t.resource = "starfish";
  }
  for (const city of STORY_CITIES) {
    const center = tiles[city.y * 32 + city.x];
    center.resource = null;
    if (city.capitalOfCivilization) {
      tiles[center.id - 1].resource = "fruit";
      tiles[center.id + 1].resource = "fruit";
      tiles[center.id - 32].resource = "crop";
    }
  }
  for (const p of [
    { x: 5, y: 17 },
    { x: 16, y: 10 },
    { x: 21, y: 22 },
    { x: 30, y: 28 },
    { x: 11, y: 13 },
  ]) {
    const t = tiles[p.y * 32 + p.x];
    t.terrain = "plain";
    t.resource = null;
    t.ruin = true;
  }
  const selected = STORY_FACTIONS.includes(civilization)
    ? civilization
    : "imperia";
  const order = [selected, ...STORY_FACTIONS.filter((c) => c !== selected)];
  return {
    tiles,
    starts: order.map((c) => {
      const city = STORY_CITIES.find((x) => x.capitalOfCivilization === c)!;
      return city.y * 32 + city.x;
    }),
    villages: STORY_CITIES.filter((c) => !c.capitalOfCivilization).map(
      (c) => c.y * 32 + c.x,
    ),
    storyCities: STORY_CITIES.map((c) => ({
      tileId: c.y * 32 + c.x,
      name: c.name,
      capitalOfCivilization: c.capitalOfCivilization,
    })),
  };
}
