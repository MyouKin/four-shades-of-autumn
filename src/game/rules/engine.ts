import {
  BUILDINGS,
  CIVILIZATIONS,
  DEFAULT_OPTIONS,
  DEFAULT_MAP_SETTINGS,
  NEUTRAL_NAMES,
  OPENING_PROFILES,
  PLAYER_COLORS,
  TECHNOLOGIES,
  UNITS,
} from "../data/config";
import { distance, generateMap, isWater, neighbors } from "../map/generate";
import { hashSeed, seededRandom } from "../map/random";
import type {
  Action,
  ActionResult,
  BuildingId,
  City,
  CombatPreview,
  GameEvent,
  GameOptions,
  GameState,
  MonumentId,
  Player,
  Position,
  Reward,
  Tile,
  Unit,
  UnitSkill,
  UnitType,
} from "../types";
export const tileAt = (s: GameState, p: Position): Tile =>
  s.tiles[p.y * s.options.size + p.x];
export const unitAt = (s: GameState, p: Position): Unit | undefined =>
  s.units.find((u) => u.x === p.x && u.y === p.y);
export const cityAt = (s: GameState, p: Position): City | undefined =>
  s.cities.find((c) => c.x === p.x && c.y === p.y);
export const hasTech = (p: Player, id: string): boolean =>
  p.technologies.includes(id);
const skill = (u: Unit, id: UnitSkill): boolean =>
  UNITS[u.type].skills.includes(id);
export const getPlayerColor = (s: GameState, id: number): string =>
  s.players[id]?.color ?? "#aaa";
export const populationNeeded = (c: City): number => c.level + 1;
export const getCityCapacity = (c: City): number => c.level + 1;
export const getTrainingCost = (
  _s: GameState,
  _id: number,
  type: UnitType,
): number => UNITS[type].cost;
export const getEmbassyCost = (_s: GameState, _id: number): number => 5;
export const getUnitMaxHp = (u: Unit): number => u.maxHp;
export const isAtPeace = (s: GameState, a: number, b: number): boolean =>
  s.players[a].peaceWith.includes(b);
export const getPendingUpgradeCity = (s: GameState, playerId = s.currentPlayer): City | undefined =>
  s.cities.find((city) => city.owner === playerId && city.pendingRewardLevels.length > 0);
