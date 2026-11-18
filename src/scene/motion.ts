import type { GameEvent, GameState, Position, Unit } from "../game/types";

export type MotionVector = [number, number, number];
export const clampProgress = (value: number) => Math.max(0, Math.min(1, value));
export const easeInOut = (value: number) => {
  const t = clampProgress(value);
  return t * t * (3 - 2 * t);
};
/** A bounded, deterministic duration keeps a one-tile move legible at any FPS. */
export const movementDuration = (distance: number) =>
  Math.min(0.52, 0.29 + Math.max(0, distance - 1) * 0.055);
export function sampleMovement(
  from: MotionVector,
  to: MotionVector,
  elapsed: number,
  duration: number,
  out: MotionVector,
): MotionVector {
  const t = duration <= 0 ? 1 : easeInOut(elapsed / duration);
  out[0] = from[0] + (to[0] - from[0]) * t;
  out[1] = from[1] + (to[1] - from[1]) * t;
  out[2] = from[2] + (to[2] - from[2]) * t;
  return out;
}
export function turnTowards(
  from: number,
  to: number,
  progress: number,
): number {
  const delta = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + delta * easeInOut(progress);
}
/** An enemy may never be drawn travelling through a cell hidden in either snapshot. */
export function isVisibleTransition(
  from: Position,
  to: Position,
  previous: ReadonlySet<number>,
  current: ReadonlySet<number>,
  size: number,
): boolean {
  const steps = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y));
  for (let i = 0; i <= steps; i++) {
    const t = steps ? i / steps : 0;
    const x = Math.round(from.x + (to.x - from.x) * t);
    const y = Math.round(from.y + (to.y - from.y) * t);
    const id = y * size + x;
    if (!previous.has(id) || !current.has(id)) return false;
  }
  return true;
}
export interface UnitCue {
  serial: number;
  issuedAt: number;
  from?: Position;
  path?: Position[];
  attackTarget?: Position;
  attackFirst: boolean;
  hit: boolean;
  appear: boolean;
  trained: boolean;
  dying: boolean;
}
export interface PresentedUnit {
  unit: Unit;
  cue: UnitCue;
}
export function getFreshEvents(
  previous: GameState,
  current: GameState,
): GameEvent[] {
  const lastId = previous.events.at(-1)?.id ?? 0;
  return current.events.filter((event) => event.id > lastId);
}

export interface MotionPath {
  points: MotionVector[];
  lengths: number[];
  total: number;
}
/** Cache lengths once per action; frame sampling performs no allocations. */
export function createMotionPath(points: MotionVector[]): MotionPath {
  const lengths = [0];
  for (let i = 1; i < points.length; i++)
    lengths.push(
      lengths[i - 1] +
        Math.hypot(
          points[i][0] - points[i - 1][0],
          points[i][2] - points[i - 1][2],
        ),
    );
  return { points, lengths, total: lengths.at(-1) ?? 0 };
}
export function sampleMotionPath(
  path: MotionPath,
  elapsed: number,
  duration: number,
  out: MotionVector,
): number {
  const progress = duration <= 0 ? 1 : easeInOut(elapsed / duration);
  const distance = path.total * progress;
  let segment = 1;
  while (segment < path.points.length - 1 && path.lengths[segment] < distance)
    segment++;
  const from = path.points[segment - 1] ?? path.points[0];
  const to = path.points[segment] ?? from;
  const length =
    (path.lengths[segment] ?? 0) - (path.lengths[segment - 1] ?? 0);
  const fraction =
    length > 0
      ? clampProgress((distance - path.lengths[segment - 1]) / length)
      : 1;
  out[0] = from[0] + (to[0] - from[0]) * fraction;
  out[1] = from[1] + (to[1] - from[1]) * fraction;
  out[2] = from[2] + (to[2] - from[2]) * fraction;
  return segment;
}
