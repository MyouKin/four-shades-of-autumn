import { BUILDINGS, TECHNOLOGIES, UNITS } from "../data/config";
import { distance, isWater, neighbors } from "../map/generate";
import {
  canApplyAction, getBuildingLevel, getTechCost, getUpgradeRewards, getVisibleResource,
} from "../rules/engine";
import type { Action, BuildingId, City, GameState, Resource, UnitType } from "../types";
import { getArmyTarget, type AiProfile } from "./profiles";
import type { Knowledge, ThreatMap } from "./knowledge";

export function chooseEconomic(s: GameState, k: Knowledge, threats: ThreatMap, profile: AiProfile): Action | undefined {
  const p = s.players[k.player], normal = profile.coordinated;
  const cities = k.ownCities, units = k.own, armyTarget = getArmyTarget(s);
  const tiles = cities.flatMap((c) => c.territory.map((id) => s.tiles[id]))
    .filter((t) => t.owner === p.id && k.visible.has(t.id));
  const empty = tiles.filter((t) => !t.building && !t.cityId && !t.ruin);
  const cityByTile = new Map(cities.flatMap((c) => c.territory.map((id) => [id, c] as const)));
  const remaining = s.options.mode === "score" ? Math.max(1, s.options.maxRounds - s.round) : 20;
  const horizon = Math.min(profile.economicHorizon, remaining);
  const water = [...k.known].filter((id) => isWater(s.tiles[id])).length;
  const coastal = water > k.known.size * 0.16;
  const ports = tiles.filter((t) => t.building === "port");
  const naval = units.filter((u) => UNITS[u.type].skills.includes("water"));
  const enemyNaval = k.enemies.filter((u) => UNITS[u.type].skills.includes("water"));
  const pressure = [...threats.cityPressure.values()].reduce((n, v) => n + v, 0);
  let best: Action | undefined, bestScore = 0;
  const offer = (a: Action, score: number) => {
    if (score <= bestScore || !canApplyAction(k.view, a)) return;
    best = a; bestScore = score;
  };
  const growthValue = (c: City, pop: number, cost: number) => {
    const upgrade = c.population + pop >= c.level + 1;
    return 18 + pop / Math.max(1, cost) * 28 +
      (upgrade ? 24 + (c.level === 4 ? 14 : 0) : 0) + horizon;
  };
  for (const c of cities) {
    const danger = threats.cityPressure.get(c.id) ?? 0;
    for (const reward of getUpgradeRewards(c)) {
      let score = 120;
      if (reward === "income") score += horizon * 2;
      if (reward === "explore") score += normal && k.known.size < Math.min(s.tiles.length * 0.35, 120) && !danger ? 20 : -5;
      if (reward === "resources") score += pressure ? 12 : 6;
      if (reward === "defense") score += normal && danger >= 6 ? 28 : -8;
      if (reward === "population") score += 15;
      if (reward === "territory" && normal) {
        const edgeResources = [...k.known].filter((id) => {
          const t = s.tiles[id];
          return t.owner === null && distance(t, c) === 2 && getVisibleResource(s, t, p.id);
        }).length;
        if (edgeResources >= 3) score += 23;
      }
      if (reward === "giant") score += s.options.mode === "conquest" || danger ? 30 : 5;
      if (reward === "park") score += s.options.mode === "score" && remaining <= 12 ? 35 : 0;
      offer({ type: "CITY_REWARD", cityId: c.id, reward }, score);
    }
    if (units.length < armyTarget || danger > 3) {
      const nearby = units.filter((u) => distance(u, c) <= 4);
      const enemies = k.enemies.filter((u) => distance(u, c) <= 7);
      const counts = (type: UnitType) => nearby.filter((u) => u.type === type).length;
      const trainable: UnitType[] = normal
        ? ["warrior", "rider", "defender", "archer", "swordsman", "catapult", "knight", "mindBender", "cloak"]
        : ["warrior", "rider", "archer", "swordsman", "defender"];
      for (const type of trainable) {
        const d = UNITS[type];
        let score = units.length < 2 ? 72 : 29;
        score += danger ? Math.min(38, danger * 3) : 0;
        if (type === "warrior") score += p.resources < 5 ? 6 : 0;
        if (type === "rider") score += !enemies.length && counts("rider") < 2 ? 12 : 0;
        if (type === "swordsman") score += 13;
        if (type === "defender") score += normal && danger && !counts("defender") ? 30 : -15;
        if (type === "archer") score += counts("archer") < Math.max(1, nearby.length / 3) ? 10 : -6;
        if (type === "catapult") score += enemies.some((e) => UNITS[e.type].defense >= 3) && !counts("catapult") ? 24 : -16;
        if (type === "knight") score += enemies.filter((e) => e.hp <= 10 && UNITS[e.type].defense <= 2).length >= 3 ? 25 : 2;
        if (type === "mindBender") score += !counts("mindBender") &&
          (enemies.some((e) => e.maxHp >= 30) || nearby.filter((u) => u.hp < u.maxHp).length >= 3) ? 30 : -30;
        if (type === "cloak") score += !counts("cloak") && !danger &&
          k.cities.some((city) => city.owner !== null && city.owner !== p.id && distance(city, c) <= 8) ? 7 : -40;
        // Prefer a second military city over wasting every star on far-away
        // reinforcements when immediate civilian development is affordable.
        if (!danger && units.length > cities.length && d.cost > p.resources * 0.7) score -= 8;
        offer({ type: "TRAIN", cityId: c.id, unitType: type }, score);
      }
    }
  }
  for (const id of k.visible) {
    const t = s.tiles[id];
    if (getVisibleResource(s, t, p.id) === "starfish") offer({ type: "HARVEST", tileId: id }, 110);
  }
  const availableBuildings = Object.values(BUILDINGS).filter((b) =>
    (!b.tech || p.technologies.includes(b.tech)) && b.cost <= p.resources);
  for (const t of empty) {
    const c = cityByTile.get(t.id);
    if (!c) continue;
    const resource = getVisibleResource(s, t, p.id);
    if (resource) offer({ type: "HARVEST", tileId: t.id }, growthValue(c, 1, 2));
    const adjacent = neighbors(s.tiles, s.options.size, t).filter((v) => v.owner === p.id);
    for (const b of availableBuildings) {
      if (!b.terrain.includes(t.terrain) || (b.resource && b.resource !== resource)) continue;
      let population = b.population;
      const producer: Partial<Record<BuildingId, BuildingId>> = { sawmill: "lumberHut", windmill: "farm", forge: "mine" };
      if (producer[b.id]) population = adjacent.filter((v) => v.building === producer[b.id]).length * (b.id === "forge" ? 2 : 1);
      let score = growthValue(c, population, b.cost);
      if (b.monument) score = 100 + population * 3;
      if (b.id === "market") {
        const income = Math.min(8, adjacent.filter((v) => ["sawmill", "windmill", "forge"].includes(v.building ?? ""))
          .reduce((n, v) => n + getBuildingLevel(s, v), 0));
        score = income * horizon * 2 + 12;
      }
      if (b.id === "port") {
        const cityHasPort = c.territory.some((id) => s.tiles[id].building === "port");
        score = !cityHasPort && coastal ? 45 + (units.some((u) => distance(u, t) <= 2) ? 9 : 0) : 13;
        if (!normal) score -= 8;
      }
      if (b.id === "bridge") score = coastal && units.some((u) => distance(u, t) <= 1) ? 21 : 0;
      if (b.id.toLowerCase().includes("temple")) score = s.options.mode === "score" &&
        remaining >= 2 && units.length >= Math.min(3, armyTarget) ? 25 + Math.min(8, remaining) : 0;
      if (normal && pressure > 10 && !b.monument && population + c.population < c.level + 1) score -= 12;
      offer({ type: "BUILD", tileId: t.id, building: b.id }, score);
    }
    // Liquidate a small amount of timber only when it unlocks an urgent
    // defensive purchase; do not alternate planting/clearing for busywork.
    if (normal && pressure > 4 && p.resources < 3 && t.terrain === "forest" && !resource)
      offer({ type: "CLEAR_FOREST", tileId: t.id }, 65);
  }
  const resources = (r: Resource) => empty.filter((t) => getVisibleResource(s, t, p.id) === r).length;
  const forests = empty.filter((t) => t.terrain === "forest").length;
  const mountains = [...k.known].filter((id) => s.tiles[id].terrain === "mountain").length;
  const techValues: Record<string, number> = {
    organization: resources("fruit") ? 42 + Math.min(5, resources("fruit")) * 3 : 9,
    hunting: resources("animal") ? 42 + Math.min(5, resources("animal")) * 3 : forests ? 24 : 8,
    fishing: resources("fish") ? 48 : coastal ? 43 : 5,
    forestry: forests ? 37 + Math.min(forests, 6) : 8,
    farming: resources("crop") ? 42 + Math.min(resources("crop"), 5) * 3 : 7,
    mining: resources("ore") ? 42 + Math.min(resources("ore"), 5) * 3 : 7,
    climbing: mountains > 2 ? 30 : 12,
    riding: units.some((u) => u.type === "rider") ? 18 : 32,
    strategy: pressure > 3 ? 51 : 14,
    archery: k.enemies.length ? 42 : forests ? 27 : 18,
    smithery: k.enemies.length ? 49 : 26,
    mathematics: k.enemies.some((u) => UNITS[u.type].defense >= 3) ? 48 : forests >= 3 ? 30 : 12,
    chivalry: k.enemies.filter((u) => u.hp <= 10).length >= 3 ? 45 : 22,
    roads: cities.length > 1 ? 27 + Math.min(cities.length, 8) : 10,
    trade: tiles.filter((t) => ["sawmill", "windmill", "forge"].includes(t.building ?? "")).length ? 43 : 8,
    sailing: ports.length ? 53 : coastal ? 31 : 4,
    ramming: enemyNaval.length ? 55 : naval.length ? 39 : 5,
    navigation: naval.length >= 2 ? 47 : naval.length ? 33 : 5,
    aquatism: naval.length >= 3 ? 34 : 5,
    philosophy: normal && p.technologies.length < 14 && cities.length >= 3 ? 35 : 10,
    meditation: remaining > 10 && s.options.mode === "score" ? 24 : 7,
    construction: resources("crop") >= 2 ? 31 : 10,
    spiritualism: s.options.mode === "score" && forests && remaining > 6 ? 30 : 5,
    freeSpirit: s.options.mode === "score" && remaining > 6 ? 25 : 10,
    diplomacy: s.options.mode === "score" && p.metPlayers.length > 1 ? 30 : 15,
  };
  if (normal) for (const tech of [...TECHNOLOGIES].sort((a, b) => b.tier - a.tier))
    for (const parent of tech.prerequisites)
      techValues[parent] = Math.max(techValues[parent] ?? 0, (techValues[tech.id] ?? 0) * 0.78);
  for (const tech of TECHNOLOGIES) {
    let score = techValues[tech.id] ?? 5;
    if (!normal) score = Math.min(score, 39); // Easy prefers immediate purchases.
    const cost = getTechCost(s, p.id, tech.id);
    if (normal) score -= cost * 0.55;
    if (units.length < 2) score -= 18;
    if (pressure > 8 && p.resources - cost < 3) score -= 25;
    if (remaining < 3) score = s.options.mode === "score" ? tech.tier * 8 : score;
    offer({ type: "RESEARCH", techId: tech.id }, score);
  }
  if (normal && p.technologies.includes("diplomacy") && !pressure && remaining > 5)
    for (const other of p.metPlayers)
      offer({ type: "EMBASSY", targetPlayer: other }, Math.min(horizon * 4, 36));
  if (p.resources >= 6 && p.technologies.includes("roads") && cities.length > 1) {
    const capital = cities.find((c) => c.capitalOf === p.id) ?? cities[0];
    for (const c of cities.filter((c) => !c.connected && c.id !== capital.id)) {
      let pos = s.tiles[c.y * s.options.size + c.x];
      const visited = new Set<number>();
      for (let step = 0; step < Math.min(s.options.size, 24) && distance(pos, capital) > 1; step++) {
        visited.add(pos.id);
        const next = neighbors(s.tiles, s.options.size, pos)
          .filter((t) => k.known.has(t.id) && !visited.has(t.id) && (t.owner === null || t.owner === p.id) &&
            !isWater(t) && t.terrain !== "mountain")
          .sort((a, b) => distance(a, capital) - distance(b, capital) || Number(b.road) - Number(a.road))[0];
        if (!next || distance(next, capital) > distance(pos, capital)) break;
        offer({ type: "ROAD", tileId: next.id }, normal ? 25 : 16);
        pos = next;
      }
    }
  }
  return best;
}