export const getUpgradeRewards = (city: City): Reward[] => {
  const level = city.pendingRewardLevels[0];
  return !level
    ? []
    : level === 2
      ? ["income", "explore"]
      : level === 3
        ? ["resources", "defense"]
        : level === 4
          ? ["population", "territory"]
          : ["park", "giant"];
};
const event = (s: GameState, data: Omit<GameEvent, "id">): void => {
  s.events.push({ ...data, id: s.nextId++ });
  if (s.events.length > 80) s.events.shift();
};
function area(s: GameState, at: Position, radius: number): Tile[] {
  const result: Tile[] = [];
  for (
    let y = Math.max(0, at.y - radius);
    y <= Math.min(s.options.size - 1, at.y + radius);
    y++
  )
    for (
      let x = Math.max(0, at.x - radius);
      x <= Math.min(s.options.size - 1, at.x + radius);
      x++
    )
      result.push(s.tiles[y * s.options.size + x]);
  return result;
}
export function isUnitVisible(s: GameState, u: Unit, viewer: number): boolean {
  return (
    u.owner === viewer ||
    (s.players[viewer].visible.includes(tileAt(s, u).id) &&
      (!u.hidden || isAtPeace(s, viewer, u.owner)))
  );
}
export function getVisibleResource(
  s: GameState,
  tile: Tile,
  viewer: number,
): Tile["resource"] {
  const r = tile.resource,
    p = s.players[viewer];
  return (r === "crop" && !hasTech(p, "organization")) ||
    (r === "ore" && !hasTech(p, "climbing")) ||
    (r === "starfish" && !hasTech(p, "fishing"))
    ? null
    : r;
}
export function getBuildingLevel(s: GameState, tile: Tile): number {
  const adjacent = neighbors(s.tiles, s.options.size, tile).filter(
    (t) => t.owner === tile.owner,
  );
  if (tile.building === "windmill")
    return adjacent.filter((t) => t.building === "farm").length;
  if (tile.building === "sawmill")
    return adjacent.filter((t) => t.building === "lumberHut").length;
  if (tile.building === "forge")
    return adjacent.filter((t) => t.building === "mine").length;
  if (tile.building === "market")
    return Math.min(
      8,
      adjacent
        .filter((t) =>
          ["windmill", "sawmill", "forge"].includes(t.building ?? ""),
        )
        .reduce((n, t) => n + getBuildingLevel(s, t), 0),
    );
  if (tile.building?.toLowerCase().includes("temple"))
    return Math.min(
      5,
      1 + Math.floor(Math.max(0, s.round - (tile.builtTurn ?? s.round)) / 2),
    );
  return 1;
}
function buildingPopulation(s: GameState, tile: Tile): number {
  if (!tile.building) return 0;
  const id = tile.building;
  return ["windmill", "sawmill", "forge"].includes(id)
    ? getBuildingLevel(s, tile) * (id === "forge" ? 2 : 1)
    : BUILDINGS[id].population;
}
export function getCityIncome(s: GameState, cityId: string): number {
  const c = s.cities.find((c) => c.id === cityId);
  if (!c || c.owner === null) return 0;
  const occupying = unitAt(s, c),
    siege =
      occupying &&
      occupying.owner !== c.owner &&
      !isAtPeace(s, c.owner, occupying.owner);
  let base =
    siege || c.infiltratedRound !== null
      ? 0
      : Math.max(
          0,
          c.level +
            Number(c.capitalOf === c.owner) +
            c.incomeBonus +
            Math.min(0, c.population),
        );
  for (const id of c.territory) {
    const t = s.tiles[id];
    if (t.building === "market" && t.owner === c.owner)
      base += getBuildingLevel(s, t);
  }
  return base;
}
export function getIncome(s: GameState, id: number): number {
  let n = s.cities
    .filter((c) => c.owner === id)
    .reduce((a, c) => a + getCityIncome(s, c.id), 0);
  for (const p of s.players)
    if (p.embassies.includes(id) || p.id === id) {
      const partners = p.id === id ? p.embassies : [p.id];
      for (const other of partners)
        if (!s.players[other].eliminated) n += isAtPeace(s, id, other) ? 4 : 2;
    }
  return n;
}
export function getTechCost(s: GameState, id: number, techId: string): number {
  const t = TECHNOLOGIES.find((t) => t.id === techId);
  if (!t) return Infinity;
  const cost = t.tier * s.cities.filter((c) => c.owner === id).length + 4;
  return hasTech(s.players[id], "philosophy")
    ? Math.ceil((cost * 2) / 3)
    : cost;
}
export function getScore(s: GameState, id: number): number {
  const p = s.players[id];
  let n =
    p.bonusScore +
    p.explored.length * 5 +
    p.technologies.reduce(
      (v, t) => v + (TECHNOLOGIES.find((d) => d.id === t)?.tier ?? 0) * 100,
      0,
    );
  for (const c of s.cities.filter((c) => c.owner === id))
    n += 100 + (c.level - 1) * 50 + c.population * 5 + c.parks * 250;
  for (const u of s.units.filter((u) => u.owner === id))
    n += UNITS[u.carried?.type ?? u.type].cost * 5;
  for (const t of s.tiles)
    if (t.owner === id) {
      n += 20;
      if (t.building && BUILDINGS[t.building].monument) n += 400;
      else if (t.building?.toLowerCase().includes("temple"))
        n += 100 * getBuildingLevel(s, t);
    }
  return n;
}
function claimTerritory(s: GameState, c: City, radius: number): void {
  if (c.owner === null) return;
  for (const t of area(s, c, radius)) {
    if (
      (t.owner !== null && t.owner !== c.owner) ||
      (t.cityId && t.cityId !== c.id) ||
      s.cities.some(
        (other) => other.id !== c.id && other.territory.includes(t.id),
      )
    )
      continue;
    t.owner = c.owner;
    if (!c.territory.includes(t.id)) c.territory.push(t.id);
  }
}
function addPopulation(s: GameState, c: City, amount: number): void {
  c.population += amount;
  while (c.population >= populationNeeded(c)) {
    c.population -= populationNeeded(c);
    c.level++;
    c.pendingRewards++;
    c.pendingRewardLevels.push(c.level);
    event(s, {
      type: "upgrade",
      player: c.owner!,
      at: { x: c.x, y: c.y },
      message: `${c.name}升至 ${c.level} 级，请选择奖励。`,
    });
  }
}
function reveal(
  s: GameState,
  set: Set<number>,
  at: Position,
  radius: number,
): void {
  for (const t of area(s, at, radius)) set.add(t.id);
}
export function updateVisibility(s: GameState): void {
  for (const p of s.players) {
    const visible = new Set<number>(),
      explored = new Set(p.explored);
    for (const c of s.cities)
      if (c.owner === p.id) reveal(s, visible, c, c.borderExpanded ? 2 : 1);
    for (const u of s.units)
      if (u.owner === p.id)
        reveal(
          s,
          visible,
          u,
          Math.max(
            UNITS[u.type].vision,
            tileAt(s, u).terrain === "mountain" ? 2 : 1,
          ),
        );
    if (hasTech(p, "diplomacy"))
      for (const c of s.cities)
        if (c.capitalOf !== null && p.metPlayers.includes(c.capitalOf))
          reveal(s, visible, c, p.embassies.includes(c.capitalOf) ? 1 : 0);
    for (const id of visible) explored.add(id);
    p.explored = [...explored].sort((a, b) => a - b);
    p.visible = [...p.explored];
    p.stats.explored = p.explored.length;
  }
}
function discover(s: GameState, before: GameState): void {
  for (const p of s.players) {
    const capital = s.cities.find(
      (c) => c.owner === p.id && c.capitalOf === p.id,
    );
    if (capital) {
      const previous = new Set(before.players[p.id]?.explored ?? []);
      for (const id of p.explored)
        if (s.tiles[id].lighthouse && !previous.has(id))
          addPopulation(s, capital, 1);
    }
    for (const other of s.players) {
      if (
        other.id === p.id ||
        p.metPlayers.includes(other.id) ||
        other.eliminated
      )
        continue;
      if (
        s.units.some(
          (u) => u.owner === other.id && isUnitVisible(s, u, p.id),
        ) ||
        s.cities.some(
          (c) => c.owner === other.id && p.visible.includes(tileAt(s, c).id),
        )
      ) {
        p.metPlayers.push(other.id);
        const gift = Math.min(
          12,
          3 * Math.max(1, Math.ceil(getScore(s, other.id) / 1000)),
        );
        p.resources += gift;
        event(s, {
          type: "info",
          player: p.id,
          message: `初次接触${other.name}，获得 ${gift} 星。`,
        });
      }
    }
  }
}
function freshUnit(
  s: GameState,
  owner: number,
  type: UnitType,
  at: Position,
  homeCityId: string,
  ready = false,
): Unit {
  return {
    id: `unit-${s.nextId++}`,
    owner,
    type,
    x: at.x,
    y: at.y,
    hp: UNITS[type].hp,
    maxHp: UNITS[type].hp,
    kills: 0,
    veteran: false,
    moved: !ready,
    attacked: !ready,
    homeCityId,
    capturedTurn:
      tileAt(s, at).cityId && cityAt(s, at)?.owner !== owner ? s.round : null,
    escapeUsed: false,
    hidden: false,
    hiddenAtTurnStart: false,
    ...(type === "pirate"
      ? {
          carried: {
            type: "dagger" as const,
            maxHp: 10,
            veteran: false,
            kills: 0,
          },
        }
      : {}),
  };
}
export function createGame(input: GameOptions): GameState {
  const options: GameOptions = {
    ...DEFAULT_OPTIONS,
    ...input,
    mapSettings: { ...DEFAULT_MAP_SETTINGS, ...input.mapSettings },
    factionNames: input.factionNames ?? [],
    startingProfiles: input.startingProfiles ?? [],
    seed: input.seed?.trim() || "2026",
  };
  options.aiCount =
    options.scenario === "story"
      ? 4
      : Math.min(10, Math.max(1, Math.floor(options.aiCount)));
  options.size =
    options.scenario === "story"
      ? 32
      : Math.min(64, Math.max(12, Math.floor(options.size)));
  options.factionNames = Array.from({ length: options.aiCount + 1 }, (_, id) =>
    (input.factionNames?.[id] ?? "").trim().slice(0, 20),
  );
  options.startingProfiles = Array.from(
    { length: options.aiCount + 1 },
    (_, id) => {
      const profile = input.startingProfiles?.[id];
      return OPENING_PROFILES.some((p) => p.id === profile)
        ? profile
        : "random";
    },
  );
  if (
    options.scenario === "story" &&
    !CIVILIZATIONS.some((c) => c.id === options.civilization)
  )
    options.civilization = "imperia";
  if (options.scenario !== "story") options.civilization = "neutral";
  options.maxRounds =
    options.mode === "score" ? 30 : Math.max(30, options.maxRounds);
  const map = generateMap(options),
    chosen = CIVILIZATIONS.find((c) => c.id === options.civilization),
    story = chosen
      ? [chosen, ...CIVILIZATIONS.filter((c) => c !== chosen)]
      : [];
  const random = seededRandom(options.seed + ":names"),
    names = [...NEUTRAL_NAMES].sort(() => random() - 0.5);
  const fixedProfiles: Record<string, string> = {
    imperia: "organization",
    determia: "strategy",
    nosta: "luxury",
    ida: "hunting",
    rina: "fishing",
  };
  const profiles = Array.from({ length: options.aiCount + 1 }, (_, id) => {
    const selected =
      options.scenario === "story"
        ? fixedProfiles[story[id].id]
        : options.startingProfiles[id];
    return (
      OPENING_PROFILES.find((p) => p.id === selected) ??
      OPENING_PROFILES[
        hashSeed(`${options.seed}:opening:${id}`) % OPENING_PROFILES.length
      ]
    );
  });
  const players: Player[] = Array.from(
    { length: options.aiCount + 1 },
    (_, id) => ({
      id,
      civilization: options.scenario === "story" ? story[id].id : "neutral",
      name:
        options.scenario === "story"
          ? story[id].name
          : options.factionNames[id]?.trim() || names[id],
      color: options.scenario === "story" ? story[id].color : PLAYER_COLORS[id],
      isAI: id !== 0,
      resources: profiles[id].stars,
      technologies: profiles[id].technology ? [profiles[id].technology!] : [],
      explored: [],
      visible: [],
      eliminated: false,
      score: 0,
      peaceWith: [],
      peaceOffers: [],
      embassies: [],
      metPlayers: [],
      lastAttackRound: 0,
      builtMonuments: [],
      bonusScore: 0,
      stats: { kills: 0, citiesCaptured: 0, explored: 0, resourcesEarned: 0 },
    }),
  );
  const s: GameState = {
    version: 2,
    options,
    tiles: map.tiles,
    cities: [],
    units: [],
    players,
    round: 1,
    currentPlayer: 0,
    status: "playing",
    winner: null,
    events: [],
    nextId: 1,
  };
  const makeCity = (
    tileId: number,
    id: string,
    name: string,
    owner: number | null,
  ): City => {
    const tile = s.tiles[tileId];
    const c: City = {
      id,
      name,
      owner,
      capitalOf: owner,
      x: tile.x,
      y: tile.y,
      level: 1,
      population: 0,
      incomeBonus: 0,
      defenseBonus: 0,
      territory: [],
      pendingRewards: 0,
      pendingRewardLevels: [],
      connected: false,
      connectionRewarded: false,
      borderExpanded: false,
      parks: 0,
      infiltratedRound: null,
    };
    tile.cityId = id;
    tile.resource = null;
    tile.ruin = false;
    s.cities.push(c);
    if (owner !== null) claimTerritory(s, c, 1);
    return c;
  };
  map.starts.forEach((tileId, id) => {
    const c = makeCity(
      tileId,
      `capital-${id}`,
      options.scenario === "story"
        ? story[id].capital
        : `城市 ${String(id + 1).padStart(2, "0")}`,
      id,
    );
    c.level = profiles[id].cityLevel;
    s.units.push(freshUnit(s, id, profiles[id].unit, c, c.id, true));
    const profile = profiles[id].id;
    const adjacent = neighbors(s.tiles, s.options.size, c).filter(
      (t) => !t.cityId,
    );
    if (
      options.scenario === "fair" &&
      ["organization", "hunting", "fishing", "farming"].includes(profile)
    ) {
      const count = profile === "farming" ? 1 : 2;
      const desired =
        profile === "hunting"
          ? "forest"
          : profile === "fishing"
            ? "shallow"
            : "plain";
      const candidates = [
        ...adjacent.filter((t) => t.terrain === desired),
        ...adjacent.filter((t) => t.terrain !== desired),
      ].filter(
        (t) =>
          !t.lighthouse &&
          !(profile === "fishing" && options.mapType === "dryland"),
      );
      for (const t of candidates.slice(0, count)) {
        t.terrain = desired;
        t.resource =
          profile === "organization"
            ? "fruit"
            : profile === "hunting"
              ? "animal"
              : profile === "fishing"
                ? "fish"
                : "crop";
      }
    }
  });
  map.villages.forEach((tileId, i) => {
    const metadata = map.storyCities?.find((c) => c.tileId === tileId);
    makeCity(
      tileId,
      `village-${i}`,
      options.scenario === "story"
        ? (metadata?.name ?? `城市 ${i + 1}`)
        : `城市 ${String(options.aiCount + i + 2).padStart(2, "0")}`,
      null,
    );
  });
  updateVisibility(s);
  for (const p of players) {
    p.explored = p.explored.filter((id) => !s.tiles[id].lighthouse);
    p.visible = p.visible.filter((id) => !s.tiles[id].lighthouse);
    p.stats.explored = p.explored.length;
  }
  const before = structuredClone(s);
  before.players.forEach((p) => {
    p.explored = [];
  });
  discover(s, before);
  players.forEach((p) => {
    p.score = getScore(s, p.id);
  });
  event(s, {
    type: "info",
    player: 0,
    message: "对局开始。",
  });
  return s;
}
export function getMovement(_s: GameState, u: Unit): number {
  return UNITS[u.type].movement;
}
export function movementCost(
  s: GameState,
  u: Unit,
  from: Tile,
  to: Tile,
): number {
  const p = s.players[u.owner];
  if (to.terrain === "mountain" && !hasTech(p, "climbing")) return Infinity;
  const targetCity = to.cityId
    ? s.cities.find((c) => c.id === to.cityId)
    : undefined;
  if (
    targetCity?.owner !== null &&
    targetCity?.owner !== undefined &&
    targetCity.owner !== u.owner &&
    (isAtPeace(s, u.owner, targetCity.owner) || skill(u, "infiltrate"))
  )
    return Infinity;
  if (skill(u, "water")) {
    if (!isWater(to) && to.building !== "bridge")
      return u.carried ? UNITS[u.type].movement : Infinity;
    if (to.terrain === "deep" && !hasTech(p, "sailing")) return Infinity;
    return 1;
  }
  if (isWater(to) && to.building !== "bridge") {
    if (
      to.building !== "port" ||
      (to.owner !== u.owner && !p.peaceWith.includes(to.owner ?? -1)) ||
      !hasTech(p, "fishing")
    )
      return Infinity;
    return UNITS[u.type].movement;
  }
  if (skill(u, "creep")) return 1;
  const road = (t: Tile) => t.road || !!t.cityId || t.building === "bridge";
  if (
    road(from) &&
    road(to) &&
    (to.owner === null ||
      to.owner === u.owner ||
      isAtPeace(s, u.owner, to.owner))
  )
    return 0.5;
  return to.terrain === "forest" || to.terrain === "mountain"
    ? UNITS[u.type].movement
    : 1;
}
interface MovementSearch {
  start: number | null;
  reachable: number[];
  previous: Map<number, number>;
}
/** Shared weighted search for movement highlighting and animation routes. */
function searchMovement(
  s: GameState,
  unitId: string,
  enforceHidden: boolean,
): MovementSearch {
  const previous = new Map<number, number>();
  const empty: MovementSearch = { start: null, reachable: [], previous };
  const u = s.units.find((u) => u.id === unitId);
  if (!u || u.owner !== s.currentPlayer || s.status !== "playing") return empty;
  const escaping = u.attacked && skill(u, "escape") && !u.escapeUsed;
  if ((u.moved || u.attacked) && !escaping) return empty;
  const p = s.players[u.owner],
    known = new Set(p.explored),
    occupancy = new Map(s.units.map((t) => [tileAt(s, t).id, t])),
    budget = UNITS[u.type].movement,
    start = tileAt(s, u).id,
    costs = new Map([[start, 0]]),
    queue = [start],
    result = new Set<number>();
  while (queue.length) {
    queue.sort((a, b) => costs.get(a)! - costs.get(b)!);
    const id = queue.shift()!,
      from = s.tiles[id],
      spent = costs.get(id)!;
    if (
      id !== start &&
      (isWater(from) !== isWater(tileAt(s, u)) ||
        (!skill(u, "creep") &&
          neighbors(s.tiles, s.options.size, from).some((t) => {
            const e = occupancy.get(t.id);
            return (
              e &&
              e.owner !== u.owner &&
              !isAtPeace(s, u.owner, e.owner) &&
              (enforceHidden || isUnitVisible(s, e, u.owner))
            );
          })))
    )
      continue;
    for (const to of neighbors(s.tiles, s.options.size, from)) {
      if (!known.has(to.id)) continue;
      const occupant = occupancy.get(to.id);
      if (
        occupant &&
        (enforceHidden || isUnitVisible(s, occupant, u.owner)) &&
        !skill(u, "creep")
      )
        continue;
      const step = movementCost(s, u, from, to);
      let cost = spent + step;
      if (
        Number.isFinite(step) &&
        spent < budget &&
        (to.terrain === "forest" ||
          to.terrain === "mountain" ||
          isWater(from) !== isWater(to)) &&
        step >= budget
      )
        cost = budget;
      if (cost > budget || cost >= (costs.get(to.id) ?? Infinity)) continue;
      costs.set(to.id, cost);
      previous.set(to.id, id);
      queue.push(to.id);
      if (!occupant || (!enforceHidden && !isUnitVisible(s, occupant, u.owner)))
        result.add(to.id);
    }
  }
  result.delete(start);
  return { start, reachable: [...result], previous };
}
export function getReachableTiles(
  s: GameState,
  unitId: string,
  enforceHidden = false,
): number[] {
  return searchMovement(s, unitId, enforceHidden).reachable;
}
/** Lowest-cost legal route, including both endpoints. A same-tile move,
 * unreachable destination or unavailable unit has no route. Hidden obstacles
 * follow the same visibility convention as getReachableTiles. */
