import {
  BUILDINGS,
  CIVILIZATIONS,
  OPENING_PROFILES,
  TECHNOLOGIES,
  UNITS,
} from "../game/data/config";
import type { GameState } from "../game/types";

export const MAX_SAVE_BYTES = 8_000_000;
const civilizationIds = new Set([
  "neutral",
  ...CIVILIZATIONS.map((civilization) => civilization.id),
]);
const technologyIds = new Set(TECHNOLOGIES.map((technology) => technology.id));
const terrains = ["plain", "forest", "mountain", "shallow", "deep"];
const resources = ["fruit", "animal", "crop", "ore", "fish", "starfish"];
const eventTypes = [
  "move",
  "attack",
  "death",
  "capture",
  "upgrade",
  "research",
  "turn",
  "info",
];
function check(condition: unknown, section: string): asserts condition {
  if (!condition) throw new Error(`存档中的${section}数据无效或不完整。`);
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function record(value: unknown, section: string): Record<string, unknown> {
  check(isRecord(value), section);
  return value;
}
function text(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}
function integer(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}
function count(value: unknown, minimum = 0): value is number {
  return integer(value) && value >= minimum;
}
function oneOf(value: unknown, values: readonly string[]): value is string {
  return typeof value === "string" && values.includes(value);
}
function owns(object: object, value: unknown): value is string {
  return typeof value === "string" && Object.hasOwn(object, value);
}
function position(value: unknown, size: number): boolean {
  return (
    isRecord(value) &&
    count(value.x) &&
    value.x < size &&
    count(value.y) &&
    value.y < size
  );
}
function indices(value: unknown, length: number): value is number[] {
  return (
    Array.isArray(value) &&
    value.length <= length &&
    value.every((id) => count(id) && id < length) &&
    new Set(value).size === value.length
  );
}
function ratio(value: unknown): boolean {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1
  );
}
function booleans(value: Record<string, unknown>, keys: string[]): boolean {
  return keys.every((key) => typeof value[key] === "boolean");
}

export function serializeGame(game: GameState): string {
  return JSON.stringify({ format: "autumn-v2", game });
}

