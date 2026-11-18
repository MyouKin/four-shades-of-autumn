import { UNITS } from "../data/config";
import { distance } from "../map/generate";
import { applyAction, canApplyAction, getUpgradeRewards, getVisibleResource } from "../rules/engine";
import type { Action, GameState, Unit } from "../types";
import { chooseEconomic } from "./economy";
import { buildThreatMap, incomingDamage, observe } from "./knowledge";
import { defensiveOrders, navigationField } from "./navigation";
import { AI_PROFILES, getAiBudget, getArmyTarget } from "./profiles";
import { chooseAttack, chooseFocus, chooseMove } from "./tactics";
export { AI_PROFILES, getAiBudget, getArmyTarget } from "./profiles";

export interface AiDiagnostics {
  difficulty: GameState["options"]["difficulty"];
  budget: number;
  /** Successful commands excluding the mandatory final END_TURN. */
  actionCount: number;
  unitCount: number;
  armyTarget: number;
  truncated: boolean;
  simulations: number;
  phases: { military: number; economy: number; diplomacy: number };
}
export interface AiTurnResult { state: GameState; actions: Action[]; diagnostics: AiDiagnostics }

export function chooseAiAction(s: GameState): Action {
  if (s.status !== "playing") return { type: "END_TURN" };
  const knowledge = observe(s), profile = AI_PROFILES[s.options.difficulty];
  return chooseEconomic(s, knowledge, buildThreatMap(s, knowledge, profile.coordinated), profile)
    ?? { type: "END_TURN" };
}

/** Deterministic planning with bounded command and rollout budgets. All actual
 * and simulated mutations go through the shared applyAction rule interface. */