export function getMovementPath(
  s: GameState,
  unitId: string,
  to: number,
  enforceHidden = false,
): number[] {
  if (!Number.isInteger(to) || !s.tiles[to]) return [];
  const { start, reachable, previous } = searchMovement(
    s,
    unitId,
    enforceHidden,
  );
  if (start === null || !reachable.includes(to)) return [];
  const path = [to];
  let current = to;
  while (current !== start) {
    const parent = previous.get(current);
    if (parent === undefined) return [];
    path.push(parent);
    current = parent;
  }
  return path.reverse();
}
function hasTerrainDefense(p: Player, t: Tile): boolean {
  return (
    (t.terrain === "mountain" && hasTech(p, "climbing")) ||
    (t.terrain === "forest" && hasTech(p, "archery")) ||
    (isWater(t) && hasTech(p, "aquatism"))
  );
}
export function getTerrainDefense(s: GameState, u: Unit): number {
  const t = tileAt(s, u),
    p = s.players[u.owner],
    c = cityAt(s, u);
  if (c?.owner === u.owner && skill(u, "fortify"))
    return c.defenseBonus ? 4 : 1.5;
  return hasTerrainDefense(p, t) ? 1.5 : 1;
}
export function getAttackTargets(s: GameState, id: string): Unit[] {
  const u = s.units.find((u) => u.id === id);
  if (
    !u ||
    u.owner !== s.currentPlayer ||
    u.attacked ||
    (u.moved && !skill(u, "dash")) ||
    UNITS[u.type].attack === 0 ||
    skill(u, "infiltrate") ||
    s.status !== "playing"
  )
    return [];
  return s.units.filter(
    (t) =>
      t.owner !== u.owner &&
      !isAtPeace(s, u.owner, t.owner) &&
      distance(u, t) <= UNITS[u.type].range &&
      isUnitVisible(s, t, u.owner),
  );
}
function combat(
  s: GameState,
  a: Unit,
  d: Unit,
): { damage: number; retaliation: number } {
  const ad = UNITS[a.type],
    dd = UNITS[d.type];
  // Cancel the common max-HP denominator before division so a true 3.5
  // cannot become 3.4999999999999996 before rounding a wounded unit's hit.
  const attack = ad.attack * a.hp * d.maxHp,
    defense = dd.defense * d.hp * a.maxHp * getTerrainDefense(s, d),
    total = attack + defense;
  const damage = total ? Math.round((attack * ad.attack * 4.5) / total) : 0;
  const retaliation =
    d.hp > damage &&
    distance(a, d) <= dd.range &&
    !skill(d, "stiff") &&
    !skill(a, "surprise") &&
    isUnitVisible(s, a, d.owner) &&
    total
      ? Math.round((defense * dd.defense * 4.5) / total)
      : 0;
  return { damage, retaliation };
}
function applyDamage(target: Unit, damage: number): number {
  const lostHp = Math.min(target.hp, damage);
  target.hp -= lostHp;
  return lostHp;
}
export function previewCombat(
  s: GameState,
  id: string,
  targetId: string,
): CombatPreview {
  const a = s.units.find((u) => u.id === id),
    d = s.units.find((u) => u.id === targetId);
  if (!a || !d || !getAttackTargets(s, id).some((u) => u.id === targetId))
    return { damage: 0, retaliation: 0, canAttack: false };
  const result = combat(s, a, d);
  return {
    damage: Math.min(d.hp, result.damage),
    retaliation: Math.min(a.hp, result.retaliation),
    canAttack: true,
  };
}
function monumentReady(s: GameState, p: Player, id: MonumentId): boolean {
  if (p.builtMonuments.includes(id)) return false;
  if (p.unlockedMonuments?.includes(id)) return true;
  switch (id) {
    case "altarOfPeace":
      return hasTech(p, "meditation") && s.round - p.lastAttackRound >= 5;
    case "emperorTomb":
      return hasTech(p, "trade") && p.resources >= 100;
    case "eyeOfGod":
      return (
        s.tiles.some((t) => t.lighthouse) &&
        s.tiles
          .filter((t) => t.lighthouse)
          .every((t) => p.explored.includes(t.id))
      );
    case "gateOfPower":
      return p.stats.kills >= 10;
    case "grandBazaar":
      return (
        s.cities.filter((c) => c.owner === p.id && c.connected).length >= 5
      );
    case "parkOfFortune":
      return s.cities.some((c) => c.owner === p.id && c.level >= 5);
    case "towerOfWisdom":
      return p.technologies.length === TECHNOLOGIES.length;
  }
}
function cityOfTile(s: GameState, id: number): City | undefined {
  return s.cities.find((c) => c.territory.includes(id));
}
export function canBuild(
  s: GameState,
  tileId: number,
  id: BuildingId,
): boolean {
  const t = s.tiles[tileId],
    d = BUILDINGS[id],
    p = s.players[s.currentPlayer];
  if (
    !t ||
    !d ||
    t.owner !== p.id ||
    t.cityId ||
    t.ruin ||
    t.building ||
    !p.visible.includes(tileId) ||
    p.resources < d.cost ||
    (d.tech && !hasTech(p, d.tech)) ||
    !d.terrain.includes(t.terrain)
  )
    return false;
  const occupant = unitAt(s, t);
  if (occupant && occupant.owner !== p.id) return false;
  if (d.resource && d.resource !== t.resource) return false;
  const c = cityOfTile(s, tileId);
  if (!c) return false;
  if (d.unique && c.territory.some((i) => s.tiles[i].building === id))
    return false;
  if (d.monument && !monumentReady(s, p, id as MonumentId)) return false;
  const adjacent = neighbors(s.tiles, s.options.size, t).filter(
    (n) => n.owner === p.id,
  );
  if (id === "port" && !adjacent.some((n) => !isWater(n))) return false;
  if (id === "bridge") {
    const opposite = [
      [
        [-1, 0],
        [1, 0],
      ],
      [
        [0, -1],
        [0, 1],
      ],
    ];
    if (
      !opposite.some((pair) =>
        pair.every(([dx, dy]) => {
          const x = t.x + dx,
            y = t.y + dy;
          return (
            x >= 0 &&
            y >= 0 &&
            x < s.options.size &&
            y < s.options.size &&
            !isWater(s.tiles[y * s.options.size + x])
          );
        }),
      )
    )
      return false;
  }
  const need =
    id === "windmill"
      ? "farm"
      : id === "sawmill"
        ? "lumberHut"
        : id === "forge"
          ? "mine"
          : null;
  if (need && !adjacent.some((t) => t.building === need)) return false;
  if (
    id === "market" &&
    !adjacent.some((t) =>
      ["windmill", "sawmill", "forge"].includes(t.building ?? ""),
    )
  )
    return false;
  return true;
}
export function validateAction(s: GameState, a: Action): string | null {
  if (s.status !== "playing") return "对局已结束。";
  const p = s.players[s.currentPlayer];
  if (!p || p.eliminated) return "当前势力不能行动。";
  if ("unitId" in a) {
    const u = s.units.find((u) => u.id === a.unitId);
    if (!u || u.owner !== p.id) return "请选择己方部队。";
    if (a.type === "MOVE")
      return Number.isInteger(a.to) &&
        s.tiles[a.to] &&
        !unitAt(s, s.tiles[a.to]) &&
        getReachableTiles(s, u.id, true).includes(a.to)
        ? null
        : "目标不可达、被占据，或本回合不能移动。";
    if (a.type === "ATTACK")
      return getAttackTargets(s, u.id).some((t) => t.id === a.targetId)
        ? null
        : "目标不可攻击。移动后攻击需要突进技能。";
    if (a.type === "HEAL")
      return !u.moved && !u.attacked && u.hp < u.maxHp
        ? null
        : "休整需要完整行动与受伤状态。";
    if (a.type === "PROMOTE")
      return !u.veteran && u.kills >= 3 && !skill(u, "static")
        ? null
        : "晋升需要三个击杀，且不能拥有固定技能。";
    if (a.type === "DISBAND")
      return hasTech(p, "freeSpirit") && !u.moved && !u.attacked
        ? null
        : "需要自由精神科技与完整行动。";
    if (a.type === "EXAMINE")
      return tileAt(s, u).ruin && !u.moved && !u.attacked
        ? null
        : "在遗迹停留至下一回合后探索。";
    if (a.type === "HEAL_OTHERS")
      return skill(u, "heal") &&
        !u.moved &&
        !u.attacked &&
        s.units.some(
          (t) =>
            t.owner === u.owner &&
            t.id !== u.id &&
            distance(t, u) <= 1 &&
            t.hp < t.maxHp,
        )
        ? null
        : "需要完整行动与相邻受伤友军。";
    if (a.type === "CONVERT") {
      const target = s.units.find((t) => t.id === a.targetId);
      return skill(u, "convert") &&
        !u.moved &&
        !u.attacked &&
        target &&
        target.owner !== u.owner &&
        !isAtPeace(s, u.owner, target.owner) &&
        distance(u, target) <= 1 &&
        isUnitVisible(s, target, u.owner)
        ? null
        : "心灵术士需要完整行动与相邻可见敌军。";
    }
    if (a.type === "INFILTRATE") {
      const c = s.cities.find((c) => c.id === a.cityId);
      return skill(u, "infiltrate") &&
        !u.attacked &&
        (!u.moved || u.hiddenAtTurnStart) &&
        c &&
        c.owner !== null &&
        c.owner !== p.id &&
        !isAtPeace(s, p.id, c.owner) &&
        distance(c, u) <= 1 &&
        c.infiltratedRound === null &&
        (!unitAt(s, c) || unitAt(s, c)!.owner === c.owner)
        ? null
        : "无法渗透：需相邻敌城、可用行动，城市不能已被渗透或围攻。";
    }
    if (a.type === "UPGRADE_NAVAL") {
      const def = UNITS[a.unitType],
        t = tileAt(s, u);
      return u.type === "raft" &&
        def &&
        ["scout", "rammer", "bomber"].includes(a.unitType) &&
        hasTech(p, def.tech!) &&
        p.resources >= def.cost &&
        (t.owner === p.id || (t.owner !== null && isAtPeace(s, p.id, t.owner)))
        ? null
        : "木筏需位于己方或盟友领土，并拥有对应科技与星星。";
    }
    if (a.type === "CAPTURE") {
      const c = cityAt(s, u);
      if (
        !c ||
        c.owner === p.id ||
        skill(u, "water") ||
        (skill(u, "infiltrate") && c.owner !== null) ||
        (c.owner !== null && isAtPeace(s, p.id, c.owner))
      )
        return "这里没有可占领的城市。";
      return !u.moved &&
        !u.attacked &&
        u.capturedTurn !== null &&
        u.capturedTurn < s.round
        ? null
        : "驻守到下一己方回合，再用完整行动占领。";
    }
  }
  switch (a.type) {
    case "TRAIN": {
      const c = s.cities.find((c) => c.id === a.cityId),
        d = UNITS[a.unitType];
      if (!c || c.owner !== p.id || !d?.trainable) return "无法训练该兵种。";
      if (d.tech && !hasTech(p, d.tech)) return "需要对应科技。";
      if (p.resources < d.cost) return "星星不足。";
      if (unitAt(s, c)) return "请移开城市中心驻军。";
      return s.units.filter(
        (u) =>
          u.owner === p.id &&
          u.homeCityId === c.id &&
          !skill(u, "independent") &&
          !u.independent,
      ).length < getCityCapacity(c)
        ? null
        : "城市单位容量已满。";
    }
    case "RESEARCH": {
      const t = TECHNOLOGIES.find((t) => t.id === a.techId);
      if (!t || hasTech(p, t.id)) return "科技不存在或已研究。";
      const connected =
        t.tier === 1 ||
        t.prerequisites.some((id) => hasTech(p, id)) ||
        TECHNOLOGIES.some(
          (child) => child.prerequisites.includes(t.id) && hasTech(p, child.id),
        );
      return connected && p.resources >= getTechCost(s, p.id, t.id)
        ? null
        : "缺少相邻前置科技或星星不足。";
    }
    case "BUILD":
      return canBuild(s, a.tileId, a.building)
        ? null
        : "不符合建筑地形、相邻建筑、科技、任务或费用要求。";
    case "ROAD": {
      const t = s.tiles[a.tileId],
        occupant = t && unitAt(s, t);
      return t &&
        p.visible.includes(t.id) &&
        hasTech(p, "roads") &&
        p.resources >= 3 &&
        !t.road &&
        !t.cityId &&
        !isWater(t) &&
        t.terrain !== "mountain" &&
        (t.owner === null || t.owner === p.id) &&
        (!occupant || occupant.owner === p.id)
        ? null
        : "道路需要 3 星、道路科技及平原或森林。";
    }
    case "HARVEST": {
      const t = s.tiles[a.tileId];
      if (!t || !p.visible.includes(t.id) || !t.resource || t.building)
        return "这里没有可采集资源。";
      const u = unitAt(s, t);
      if (t.resource === "starfish")
        return hasTech(p, "navigation") &&
          u?.owner === p.id &&
          skill(u, "water") &&
          !u.moved &&
          !u.attacked
          ? null
          : "海星需要导航科技，海军驻守至下一回合。";
      const tech =
        t.resource === "fruit"
          ? "organization"
          : t.resource === "animal"
            ? "hunting"
            : t.resource === "fish"
              ? "fishing"
              : null;
      return t.owner === p.id &&
        tech &&
        hasTech(p, tech) &&
        p.resources >= 2 &&
        (!u || u.owner === p.id)
        ? null
        : "采集需要对应科技、2 星与己方领土。";
    }
    case "CLEAR_FOREST":
    case "BURN_FOREST":
    case "GROW_FOREST":
    case "DESTROY": {
      const t = s.tiles[a.tileId];
      if (
        !t ||
        t.owner !== p.id ||
        !p.visible.includes(t.id) ||
        t.cityId ||
        (unitAt(s, t) && unitAt(s, t)!.owner !== p.id)
      )
        return "需要可见的己方土地。";
      if (a.type === "DESTROY")
        return hasTech(p, "chivalry") &&
          t.building &&
          !BUILDINGS[t.building].monument
          ? null
          : "需要骑士精神及可拆除建筑。";
      if (t.building || t.ruin) return "请先清理该地块的建筑或遗迹。";
      if (a.type === "CLEAR_FOREST")
        return t.terrain === "forest" && hasTech(p, "forestry")
          ? null
          : "需要林业及森林。";
      if (a.type === "BURN_FOREST")
        return t.terrain === "forest" &&
          hasTech(p, "construction") &&
          p.resources >= 3
          ? null
          : "需要建筑科技、森林与 3 星。";
      return t.terrain === "plain" &&
        !t.resource &&
        hasTech(p, "spiritualism") &&
        p.resources >= 5
        ? null
        : "需要唯灵论、空平原与 5 星。";
    }
    case "CITY_REWARD": {
      const c = s.cities.find((c) => c.id === a.cityId);
      return c && c.owner === p.id && getUpgradeRewards(c).includes(a.reward)
        ? null
        : "该奖励不属于城市当前升级等级。";
    }
    case "PEACE":
    case "BREAK_PEACE":
    case "EMBASSY": {
      const other = s.players[a.targetPlayer];
      if (
        !other ||
        other.id === p.id ||
        other.eliminated ||
        !p.metPlayers.includes(other.id)
      )
        return "尚未接触该势力。";
      if (a.type === "PEACE")
        return !isAtPeace(s, p.id, other.id) &&
          (hasTech(p, "strategy") || p.peaceOffers.includes(other.id)) &&
          !other.peaceOffers.includes(p.id)
          ? null
          : "需要战略科技，且不能重复提议。";
      if (a.type === "BREAK_PEACE")
        return isAtPeace(s, p.id, other.id) ? null : "当前没有和平协议。";
      return hasTech(p, "diplomacy") &&
        p.resources >= getEmbassyCost(s, p.id) &&
        !p.embassies.includes(other.id) &&
        s.cities.some((c) => c.owner === other.id && c.capitalOf === other.id)
        ? null
        : "大使馆需要外交、5 星，且每势力只能一处。";
    }
    case "END_TURN":
      return getPendingUpgradeCity(s) ? "请先选完城市升级奖励。" : null;
    case "RESIGN":
      return null;
    default:
      return "未知行动。";
  }
}
export const canApplyAction = (s: GameState, a: Action): boolean =>
  validateAction(s, a) === null;
