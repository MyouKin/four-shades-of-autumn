import type { GameState } from "../types";
import { getCityCapacity } from "../rules/engine";

/** Difficulty changes information processing, never resources or the rules. */
export const AI_PROFILES = {
  easy: {
    coordinated: false,
    threatWeight: 0.25,
    moveNoise: 4,
    armyPerCity: 1.8,
    simulationCandidates: 0,
    simulationLimit: 0,
    economicHorizon: 4,
  },
  normal: {
    coordinated: true,
    threatWeight: 1.25,
    moveNoise: 0.35,
    armyPerCity: 2.7,
    simulationCandidates: 3,
    simulationLimit: 72,
    economicHorizon: 8,
  },
} as const;
export type AiProfile = (typeof AI_PROFILES)[keyof typeof AI_PROFILES];

export function getAiBudget(s: GameState, maxActions?: number): number {
  if (maxActions !== undefined && Number.isFinite(maxActions))
    return Math.min(1600, Math.max(1, Math.floor(maxActions)));
  const units = s.units.filter((u) => u.owner === s.currentPlayer).length;
  const cities = s.cities.filter((c) => c.owner === s.currentPlayer).length;
  // Mandatory city rewards and END_TURN have their own bounded settlement.
  return Math.min(1600, Math.max(48, units * 4 + cities * 7 + s.options.size));
}

export function getArmyTarget(s: GameState): number {
  const p = s.players[s.currentPlayer];
  const cities = s.cities.filter((c) => c.owner === p.id);
  const visible = new Set(p.visible);
  const enemies = s.units.filter((u) =>
    u.owner !== p.id && !p.peaceWith.includes(u.owner) &&
    !u.hidden && visible.has(u.y * s.options.size + u.x),
  );
  const capacity = cities.reduce((n, c) => n + getCityCapacity(c), 0);
  const profile = AI_PROFILES[s.options.difficulty];
  const exploration = Math.min(cities.length, Math.ceil((s.tiles.length - p.explored.length) / 100));
  const lateScore = s.options.mode === "score" && s.options.maxRounds - s.round < 5;
  return Math.min(capacity, Math.max(3, Math.ceil(
    cities.length * profile.armyPerCity + exploration + enemies.length * 0.65,
  ) - (lateScore ? cities.length : 0)));
}
