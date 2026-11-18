import { UNITS } from "../data/config";
import { distance, neighbors } from "../map/generate";
import { getReachableTiles, getTerrainDefense } from "../rules/engine";
import type { City, GameState, Tile, Unit } from "../types";

export interface Knowledge {
  player: number;
  known: Set<number>;
  visible: Set<number>;
  own: Unit[];
  enemies: Unit[];
  cities: City[];
  ownCities: City[];
  occupants: Map<number, Unit>;
  units: Map<string, Unit>;
  view: GameState;
}
export function observe(s: GameState): Knowledge {
  const p = s.players[s.currentPlayer];
  const known = new Set(p.explored), visible = new Set(p.visible);
  const units = s.units.filter((u) => u.owner === p.id ||
    (visible.has(u.y * s.options.size + u.x) && (!u.hidden || p.peaceWith.includes(u.owner))));
  return {
    player: p.id, known, visible,
    own: units.filter((u) => u.owner === p.id),
    enemies: units.filter((u) => u.owner !== p.id && !p.peaceWith.includes(u.owner)),
    cities: s.cities.filter((c) => c.owner === p.id || known.has(c.y * s.options.size + c.x)),
    ownCities: s.cities.filter((c) => c.owner === p.id),
    occupants: new Map(units.map((u) => [u.y * s.options.size + u.x, u])),
    units: new Map(units.map((u) => [u.id, u])),
    view: { ...s, units },
  };
}

/** Rollouts cannot discover actual concealed terrain or units as a side effect. */
export function simulationState(s: GameState, k: Knowledge): GameState {
  return {
    ...k.view,
    tiles: s.tiles.map((t): Tile => k.known.has(t.id) ? t : {
      id: t.id, x: t.x, y: t.y, terrain: "plain", resource: null,
      owner: null, cityId: null, building: null, road: false, ruin: false,
    }),
    // Keep city bookkeeping for the rules victory check; removing unknown
    // cities would incorrectly eliminate unseen opponents during a rollout.
    // Targets and evaluation still use the original observer knowledge.
    cities: s.cities,
  };
}

export interface ThreatMap {
  byTile: Map<number, string[]>;
  cityPressure: Map<string, number>;
}
export function buildThreatMap(s: GameState, k: Knowledge, detailed: boolean): ThreatMap {
  const byTile = new Map<number, string[]>();
  const n = s.options.size;
  for (const enemy of k.enemies) {
    const def = UNITS[enemy.type];
    if (!def.attack && !def.skills.includes("convert")) continue;
    const positions = [enemy.y * n + enemy.x];
    if (detailed && def.skills.includes("dash")) {
      // Predict only paths through terrain already known to this AI. Other
      // players' exploration records are deliberately not consulted.
      const nextTurn = {
        ...k.view, currentPlayer: enemy.owner,
        players: s.players.map((p) => p.id === enemy.owner ? {
          ...p,
          explored: [...k.known],
          // Conservative, explicit mobility assumptions. An observed army
          // may have mountain access, ports and deep-sea navigation; never
          // inspect the opponent's unpublished research to choose a route.
          technologies: ["climbing", "fishing", "sailing"],
        } : p),
        units: k.view.units.map((u) => u.id === enemy.id
          ? { ...u, moved: false, attacked: false, escapeUsed: false } : u),
      };
      positions.push(...getReachableTiles(nextTurn, enemy.id));
    }
    const attacked = new Set<number>();
    for (const pos of positions) {
      const at = s.tiles[pos], range = def.skills.includes("convert") ? 1 : def.range;
      for (let y = Math.max(0, at.y - range); y <= Math.min(n - 1, at.y + range); y++)
        for (let x = Math.max(0, at.x - range); x <= Math.min(n - 1, at.x + range); x++) {
          const id = y * n + x;
          if (k.known.has(id)) attacked.add(id);
        }
    }
    for (const id of attacked) {
      const list = byTile.get(id) ?? [];
      list.push(enemy.id); byTile.set(id, list);
    }
  }
  const cityPressure = new Map<string, number>();
  for (const c of k.ownCities) {
    let pressure = 0;
    for (const e of k.enemies) {
      const def = UNITS[e.type];
      const d = distance(e, c);
      if (d <= def.movement + def.range + 1)
        pressure += (def.attack + e.hp / 8) * (d <= def.range + 1 ? 1 : 0.55);
    }
    if (pressure) cityPressure.set(c.id, pressure);
  }
  return { byTile, cityPressure };
}

/** Conservative next-turn damage from up to three visible attackers. */
export function incomingDamage(s: GameState, k: Knowledge, threats: ThreatMap, u: Unit, tileId: number): number {
  const defender = { ...u, x: s.tiles[tileId].x, y: s.tiles[tileId].y };
  const defense = UNITS[u.type].defense * u.hp / u.maxHp * getTerrainDefense(s, defender);
  const estimates: number[] = [];
  for (const id of threats.byTile.get(tileId) ?? []) {
    const enemy = k.units.get(id);
    if (!enemy) continue;
    const def = UNITS[enemy.type];
    if (def.skills.includes("convert")) { estimates.push(u.hp); continue; }
    const attack = def.attack * enemy.hp / enemy.maxHp;
    estimates.push(attack + defense ? Math.round(attack / (attack + defense) * def.attack * 4.5) : 0);
  }
  estimates.sort((a, b) => b - a);
  return estimates.slice(0, 3).reduce((n, damage) => n + damage, 0);
}

export function frontierTiles(s: GameState, k: Knowledge): number[] {
  return [...k.known].filter((id) => neighbors(s.tiles, s.options.size, s.tiles[id])
    .some((t) => !k.known.has(t.id)));
}