/** Full structural/reference validation at the external JSON boundary; v1 is intentionally incompatible. */
export function deserializeGame(raw: string): GameState {
  check(
    typeof raw === "string" &&
      raw.length <= MAX_SAVE_BYTES &&
      new TextEncoder().encode(raw).byteLength <= MAX_SAVE_BYTES,
    "文件大小",
  );
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("存档不是有效的 JSON 文件。");
  }
  const envelope = record(parsed, "文件");
  if (envelope.format === "autumn-v1")
    throw new Error("这是旧版规则存档，无法用于当前标准规则；请开始新对局。");
  check(envelope.format === "autumn-v2", "格式");
  const game = record(envelope.game, "对局"),
    options = record(game.options, "开局设置");
  check(game.version === 2, "版本");
  check(count(options.size, 12) && options.size <= 64, "地图大小");
  const size = options.size,
    tileCount = size * size;
  check(count(options.aiCount, 1) && options.aiCount <= 10, "对手数量");
  check(
    text(options.civilization) && civilizationIds.has(options.civilization),
    "文明",
  );
  check(
    oneOf(options.scenario, ["story", "free", "fair"]) &&
      oneOf(options.difficulty, ["easy", "normal"]) &&
      oneOf(options.mapType, [
        "dryland",
        "lakes",
        "continents",
        "archipelago",
        "waterworld",
      ]) &&
      oneOf(options.mode, ["conquest", "score"]),
    "开局设置",
  );
  check(text(options.seed) && count(options.maxRounds, 5), "种子或回合上限");
  check(
    Array.isArray(options.factionNames) &&
      options.factionNames.length <= 11 &&
      options.factionNames.every((name) => typeof name === "string"),
    "势力名称",
  );
  check(
    Array.isArray(options.startingProfiles) &&
      options.startingProfiles.length <= 11 &&
      options.startingProfiles.every(
        (id) =>
          id === "random" ||
          OPENING_PROFILES.some((profile) => profile.id === id),
      ),
    "开局配置",
  );
  const settings = record(options.mapSettings, "地图参数");
  check(
    [
      "landRatio",
      "forestRatio",
      "mountainRatio",
      "resourceDensity",
      "villageDensity",
    ].every((key) => ratio(settings[key])),
    "地图比例",
  );
  check(
    typeof settings.noiseScale === "number" &&
      Number.isFinite(settings.noiseScale) &&
      settings.noiseScale > 0 &&
      settings.noiseScale <= 64,
    "地形尺度",
  );
  check(
    oneOf(settings.spawnMode, ["random", "balanced", "custom"]) &&
      Array.isArray(settings.customSpawns) &&
      settings.customSpawns.length <= 11 &&
      settings.customSpawns.every((spawn) => position(spawn, size)),
    "出生点",
  );
  if (options.scenario === "free" && settings.spawnMode === "custom") {
    check(
      settings.customSpawns.length === options.aiCount + 1,
      "自定义出生点数量",
    );
    check(
      new Set(
        settings.customSpawns.map((spawn) => {
          const p = spawn as { x: number; y: number };
          return p.y * size + p.x;
        }),
      ).size === settings.customSpawns.length,
      "自定义出生点重复",
    );
  }
  check(
    count(game.round, 1) &&
      count(game.nextId, 1) &&
      oneOf(game.status, ["playing", "finished"]),
    "回合",
  );
  check(
    Array.isArray(game.players) && game.players.length === options.aiCount + 1,
    "文明列表",
  );
  check(Array.isArray(game.tiles) && game.tiles.length === tileCount, "地图");
  check(
    Array.isArray(game.cities) &&
      game.cities.length > 0 &&
      game.cities.length <= tileCount,
    "城市列表",
  );
  check(
    Array.isArray(game.units) && game.units.length <= tileCount,
    "部队列表",
  );
  check(Array.isArray(game.events) && game.events.length <= 200, "事件列表");
  const playerCount = game.players.length,
    round = game.round;
  const playerIndex = (value: unknown): value is number =>
    count(value) && value < playerCount;
  const owner = (value: unknown): boolean =>
    value === null || playerIndex(value);
  check(
    playerIndex(game.currentPlayer) && owner(game.winner),
    "当前文明或胜者",
  );
  const players = game.players.map((value, id) => {
    const player = record(value, "文明");
    check(
      player.id === id &&
        text(player.civilization) &&
        civilizationIds.has(player.civilization) &&
        text(player.name),
      "文明标识",
    );
    check(
      typeof player.color === "string" && /^#[\da-f]{6}$/i.test(player.color),
      "势力颜色",
    );
    check(
      booleans(player, ["isAI", "eliminated"]) &&
        count(player.resources) &&
        count(player.score) &&
        count(player.bonusScore),
      "文明状态",
    );
    check(
      Array.isArray(player.technologies) &&
        player.technologies.every(
          (tech) => text(tech) && technologyIds.has(tech),
        ) &&
        new Set(player.technologies).size === player.technologies.length,
      "科技",
    );
    check(
      indices(player.explored, tileCount) && indices(player.visible, tileCount),
      "视野",
    );
    const explored = new Set(player.explored);
    check(
      player.visible.every((tileId) => explored.has(tileId)),
      "已探索区域",
    );
    for (const field of ["peaceWith", "peaceOffers", "embassies", "metPlayers"])
      check(
        indices(player[field], playerCount) &&
          !(player[field] as number[]).includes(id),
        "外交关系",
      );
    check(
      count(player.lastAttackRound) && player.lastAttackRound <= round,
      "攻击回合",
    );
    check(
      Array.isArray(player.builtMonuments) &&
        new Set(player.builtMonuments).size === player.builtMonuments.length &&
        player.builtMonuments.every(
          (id) =>
            owns(BUILDINGS, id) &&
            BUILDINGS[id as keyof typeof BUILDINGS].monument,
        ),
      "纪念碑",
    );
    check(
      player.unlockedMonuments === undefined ||
        (Array.isArray(player.unlockedMonuments) &&
          new Set(player.unlockedMonuments).size ===
            player.unlockedMonuments.length &&
          player.unlockedMonuments.every(
            (id) =>
              owns(BUILDINGS, id) &&
              BUILDINGS[id as keyof typeof BUILDINGS].monument,
          )),
      "纪念碑任务",
    );
    const stats = record(player.stats, "统计");
    check(
      ["kills", "citiesCaptured", "explored", "resourcesEarned"].every((key) =>
        count(stats[key]),
      ) && stats.explored === player.explored.length,
      "统计",
    );
    return player;
  });
  if (options.scenario === "story")
    check(
      players[0].civilization === options.civilization &&
        new Set(players.map((player) => player.civilization)).size ===
          playerCount &&
        players.every((player) => player.civilization !== "neutral"),
      "剧情文明",
    );
  else
    check(
      players.every((player) => player.civilization === "neutral"),
      "独立势力",
    );
  check(
    game.status !== "playing" ||
      (game.winner === null &&
        !players[game.currentPlayer].eliminated &&
        !players[0].eliminated),
    "进行中对局",
  );
  check(
    game.status !== "finished" ||
      game.winner === null ||
      !players[game.winner as number].eliminated,
    "胜者",
  );
  const tiles = game.tiles.map((value, id) => {
    const tile = record(value, "地块");
    check(
      tile.id === id &&
        tile.x === id % size &&
        tile.y === Math.floor(id / size),
      "地块坐标",
    );
    check(
      oneOf(tile.terrain, terrains) &&
        (tile.resource === null || oneOf(tile.resource, resources)),
      "地形或资源",
    );
    check(
      owner(tile.owner) &&
        (tile.cityId === null || text(tile.cityId)) &&
        (tile.building === null || owns(BUILDINGS, tile.building)),
      "地块归属或建筑",
    );
    check(
      booleans(tile, ["road", "ruin"]) &&
        (tile.lighthouse === undefined || typeof tile.lighthouse === "boolean"),
      "道路或遗迹",
    );
    check(
      (tile.builtTurn === undefined ||
        (count(tile.builtTurn) && tile.builtTurn <= round)) &&
        (tile.buildingLevel === undefined || count(tile.buildingLevel)),
      "建筑状态",
    );
    return tile;
  });
  const citiesById = new Map<string, Record<string, unknown>>(),
    territoryOwners = new Map<number, string>(),
    capitals = new Set<number>();
  const cityCounts = Array<number>(playerCount).fill(0);
  game.cities.forEach((value) => {
    const city = record(value, "城市");
    check(
      text(city.id) &&
        !citiesById.has(city.id) &&
        text(city.name) &&
        position(city, size),
      "城市标识或坐标",
    );
    check(owner(city.owner) && owner(city.capitalOf), "城市归属");
    check(
      count(city.level, 1) &&
        integer(city.population) &&
        ["incomeBonus", "defenseBonus", "pendingRewards", "parks"].every(
          (key) => count(city[key]),
        ) &&
        booleans(city, ["connected", "connectionRewarded", "borderExpanded"]),
      "城市发展",
    );
    check(
      Array.isArray(city.pendingRewardLevels) &&
        city.pendingRewardLevels.length === city.pendingRewards &&
        city.pendingRewardLevels.every(
          (level) => count(level, 2) && level <= (city.level as number),
        ),
      "城市奖励",
    );
    check(
      city.infiltratedRound === null ||
        (count(city.infiltratedRound) && city.infiltratedRound <= round),
      "渗透回合",
    );
    check(indices(city.territory, tileCount), "城市领土");
    const center = (city.y as number) * size + (city.x as number);
    check(
      tiles[center].cityId === city.id && tiles[center].owner === city.owner,
      "城市中心",
    );
    check(
      city.owner === null
        ? city.territory.length === 0
        : city.territory.includes(center),
      "城市领土",
    );
    for (const tileId of city.territory) {
      check(
        !territoryOwners.has(tileId) &&
          tiles[tileId].owner === city.owner &&
          (tiles[tileId].cityId === null || tiles[tileId].cityId === city.id),
        "城市领土关联",
      );
      territoryOwners.set(tileId, city.id);
    }
    if (city.capitalOf !== null) {
      check(!capitals.has(city.capitalOf as number), "首都");
      capitals.add(city.capitalOf as number);
    }
    if (city.owner !== null) cityCounts[city.owner as number]++;
    citiesById.set(city.id, city);
  });
  for (const tile of tiles) {
    check(
      tile.cityId === null || citiesById.has(tile.cityId as string),
      "地块城市关联",
    );
    if (tile.cityId !== null) {
      const city = citiesById.get(tile.cityId as string)!;
      check(city.x === tile.x && city.y === tile.y, "城市位置关联");
    }
    check(
      tile.owner === null || territoryOwners.has(tile.id as number),
      "领土归属",
    );
  }
  players.forEach((player, id) =>
    check(player.eliminated === (cityCounts[id] === 0), "文明存续状态"),
  );
  const unitIds = new Set<string>(),
    occupied = new Set<number>();
  for (const value of game.units) {
    const unit = record(value, "部队");
    check(
      text(unit.id) && !unitIds.has(unit.id) && position(unit, size),
      "部队标识或坐标",
    );
    check(
      playerIndex(unit.owner) &&
        !players[unit.owner].eliminated &&
        owns(UNITS, unit.type),
      "部队归属或兵种",
    );
    check(
      count(unit.maxHp, 1) &&
        unit.maxHp <= 100 &&
        count(unit.hp, 1) &&
        unit.hp <= unit.maxHp &&
        count(unit.kills) &&
        booleans(unit, [
          "veteran",
          "moved",
          "attacked",
          "escapeUsed",
          "hidden",
          "hiddenAtTurnStart",
        ]),
      "部队生命或行动",
    );
    check(
      unit.independent === undefined || typeof unit.independent === "boolean",
      "独立部队",
    );
    check(
      unit.homeCityId === "" ||
        (text(unit.homeCityId) && citiesById.has(unit.homeCityId)),
      "部队所属城市",
    );
    check(
      unit.capturedTurn === null ||
        (count(unit.capturedTurn) && unit.capturedTurn <= round),
      "围城回合",
    );
    if (unit.carried !== undefined) {
      const carried = record(unit.carried, "运输乘员");
      check(
        owns(UNITS, carried.type) &&
          count(carried.maxHp, 1) &&
          carried.maxHp <= 100 &&
          typeof carried.veteran === "boolean" &&
          count(carried.kills),
        "运输乘员",
      );
      check(
        !UNITS[carried.type as keyof typeof UNITS].skills.includes("water"),
        "运输乘员兵种",
      );
    }
    const tileId = (unit.y as number) * size + (unit.x as number);
    check(!occupied.has(tileId), "部队占位");
    const generatedId = /^unit-(\d+)$/.exec(unit.id);
    check(!generatedId || Number(generatedId[1]) < game.nextId, "部队序号");
    occupied.add(tileId);
    unitIds.add(unit.id);
  }
  const eventIds = new Set<number>();
  for (const value of game.events) {
    const event = record(value, "事件");
    check(
      count(event.id, 1) &&
        event.id < game.nextId &&
        !eventIds.has(event.id) &&
        oneOf(event.type, eventTypes) &&
        text(event.message) &&
        playerIndex(event.player),
      "事件标识",
    );
    check(
      (event.at === undefined || position(event.at, size)) &&
        (event.from === undefined || position(event.from, size)),
      "事件坐标",
    );
    check(
      (event.unitId === undefined || text(event.unitId)) &&
        (event.damage === undefined || count(event.damage)),
      "事件内容",
    );
    eventIds.add(event.id);
  }
  return game as unknown as GameState;
}