export function runAiTurnDetailed(input: GameState, maxActions?: number): AiTurnResult {
  let s = input;
  const player = input.currentPlayer, profile = AI_PROFILES[input.options.difficulty];
  const diagnostics: AiDiagnostics = {
    difficulty: input.options.difficulty, budget: getAiBudget(input, maxActions),
    actionCount: 0, unitCount: input.units.filter((u) => u.owner === player).length,
    armyTarget: getArmyTarget(input), truncated: false, simulations: 0,
    phases: { military: 0, economy: 0, diplomacy: 0 },
  };
  const actions: Action[] = [];
  if (s.status !== "playing") return { state: s, actions, diagnostics };
  let k = observe(s), threats = buildThreatMap(s, k, profile.coordinated);
  let knownThreatPositions = new Map(k.enemies.map((e) => [e.id, `${e.x}:${e.y}:${e.type}`]));
  const simulations = {
    used: 0, limit: Math.min(profile.simulationLimit, 12 + Math.ceil(k.own.length * 1.5)),
  };
  const fields = new Map<string, Map<number, number>>();
  const active = () => s.status === "playing" && s.currentPlayer === player && diagnostics.actionCount < diagnostics.budget;
  const perform = (action: Action, phase: keyof AiDiagnostics["phases"] = "military"): boolean => {
    if (!active()) return false;
    const result = applyAction(s, action);
    if (!result.ok) return false;
    s = result.state; actions.push(action); diagnostics.actionCount++; diagnostics.phases[phase]++;
    k = observe(s);
    // Deaths need no expensive rebuild: risk estimation looks up live units.
    // Newly discovered enemies must immediately change the remaining orders.
    if (k.enemies.some((e) => knownThreatPositions.get(e.id) !== `${e.x}:${e.y}:${e.type}`)) {
      threats = buildThreatMap(s, k, profile.coordinated);
      knownThreatPositions = new Map(k.enemies.map((e) => [e.id, `${e.x}:${e.y}:${e.type}`]));
    }
    if (action.type === "CAPTURE" || action.type === "RESEARCH") fields.clear();
    return true;
  };
  for (const targetPlayer of s.players[player].peaceOffers) {
    const enemyPower = k.enemies.filter((e) => e.owner === targetPlayer).reduce((n, u) => n + u.hp, 0);
    const ownPower = k.own.reduce((n, u) => n + u.hp, 0);
    if (!profile.coordinated || s.options.mode === "score" ||
      (enemyPower > ownPower * 1.5 && s.players.filter((p) => !p.eliminated).length > 2))
      perform({ type: "PEACE", targetPlayer }, "diplomacy");
  }
  // Resolve free city rewards before ordering armies; a giant can join this
  // turn's unit pass and emergency walls protect the city immediately.
  for (let i = 0; i < k.ownCities.length * 3 && active(); i++) {
    if (!k.ownCities.some((c) => getUpgradeRewards(c).length)) break;
    const reward = chooseEconomic(s, k, threats, profile);
    if (reward?.type !== "CITY_REWARD" || !perform(reward, "economy")) break;
  }
  const guards = defensiveOrders(s, k, threats);
  let focus = profile.coordinated ? chooseFocus(k) : undefined;
  const priority = (u: Unit) => {
    const c = k.cities.find((c) => c.x === u.x && c.y === u.y && c.owner !== player);
    const attack = chooseAttack(s, k, u, profile.coordinated, focus);
    return (c ? 200 : 0) + (guards.has(u.id) ? 80 : 0) +
      (attack ? attack.score + UNITS[u.type].range * 8 : 0) +
      (u.type === "mindBender" ? 15 : 0);
  };
  const priorities = new Map(k.own.map((u) => [u.id, priority(u)]));
  const unitIds = [...k.own].sort((a, b) => profile.coordinated
    ? priorities.get(b.id)! - priorities.get(a.id)! || a.id.localeCompare(b.id)
    : 0).map((u) => u.id);

  const special = (unitId: string): boolean => {
    const u = k.units.get(unitId);
    if (!u) return false;
    if (UNITS[u.type].skills.includes("convert")) {
      const targets = k.enemies.filter((e) => distance(u, e) <= 1)
        .sort((a, b) => UNITS[b.type].cost + b.hp - UNITS[a.type].cost - a.hp);
      for (const target of targets)
        if (perform({ type: "CONVERT", unitId, targetId: target.id })) return true;
      if (canApplyAction(k.view, { type: "HEAL_OTHERS", unitId }))
        return perform({ type: "HEAL_OTHERS", unitId });
    }
    if (UNITS[u.type].skills.includes("infiltrate")) {
      const city = k.cities.find((c) => c.owner !== null && c.owner !== player &&
        !s.players[player].peaceWith.includes(c.owner) && distance(c, u) <= 1);
      if (city && perform({ type: "INFILTRATE", unitId, cityId: city.id })) return true;
    }
    return false;
  };
  for (const unitId of unitIds) {
    if (!active()) break;
    let u = k.units.get(unitId);
    if (!u) continue;
    if (canApplyAction(k.view, { type: "CAPTURE", unitId }) && perform({ type: "CAPTURE", unitId })) continue;
    if (canApplyAction(k.view, { type: "EXAMINE", unitId }) && perform({ type: "EXAMINE", unitId })) continue;
    if (canApplyAction(k.view, { type: "PROMOTE", unitId })) perform({ type: "PROMOTE", unitId });
    u = k.units.get(unitId)!;
    if (getVisibleResource(s, s.tiles[u.y * s.options.size + u.x], player) === "starfish" &&
      perform({ type: "HARVEST", tileId: u.y * s.options.size + u.x })) continue;
    if (u.type === "raft") {
      const navy = k.own.filter((ally) => UNITS[ally.type].skills.includes("water"));
      const enemyShips = k.enemies.filter((e) => UNITS[e.type].skills.includes("water"));
      const upgrades: ("scout" | "rammer" | "bomber")[] = profile.coordinated && enemyShips.length
        ? ["rammer", "bomber", "scout"]
        : profile.coordinated && navy.length >= 3 && !navy.some((n) => n.type === "bomber")
          ? ["bomber", "scout", "rammer"] : ["scout", "rammer", "bomber"];
      for (const unitType of upgrades)
        if (canApplyAction(k.view, { type: "UPGRADE_NAVAL", unitId, unitType }) &&
          perform({ type: "UPGRADE_NAVAL", unitId, unitType })) break;
    }
    if (special(unitId)) continue;
    u = k.units.get(unitId);
    if (!u) continue;
    if (focus && !k.units.has(focus)) focus = profile.coordinated ? chooseFocus(k) : undefined;
    let attack = chooseAttack(s, k, u, profile.coordinated, focus);
    const guard = guards.get(unitId);
    const risk = incomingDamage(s, k, threats, u, u.y * s.options.size + u.x);
    if (!attack && u.hp < u.maxHp * (guard ? 0.85 : 0.55) &&
      (!profile.coordinated || risk < u.hp * 0.5) &&
      canApplyAction(k.view, { type: "HEAL", unitId }) && perform({ type: "HEAL", unitId })) continue;
    const key = `${u.type}:${u.carried?.type ?? ""}:${guard?.id ?? "campaign"}`;
    if (!fields.has(key)) fields.set(key, navigationField(s, k, u, guard));
    let move = chooseMove(s, k, threats, u, fields.get(key)!, profile, simulations, guard, focus);
    if (attack && (!profile.coordinated || !move || move.score <= attack.score + 4 ||
      !UNITS[u.type].skills.includes("dash") || UNITS[u.type].skills.includes("escape"))) {
      perform(attack.action);
      u = k.units.get(unitId);
      if (!u) continue;
      move = chooseMove(s, k, threats, u, fields.get(key)!, profile, simulations, guard, focus);
    }
    if (move) perform({ type: "MOVE", unitId, to: move.to });
    if (special(unitId)) continue;
    u = k.units.get(unitId);
    // Persistence is bounded by visible target count as well as total budget.
    const chainLimit = Math.min(64, Math.max(12, k.enemies.length + 1));
    for (let chain = 0; chain < chainLimit && u && active(); chain++) {
      attack = chooseAttack(s, k, u, profile.coordinated, focus);
      if (!attack || !perform(attack.action)) break;
      u = k.units.get(unitId);
      if (!u || !UNITS[u.type].skills.includes("persist")) break;
    }
    u = k.units.get(unitId);
    if (u && !u.moved && !u.attacked && u.hp < u.maxHp &&
      incomingDamage(s, k, threats, u, u.y * s.options.size + u.x) < u.hp)
      perform({ type: "HEAL", unitId });
  }
  // The economy allowance scales with the empire and treasury. It shares
  // the global budget, so even huge saved games have a finite upper bound.
  threats = buildThreatMap(s, k, profile.coordinated);
  const economicLimit = Math.min(512, Math.max(16, k.ownCities.length * 5 + Math.floor(s.players[player].resources / 8)));
  for (let i = 0; i < economicLimit && active(); i++) {
    const action = chooseEconomic(s, k, threats, profile);
    if (!action || !perform(action, "economy")) break;
  }
  diagnostics.truncated = diagnostics.actionCount >= diagnostics.budget;
  diagnostics.simulations = simulations.used;
  if (s.status === "playing" && s.currentPlayer === player) {
    const end: Action = { type: "END_TURN" };
    const result = applyAction(s, end);
    if (result.ok) { s = result.state; actions.push(end); }
  }
  return { state: s, actions, diagnostics };
}

export function runAiTurn(input: GameState, maxActions?: number): GameState {
  return runAiTurnDetailed(input, maxActions).state;
}
