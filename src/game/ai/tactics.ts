import { UNITS } from "../data/config";
import { distance, neighbors } from "../map/generate";
import { hashSeed } from "../map/random";
import { applyAction, getAttackTargets, getReachableTiles, previewCombat } from "../rules/engine";
import type { Action, City, GameState, Unit } from "../types";
import { incomingDamage, observe, simulationState, type Knowledge, type ThreatMap } from "./knowledge";
import type { AiProfile } from "./profiles";

export interface SimulationBudget { used: number; limit: number }
export interface AttackChoice { action: Extract<Action, {type: "ATTACK"}>; score: number }

export function chooseAttack(_s: GameState, k: Knowledge, u: Unit, normal: boolean, focus?: string): AttackChoice | undefined {
  let best: AttackChoice | undefined;
  for (const target of getAttackTargets(k.view, u.id)) {
    const result = previewCombat(k.view, u.id, target.id);
    const killed = result.damage >= target.hp, lost = result.retaliation >= u.hp;
    let score = result.damage * 2 - result.retaliation * (normal ? 1.5 : 0.8) +
      (killed ? 12 + UNITS[target.type].cost * 2 : 0) - (lost ? 16 + UNITS[u.type].cost * 3 : 0);
    if (normal) {
      if (target.id === focus) score += 16;
      if (k.ownCities.some((c) => distance(c, target) === 0)) score += 70;
      if (k.ownCities.some((c) => distance(c, target) <= 2)) score += 8;
      if (UNITS[u.type].skills.includes("splash"))
        score += k.enemies.filter((e) => e.id !== target.id && distance(e, target) <= 1).length * 8;
      if (UNITS[u.type].skills.includes("persist") && killed)
        score += k.enemies.filter((e) => e.id !== target.id && distance(e, target) <= 1).length * 5;
    }
    if (score >= 0 && (!best || score > best.score))
      best = { action: { type: "ATTACK", unitId: u.id, targetId: target.id }, score };
  }
  return best;
}

/** Shared focus gives ranged units the first shot and avoids spreading damage
 * across several healthy targets when a combined kill is already available. */
export function chooseFocus(k: Knowledge): string | undefined {
  let best: string | undefined, bestScore = -Infinity;
  for (const target of k.enemies) {
    let damage = 0, attackers = 0;
    for (const u of k.own) {
      if (distance(u, target) > UNITS[u.type].range || u.attacked) continue;
      const c = previewCombat(k.view, u.id, target.id);
      if (c.canAttack) { damage += c.damage; attackers++; }
    }
    if (!attackers) continue;
    const score = Math.min(damage, target.hp) + (damage >= target.hp ? 20 : 0) +
      UNITS[target.type].attack * 4 + UNITS[target.type].cost +
      (k.ownCities.some((c) => distance(c, target) === 0) ? 100 : 0);
    if (score > bestScore) { bestScore = score; best = target.id; }
  }
  return best;
}

export function chooseMove(
  s: GameState, k: Knowledge, threats: ThreatMap, u: Unit, nav: Map<number, number>,
  profile: AiProfile, simulations: SimulationBudget, guard?: City, focus?: string,
): { to: number; score: number } | undefined {
  const moves = getReachableTiles(k.view, u.id);
  if (!moves.length) return;
  const current = u.y * s.options.size + u.x;
  const before = nav.get(current);
  const riskBefore = incomingDamage(s, k, threats, u, current);
  const occupiedCity = k.cities.find((c) => c.x === u.x && c.y === u.y && c.owner !== k.player);
  if (occupiedCity) return; // Stay until next-turn capture is possible.
  const defending = guard && distance(u, guard) === 0;
  const candidateScores: { to: number; score: number; risk: number }[] = [];
  for (const id of moves) {
    const t = s.tiles[id], after = nav.get(id);
    const risk = incomingDamage(s, k, threats, u, id);
    let score = (before !== undefined && after !== undefined ? (before - after) * 9 : 0);
    const discoveries = neighbors(s.tiles, s.options.size, t).filter((t) => !k.known.has(t.id)).length;
    score += discoveries * (guard ? 0 : 2) + (t.ruin && !guard ? 15 : 0);
    const city = t.cityId ? k.cities.find((c) => c.id === t.cityId) : undefined;
    if (city && city.owner !== k.player && (city.owner === null || !s.players[k.player].peaceWith.includes(city.owner)))
      score += city.owner === null ? 36 : 28;
    if (guard) {
      score += (distance(u, guard) - distance(t, guard)) * 18;
      if (distance(t, guard) === 0) score += 35;
      if (defending) score -= 100;
    }
    if (profile.coordinated) {
      score += (riskBefore - risk) * profile.threatWeight;
      if (risk >= u.hp) score -= 20 + UNITS[u.type].cost * 2;
      // Friendly support matters near the frontline, never by inspecting
      // concealed units. Avoid both isolated charges and endless clustering.
      if (risk > 0) score += Math.min(3, k.own.filter((ally) => ally.id !== u.id && distance(ally, t) <= 2).length) * 3;
      if (u.attacked) score += (riskBefore - risk) * 2;
    } else score -= risk * profile.threatWeight;
    score += (hashSeed(`${s.options.seed}:${s.round}:${u.id}:${id}`) % 1000) / 1000 * profile.moveNoise;
    candidateScores.push({ to: id, score, risk });
  }
  candidateScores.sort((a, b) => b.score - a.score || a.to - b.to);
  if (profile.coordinated && !u.attacked && UNITS[u.type].skills.includes("dash") &&
    k.enemies.some((e) => distance(e, u) <= UNITS[u.type].movement + UNITS[u.type].range + 1)) {
    // Bounded move -> attack rollouts use the same rules as actual play.
    // The leaf penalty estimates the visible opponents' next response.
    const branchState = simulationState(s, k);
    for (const candidate of candidateScores.slice(0, profile.simulationCandidates)) {
      if (simulations.used >= simulations.limit) break;
      simulations.used++;
      const moved = applyAction(branchState, { type: "MOVE", unitId: u.id, to: candidate.to });
      if (!moved.ok) continue;
      const perceive = (state: GameState) => observe({
        ...state, players: state.players.map((p) => p.id === k.player
          ? { ...p, explored: [...k.known], visible: [...k.visible] } : p),
      });
      let after = moved.state, knowledge = perceive(after);
      const attacker = knowledge.units.get(u.id);
      if (!attacker) continue;
      const attack = chooseAttack(after, knowledge, attacker, true, focus);
      if (attack && simulations.used < simulations.limit) {
        simulations.used++;
        const fought = applyAction(after, attack.action);
        if (fought.ok) { after = fought.state; knowledge = perceive(after); candidate.score += attack.score; }
      }
      const survivor = knowledge.units.get(u.id);
      if (!survivor) candidate.score -= 40 + UNITS[u.type].cost * 4;
      else {
        const nextRisk = incomingDamage(after, knowledge, threats, survivor, survivor.y * s.options.size + survivor.x);
        candidate.score += (candidate.risk - nextRisk) * profile.threatWeight;
        if (nextRisk >= survivor.hp) candidate.score -= 16;
      }
    }
    candidateScores.sort((a, b) => b.score - a.score || a.to - b.to);
  }
  const best = candidateScores[0];
  if (!best || (profile.coordinated && best.score <= 0)) return;
  return { to: best.to, score: best.score };
}