function updateConnections(s: GameState): void {
  for (const p of s.players) {
    const capital = s.cities.find(
      (c) => c.owner === p.id && c.capitalOf === p.id,
    );
    if (!capital) continue;
    const network = new Set<number>(),
      queue = [tileAt(s, capital).id];
    network.add(queue[0]);
    while (queue.length) {
      const id = queue.shift()!,
        tile = s.tiles[id];
      for (const n of neighbors(s.tiles, s.options.size, tile)) {
        if (
          network.has(n.id) ||
          (n.owner !== null && n.owner !== p.id && !isAtPeace(s, p.id, n.owner))
        )
          continue;
        if (
          n.road ||
          n.cityId ||
          n.building === "bridge" ||
          n.building === "port"
        ) {
          network.add(n.id);
          queue.push(n.id);
        }
      }
      if (tile.building === "port") {
        const seen = new Set([id]),
          waterQueue: [number, number][] = [[id, 0]];
        while (waterQueue.length) {
          const [w, d] = waterQueue.shift()!;
          if (d >= 5) continue;
          for (const n of neighbors(s.tiles, s.options.size, s.tiles[w])) {
            if (
              !isWater(n) ||
              seen.has(n.id) ||
              !p.explored.includes(n.id) ||
              (n.owner !== null &&
                n.owner !== p.id &&
                !isAtPeace(s, p.id, n.owner)) ||
              (n.terrain === "deep" && !hasTech(p, "sailing"))
            )
              continue;
            seen.add(n.id);
            if (
              n.building === "port" &&
              n.owner === p.id &&
              !network.has(n.id)
            ) {
              network.add(n.id);
              queue.push(n.id);
            }
            waterQueue.push([n.id, d + 1]);
          }
        }
      }
    }
    for (const c of s.cities.filter(
      (c) => c.owner === p.id && c.id !== capital.id,
    )) {
      const connected = network.has(tileAt(s, c).id);
      if (connected !== c.connected) {
        addPopulation(s, c, connected ? 1 : -1);
        addPopulation(s, capital, connected ? 1 : -1);
      }
      c.connected = connected;
      c.connectionRewarded = connected;
    }
  }
}
function checkVictory(s: GameState): void {
  for (const p of s.players) {
    p.unlockedMonuments ??= [];
    for (const b of Object.values(BUILDINGS))
      if (
        b.monument &&
        monumentReady(s, p, b.id as MonumentId) &&
        !p.unlockedMonuments.includes(b.id as MonumentId)
      )
        p.unlockedMonuments.push(b.id as MonumentId);
    if (!s.cities.some((c) => c.owner === p.id)) {
      p.eliminated = true;
      s.units = s.units.filter((u) => u.owner !== p.id);
    }
    p.score = getScore(s, p.id);
  }
  const alive = s.players.filter((p) => !p.eliminated);
  if (
    s.players[0].eliminated ||
    (s.options.mode === "conquest" && alive.length <= 1)
  ) {
    s.status = "finished";
    s.winner = alive.sort((a, b) => b.score - a.score)[0]?.id ?? null;
  }
}
function nextTurn(s: GameState): void {
  checkVictory(s);
  if (s.status === "finished") return;
  let next = s.currentPlayer;
  do {
    next = (next + 1) % s.players.length;
    if (next === 0) {
      s.round++;
      if (s.options.mode === "score" && s.round > s.options.maxRounds) {
        s.round = s.options.maxRounds;
        s.status = "finished";
        s.winner = [...s.players].sort(
          (a, b) => getScore(s, b.id) - getScore(s, a.id) || a.id - b.id,
        )[0].id;
        return;
      }
    }
  } while (s.players[next].eliminated);
  s.currentPlayer = next;
  const p = s.players[next];
  const income = s.round > 1 ? getIncome(s, next) : 0;
  p.resources += income;
  p.stats.resourcesEarned += income;
  for (const c of s.cities) if (c.owner === next) c.infiltratedRound = null;
  for (const u of s.units)
    if (u.owner === next) {
      u.moved = false;
      u.attacked = false;
      u.escapeUsed = false;
      u.hiddenAtTurnStart = u.hidden;
    }
  event(s, {
    type: "turn",
    player: next,
    message: `第 ${s.round} 回合 · ${p.name}，收入 +${income} 星。`,
  });
}
function exhaust(u: Unit): void {
  u.moved = true;
  u.attacked = true;
  u.escapeUsed = true;
}
function removeDead(s: GameState, killer: Unit | undefined): void {
  for (const u of s.units.filter((u) => u.hp <= 0)) {
    if (killer && u.owner !== killer.owner) {
      killer.kills++;
      s.players[killer.owner].stats.kills++;
    }
    event(s, {
      type: "death",
      player: u.owner,
      unitId: u.id,
      at: { x: u.x, y: u.y },
      message: `${UNITS[u.type].name}被击溃。`,
    });
  }
  s.units = s.units.filter((u) => u.hp > 0);
}
function explore(s: GameState, p: Player, start: Position): void {
  const random = seededRandom(`${s.options.seed}:explorer:${s.nextId}`),
    seen = new Set(p.explored);
  let pos = start;
  const visited: number[] = [];
  const passable = (t: Tile) =>
    t.terrain !== "mountain" || hasTech(p, "climbing");
  const allowed = (t: Tile) =>
    passable(t) &&
    (t.terrain !== "shallow" || hasTech(p, "fishing")) &&
    (t.terrain !== "deep" || hasTech(p, "sailing"));
  for (let step = 0; step < 15; step++) {
    const choices = neighbors(s.tiles, s.options.size, pos).filter(allowed);
    if (!choices.length) break;
    const score = (candidate: Tile) => {
      let best = 1000;
      const queue: [Tile, number][] = [[candidate, 0]],
        searched = new Set<number>();
      let cursor = 0;
      while (cursor < queue.length) {
        const [t, depth] = queue[cursor++];
        if (searched.has(t.id)) continue;
        searched.add(t.id);
        const fog = area(s, t, 1).filter((n) => !seen.has(n.id));
        if (fog.length)
          best = Math.min(
            best,
            depth * 100 +
              180 -
              Math.min(4, fog.length) * 10 -
              (fog.some((n) => n.lighthouse) ? 40 : 0),
          );
        if (depth < 3)
          for (const next of neighbors(s.tiles, s.options.size, t))
            if (allowed(next) && !searched.has(next.id))
              queue.push([next, depth + 1]);
      }
      return best + (visited.includes(candidate.id) ? 1 : 0);
    };
    const values = choices.map((t) => ({ tile: t, value: score(t) })),
      minimum = Math.min(...values.map((v) => v.value)),
      ties = values.filter((v) => v.value === minimum);
    pos = ties[Math.floor(random() * ties.length)].tile;
    visited.push(tileAt(s, pos).id);
    reveal(s, seen, pos, tileAt(s, pos).terrain === "mountain" ? 2 : 1);
  }
  p.explored = [...seen].sort((a, b) => a - b);
}
function board(_s: GameState, u: Unit, from: Tile, to: Tile): void {
  if (
    !isWater(from) &&
    isWater(to) &&
    to.building === "port" &&
    !skill(u, "water")
  ) {
    u.carried = {
      type: u.type,
      maxHp: u.maxHp,
      veteran: u.veteran,
      kills: u.kills,
    };
    u.type =
      u.type === "giant"
        ? "juggernaut"
        : u.type === "cloak"
          ? "dinghy"
          : u.type === "dagger"
            ? "pirate"
            : "raft";
    u.attacked = true;
  } else if (skill(u, "water") && !isWater(to) && u.carried) {
    const carried = u.carried;
    u.type = carried.type;
    u.maxHp = carried.maxHp;
    u.veteran = carried.veteran;
    u.kills = carried.kills;
    delete u.carried;
    u.attacked = true;
  }
}
function stompAfterMove(s: GameState, u: Unit, previousType: UnitType): void {
  if (previousType !== "juggernaut" && u.type !== "juggernaut") return;
  // A landing giant still uses its ship's attack for this impact.
  const ship = { ...u, type: "juggernaut" as const };
  for (const target of s.units) {
    if (
      target.hp <= 0 ||
      target.owner === u.owner ||
      isAtPeace(s, u.owner, target.owner) ||
      distance(u, target) > 1
    )
      continue;
    const damage = applyDamage(
      target,
      Math.floor(combat(s, ship, target).damage / 2),
    );
    event(s, {
      type: "attack",
      player: u.owner,
      unitId: u.id,
      at: target,
      damage,
      message: "践踏伤害。",
    });
  }
  removeDead(s, u);
}
function spawnGiant(s: GameState, c: City): void {
  const old = unitAt(s, c);
  if (old) {
    const destination = neighbors(s.tiles, s.options.size, c).find(
      (t) =>
        !unitAt(s, t) &&
        Number.isFinite(movementCost(s, old, tileAt(s, old), t)),
    );
    if (destination) {
      const from = tileAt(s, old);
      old.x = destination.x;
      old.y = destination.y;
      old.moved = true;
      old.capturedTurn = null;
      board(s, old, from, destination);
    } else s.units = s.units.filter((u) => u.id !== old.id);
  }
  s.units.push(freshUnit(s, c.owner!, "giant", c, c.id));
}
function updateAdjacentPopulation(
  s: GameState,
  before: Map<number, number>,
): void {
  for (const [id, old] of before) {
    const t = s.tiles[id],
      delta = buildingPopulation(s, t) - old,
      c = cityOfTile(s, id);
    if (delta && c?.owner !== null && c) addPopulation(s, c, delta);
  }
}
export function applyAction(source: GameState, a: Action): ActionResult {
  if (a.type === "MOVE") {
    const moving = source.units.find((u) => u.id === a.unitId),
      target = source.tiles[a.to] && unitAt(source, source.tiles[a.to]);
    if (
      moving &&
      moving.owner === source.currentPlayer &&
      target &&
      target.owner !== moving.owner &&
      target.hidden &&
      getReachableTiles(source, moving.id).includes(a.to)
    ) {
      const revealed = structuredClone(source);
      revealed.units.find((u) => u.id === target.id)!.hidden = false;
      event(revealed, {
        type: "info",
        player: moving.owner,
        at: target,
        message: "发现隐藏部队，移动取消，行动未消耗。",
      });
      return { state: revealed, ok: true };
    }
  }
  const error = validateAction(source, a);
  if (error) return { state: source, ok: false, error };
  const s = structuredClone(source),
    p = s.players[s.currentPlayer],
    u = "unitId" in a ? s.units.find((u) => u.id === a.unitId)! : null;
  switch (a.type) {
    case "MOVE": {
      const to = s.tiles[a.to],
        from = tileAt(s, u!),
        oldType = u!.type,
        escaping = u!.attacked;
      u!.x = to.x;
      u!.y = to.y;
      u!.moved = true;
      if (escaping) u!.escapeUsed = true;
      board(s, u!, from, to);
      u!.capturedTurn =
        to.cityId && cityAt(s, to)?.owner !== p.id ? s.round : null;
      if (skill(u!, "hide")) u!.hidden = true;
      event(s, {
        type: "move",
        player: p.id,
        unitId: u!.id,
        from: { x: from.x, y: from.y },
        at: { x: to.x, y: to.y },
        message: `${UNITS[u!.type].name}完成移动。`,
      });
      stompAfterMove(s, u!, oldType);
      break;
    }
    case "ATTACK": {
      const target = s.units.find((t) => t.id === a.targetId)!,
        result = combat(
          source,
          source.units.find((t) => t.id === u!.id)!,
          source.units.find((t) => t.id === target.id)!,
        );
      u!.attacked = true;
      u!.moved = true;
      u!.hidden = false;
      p.lastAttackRound = s.round;
      p.embassies = p.embassies.filter((id) => id !== target.owner);
      s.players[target.owner].embassies = s.players[
        target.owner
      ].embassies.filter((id) => id !== p.id);
      const damage = applyDamage(target, result.damage);
      const retaliation = applyDamage(u!, result.retaliation);
      event(s, {
        type: "attack",
        player: p.id,
        unitId: u!.id,
        from: { x: u!.x, y: u!.y },
        at: { x: target.x, y: target.y },
        damage,
        message: `造成 ${damage} 伤害，反击 ${retaliation}。`,
      });
      if (retaliation)
        event(s, {
          type: "attack",
          player: target.owner,
          unitId: target.id,
          from: target,
          at: u!,
          damage: retaliation,
          message: "反击。",
        });
      if (skill(u!, "splash"))
        for (const secondary of s.units.filter(
          (t) =>
            t.id !== target.id &&
            t.owner !== p.id &&
            !isAtPeace(s, p.id, t.owner) &&
            distance(t, target) <= 1,
        )) {
          const original = source.units.find((t) => t.id === secondary.id)!;
          const splash = Math.floor(
            combat(source, source.units.find((t) => t.id === u!.id)!, original)
              .damage / 2,
          );
          const damage = applyDamage(secondary, splash);
          event(s, {
            type: "attack",
            player: p.id,
            unitId: u!.id,
            at: secondary,
            damage,
            message: "溅射伤害。",
          });
        }
      if (target.hp <= 0 && u!.hp > 0) {
        if (skill(u!, "persist")) u!.attacked = false;
        if (
          UNITS[u!.type].range === 1 &&
          Number.isFinite(movementCost(s, u!, tileAt(s, u!), tileAt(s, target)))
        ) {
          const from = tileAt(s, u!);
          const previousType = u!.type;
          u!.x = target.x;
          u!.y = target.y;
          board(s, u!, from, tileAt(s, u!));
          u!.capturedTurn =
            cityAt(s, u!) && cityAt(s, u!)!.owner !== p.id ? s.round : null;
          stompAfterMove(s, u!, previousType);
        }
      }
      if (u!.hp <= 0) {
        s.players[target.owner].stats.kills++;
        target.kills++;
      }
      removeDead(s, u!);
      break;
    }
    case "HEAL":
      u!.hp = Math.min(
        u!.maxHp,
        u!.hp + (tileAt(s, u!).owner === p.id ? 4 : 2),
      );
      exhaust(u!);
      break;
    case "HEAL_OTHERS":
      for (const target of s.units)
        if (
          target.id !== u!.id &&
          target.owner === p.id &&
          distance(u!, target) <= 1
        )
          target.hp = Math.min(target.maxHp, target.hp + 4);
      exhaust(u!);
      break;
    case "PROMOTE":
      u!.veteran = true;
      u!.maxHp += 5;
      u!.hp = u!.maxHp;
      event(s, {
        type: "upgrade",
        player: p.id,
        at: u!,
        unitId: u!.id,
        message: "晋升老兵，生命上限 +5 并完全恢复。",
      });
      break;
    case "DISBAND":
      p.resources += Math.floor(UNITS[u!.carried?.type ?? u!.type].cost / 2);
      s.units = s.units.filter((t) => t.id !== u!.id);
      break;
    case "CONVERT": {
      const t = s.units.find((t) => t.id === a.targetId)!;
      p.embassies = p.embassies.filter((id) => id !== t.owner);
      s.players[t.owner].embassies = s.players[t.owner].embassies.filter(
        (id) => id !== p.id,
      );
      t.owner = p.id;
      t.homeCityId = u!.homeCityId;
      t.independent = false;
      t.capturedTurn =
        cityAt(s, t) && cityAt(s, t)!.owner !== p.id ? s.round : null;
      t.hidden = false;
      exhaust(t);
      exhaust(u!);
      p.lastAttackRound = s.round;
      event(s, {
        type: "info",
        player: p.id,
        at: t,
        message: "敌军已被转换。",
      });
      break;
    }
    case "CAPTURE": {
      const c = cityAt(s, u!)!,
        old = c.owner,
        productionBefore = new Map(
          s.tiles
            .filter((t) =>
              ["windmill", "sawmill", "forge"].includes(t.building ?? ""),
            )
            .map((t) => [t.id, buildingPopulation(s, t)]),
        );
      if (old !== null) {
        const oldCapital = s.cities.find(
          (city) => city.owner === old && city.capitalOf === old,
        );
        if (c.connected) {
          addPopulation(s, c, -1);
          if (oldCapital) addPopulation(s, oldCapital, -1);
        }
        if (c.capitalOf === old) {
          for (const other of s.cities.filter(
            (city) => city.owner === old && city.id !== c.id && city.connected,
          )) {
            addPopulation(s, other, -1);
            other.connected = false;
            other.connectionRewarded = false;
            addPopulation(s, c, -1);
          }
        }
      }
      c.owner = p.id;
      c.connected = false;
      c.connectionRewarded = false;
      c.infiltratedRound = null;
      if (c.capitalOf !== null)
        for (const player of s.players)
          player.embassies = player.embassies.filter(
            (id) => id !== c.capitalOf,
          );
      for (const t of s.units)
        if (t.homeCityId === c.id && t.owner === old) t.homeCityId = "";
      for (const id of c.territory) s.tiles[id].owner = p.id;
      claimTerritory(s, c, c.borderExpanded ? 2 : 1);
      updateAdjacentPopulation(s, productionBefore);
      exhaust(u!);
      u!.hidden = false;
      u!.capturedTurn = null;
      u!.homeCityId = c.id;
      p.stats.citiesCaptured++;
      event(s, {
        type: "capture",
        player: p.id,
        at: c,
        message: `占领${c.name}。`,
      });
      break;
    }
    case "TRAIN": {
      const c = s.cities.find((c) => c.id === a.cityId)!;
      p.resources -= UNITS[a.unitType].cost;
      s.units.push(freshUnit(s, p.id, a.unitType, c, c.id));
      break;
    }
    case "UPGRADE_NAVAL":
      p.resources -= UNITS[a.unitType].cost;
      u!.type = a.unitType;
      break;
    case "EXAMINE": {
      const t = tileAt(s, u!);
      t.ruin = false;
      exhaust(u!);
      u!.hidden = false;
      const available = TECHNOLOGIES.filter(
        (d) =>
          !hasTech(p, d.id) &&
          (d.tier === 1 ||
            d.prerequisites.some((id) => hasTech(p, id)) ||
            TECHNOLOGIES.some(
              (child) =>
                child.prerequisites.includes(d.id) && hasTech(p, child.id),
            )),
      );
      const capital =
        s.cities.find((c) => c.owner === p.id && c.capitalOf === p.id) ??
        s.cities
          .filter((c) => c.owner === p.id && c.capitalOf !== null)
          .sort((a, b) => b.level - a.level)[0];
      const rewards = [
        "stars",
        "unit",
        ...(available.length ? ["tech"] : []),
        ...(capital ? ["population"] : []),
        ...(area(s, t, 2).some((t) => !p.explored.includes(t.id))
          ? ["explorer"]
          : []),
      ];
      const reward =
        rewards[hashSeed(`${s.options.seed}:ruin:${t.id}`) % rewards.length];
      if (reward === "stars") {
        p.resources += 10;
        event(s, {
          type: "info",
          player: p.id,
          at: t,
          message: "遗迹中发现 10 星。",
        });
      }
      if (reward === "population") addPopulation(s, capital!, 3);
      if (reward === "tech")
        p.technologies.push(
          available[hashSeed(s.options.seed + t.id) % available.length].id,
        );
      if (reward === "explorer") explore(s, p, t);
      if (reward === "unit") {
        const home = u!.homeCityId,
          water = isWater(t),
          destination = neighbors(s.tiles, s.options.size, t).find(
            (next) =>
              !unitAt(s, next) && Number.isFinite(movementCost(s, u!, t, next)),
          );
        if (destination) {
          u!.x = destination.x;
          u!.y = destination.y;
          board(s, u!, t, destination);
        } else s.units = s.units.filter((other) => other.id !== u!.id);
        const friend = freshUnit(
          s,
          p.id,
          water ? "rammer" : "swordsman",
          t,
          home,
        );
        friend.independent = true;
        friend.veteran = true;
        friend.maxHp = water ? 15 : 20;
        friend.hp = friend.maxHp;
        if (water)
          friend.carried = {
            type: "warrior",
            maxHp: 15,
            kills: 0,
            veteran: true,
          };
        s.units.push(friend);
        event(s, {
          type: "info",
          player: p.id,
          at: t,
          message: "遗迹中发现一支老兵部队。",
        });
      }
      break;
    }
    case "RESEARCH":
      p.resources -= getTechCost(s, p.id, a.techId);
      p.technologies.push(a.techId);
      if (a.techId === "meditation") p.lastAttackRound = s.round;
      event(s, {
        type: "research",
        player: p.id,
        message: `研究完成：${TECHNOLOGIES.find((t) => t.id === a.techId)!.name}。`,
      });
      break;
    case "HARVEST": {
      const t = s.tiles[a.tileId];
      if (t.resource === "starfish") {
        p.resources += 8;
        exhaust(unitAt(s, t)!);
      } else {
        p.resources -= 2;
        addPopulation(s, cityOfTile(s, t.id)!, 1);
      }
      t.resource = null;
      break;
    }
    case "BUILD":
    case "DESTROY": {
      const t = s.tiles[a.tileId],
        affected = area(s, t, 1),
        before = new Map(affected.map((t) => [t.id, buildingPopulation(s, t)]));
      if (a.type === "BUILD") {
        p.resources -= BUILDINGS[a.building].cost;
        t.building = a.building;
        t.builtTurn = s.round;
        t.resource = null;
        if (BUILDINGS[a.building].monument)
          p.builtMonuments.push(a.building as MonumentId);
      } else {
        t.building = null;
        delete t.builtTurn;
      }
      updateAdjacentPopulation(s, before);
      break;
    }
    case "CLEAR_FOREST": {
      const t = s.tiles[a.tileId];
      t.terrain = "plain";
      t.resource = null;
      p.resources++;
      break;
    }
    case "BURN_FOREST": {
      const t = s.tiles[a.tileId];
      t.terrain = "plain";
      t.resource = "crop";
      p.resources -= 3;
      break;
    }
    case "GROW_FOREST":
      s.tiles[a.tileId].terrain = "forest";
      p.resources -= 5;
      break;
    case "ROAD":
      s.tiles[a.tileId].road = true;
      p.resources -= 3;
      break;
    case "CITY_REWARD": {
      const c = s.cities.find((c) => c.id === a.cityId)!;
      c.pendingRewards--;
      c.pendingRewardLevels.shift();
      if (a.reward === "income") c.incomeBonus++;
      if (a.reward === "resources") p.resources += 5;
      if (a.reward === "defense") c.defenseBonus = 1;
      if (a.reward === "population") addPopulation(s, c, 3);
      if (a.reward === "territory") {
        c.borderExpanded = true;
        claimTerritory(s, c, 2);
      }
      if (a.reward === "explore") explore(s, p, c);
      if (a.reward === "park") c.parks++;
      if (a.reward === "giant") spawnGiant(s, c);
      break;
    }
    case "INFILTRATE": {
      const c = s.cities.find((c) => c.id === a.cityId)!;
      p.resources += getCityIncome(s, c.id);
      c.infiltratedRound = s.round;
      const target = unitAt(s, c);
      if (target) {
        const attacker = { ...u!, hp: 5, maxHp: 5 };
        applyDamage(target, combat(s, attacker, target).damage);
        removeDead(s, u!);
      }
      s.units = s.units.filter((t) => t.id !== u!.id);
      const spawnPriority = (tile: Tile) =>
        tile.cityId === c.id ? 2 : Number(hasTerrainDefense(p, tile));
      const tiles = c.territory
        .map((id) => s.tiles[id])
        .filter((t) => !unitAt(s, t))
        .sort((a, b) => spawnPriority(b) - spawnPriority(a));
      for (const tile of tiles.slice(0, Math.min(5, c.level)))
        s.units.push(
          freshUnit(s, p.id, isWater(tile) ? "pirate" : "dagger", tile, ""),
        );
      event(s, {
        type: "info",
        player: p.id,
        at: c,
        message: `渗透${c.name}，夺取收入并召集部队。`,
      });
      break;
    }
    case "PEACE": {
      const target = s.players[a.targetPlayer];
      if (p.peaceOffers.includes(target.id)) {
        p.peaceWith.push(target.id);
        target.peaceWith.push(p.id);
        p.peaceOffers = p.peaceOffers.filter((id) => id !== target.id);
      } else target.peaceOffers.push(p.id);
      break;
    }
    case "BREAK_PEACE": {
      const target = s.players[a.targetPlayer];
      p.peaceWith = p.peaceWith.filter((id) => id !== target.id);
      target.peaceWith = target.peaceWith.filter((id) => id !== p.id);
      s.units = s.units.filter(
        (u) => u.owner !== p.id || tileAt(s, u).owner !== target.id,
      );
      s.units.filter((u) => u.owner === p.id).forEach(exhaust);
      break;
    }
    case "EMBASSY":
      p.resources -= getEmbassyCost(s, p.id);
      p.embassies.push(a.targetPlayer);
      break;
    case "END_TURN":
      nextTurn(s);
      break;
    case "RESIGN":
      for (const c of s.cities.filter((c) => c.owner === p.id)) {
        c.owner = null;
        c.territory.forEach((id) => {
          s.tiles[id].owner = null;
        });
        c.territory = [];
      }
      s.units = s.units.filter((u) => u.owner !== p.id);
      p.eliminated = true;
      checkVictory(s);
      if (s.status === "playing") nextTurn(s);
      break;
  }
  updateConnections(s);
  updateVisibility(s);
  discover(s, source);
  checkVictory(s);
  return { state: s, ok: true };
}
export function getAvailableActions(
  s: GameState,
  id = s.currentPlayer,
): Action[] {
  if (s.status !== "playing" || id !== s.currentPlayer) return [];
  const actions: Action[] = [],
    offer = (a: Action) => {
      if (canApplyAction(s, a)) actions.push(a);
    };
  const p = s.players[id];
  for (const u of s.units.filter((u) => u.owner === id)) {
    getReachableTiles(s, u.id, true).forEach((to) =>
      actions.push({ type: "MOVE", unitId: u.id, to }),
    );
    getAttackTargets(s, u.id).forEach((t) =>
      actions.push({ type: "ATTACK", unitId: u.id, targetId: t.id }),
    );
    for (const type of [
      "CAPTURE",
      "HEAL",
      "PROMOTE",
      "DISBAND",
      "HEAL_OTHERS",
      "EXAMINE",
    ] as const)
      offer({ type, unitId: u.id });
    if (u.type === "raft")
      for (const unitType of ["scout", "rammer", "bomber"] as const)
        offer({ type: "UPGRADE_NAVAL", unitId: u.id, unitType });
    if (skill(u, "convert"))
      for (const t of s.units.filter(
        (t) => t.owner !== id && distance(t, u) <= 1,
      ))
        offer({ type: "CONVERT", unitId: u.id, targetId: t.id });
    if (skill(u, "infiltrate"))
      for (const c of s.cities.filter((c) => distance(c, u) <= 1))
        offer({ type: "INFILTRATE", unitId: u.id, cityId: c.id });
  }
  for (const c of s.cities.filter((c) => c.owner === id)) {
    for (const d of Object.values(UNITS).filter((d) => d.trainable))
      offer({ type: "TRAIN", cityId: c.id, unitType: d.id });
    for (const reward of getUpgradeRewards(c))
      offer({ type: "CITY_REWARD", cityId: c.id, reward });
  }
  for (const t of TECHNOLOGIES) offer({ type: "RESEARCH", techId: t.id });
  const buildable = Object.values(BUILDINGS).filter(
    (b) => (!b.tech || hasTech(p, b.tech)) && b.cost <= p.resources,
  );
  for (const tileId of p.visible) {
    const t = s.tiles[tileId];
    if (t.resource) offer({ type: "HARVEST", tileId });
    if (t.owner === id) {
      if (!t.building)
        for (const b of buildable)
          if (b.terrain.includes(t.terrain))
            offer({ type: "BUILD", tileId, building: b.id });
      for (const type of [
        "CLEAR_FOREST",
        "BURN_FOREST",
        "GROW_FOREST",
        "DESTROY",
      ] as const)
        offer({ type, tileId });
    }
    if (t.owner === null || t.owner === id) offer({ type: "ROAD", tileId });
  }
  for (const targetPlayer of p.metPlayers)
    for (const type of ["PEACE", "BREAK_PEACE", "EMBASSY"] as const)
      offer({ type, targetPlayer });
  offer({ type: "END_TURN" });
  return actions;
}
