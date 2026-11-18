import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { getMovementPath, isUnitVisible } from "../game";
import type { GameState, Unit } from "../game/types";
import { terrainHeight } from "./models";
import {
  clampProgress,
  easeInOut,
  getFreshEvents,
  isVisibleTransition,
  movementDuration,
  createMotionPath,
  sampleMotionPath,
  turnTowards,
} from "./motion";
import type {
  MotionPath,
  MotionVector,
  PresentedUnit,
  UnitCue,
} from "./motion";

const idleCue = (serial = 0): UnitCue => ({
  serial,
  issuedAt: 0,
  attackFirst: false,
  hit: false,
  appear: false,
  trained: false,
  dying: false,
});
/** Presentation snapshots survive viewport changes and retain a dying model briefly.
 * Only visual data is retained: rule state and command timing are never delayed. */
export function usePresentedUnits(game: GameState, preview: boolean) {
  const previous = useRef(game);
  const serial = useRef(0);
  const [presented, setPresented] = useState<PresentedUnit[]>(() =>
    game.units
      .filter((unit) => preview || isUnitVisible(game, unit, 0))
      .map((unit) => ({ unit, cue: idleCue() })),
  );
  useLayoutEffect(() => {
    const before = previous.current;
    if (before === game) return;
    previous.current = game;
    const revision = ++serial.current;
    if (
      before.options.seed !== game.options.seed ||
      before.options.size !== game.options.size ||
      game.nextId < before.nextId ||
      game.round < before.round
    ) {
      setPresented(
        game.units
          .filter((unit) => preview || isUnitVisible(game, unit, 0))
          .map((unit) => ({ unit, cue: idleCue(revision) })),
      );
      return;
    }
    const oldUnits = new Map(before.units.map((unit) => [unit.id, unit]));
    const newIds = new Set(game.units.map((unit) => unit.id));
    const visibleBefore = new Set(before.players[0].visible);
    const visibleNow = new Set(game.players[0].visible);
    const events = getFreshEvents(before, game);
    const attacks = new Map(
      events
        .filter((event) => event.type === "attack" && event.unitId)
        .map((event) => [event.unitId!, event]),
    );
    const deaths = new Map(
      events
        .filter((event) => event.type === "death" && event.unitId)
        .map((event) => [event.unitId!, event]),
    );
    setPresented((current) => {
      const existing = new Map(
        current.map((record) => [record.unit.id, record]),
      );
      const result: PresentedUnit[] = [];
      for (const unit of game.units) {
        if (!preview && !isUnitVisible(game, unit, 0)) continue;
        const old = oldUnits.get(unit.id);
        const record = existing.get(unit.id);
        const hadVisibility =
          !!old && (preview || isUnitVisible(before, old, 0));
        const moved = !!old && (old.x !== unit.x || old.y !== unit.y);
        const attack = attacks.get(unit.id);
        const attackFirst = !!(
          moved &&
          attack?.from &&
          old &&
          attack.from.x === old.x &&
          attack.from.y === old.y
        );
        const ids =
          moved && old
            ? getMovementPath(
                before,
                old.id,
                unit.y * game.options.size + unit.x,
              )
            : [];
        // Advancing after a melee kill is a direct adjacent combat step, not a MOVE command.
        const path = ids.length
          ? ids.map((id) => ({ x: before.tiles[id].x, y: before.tiles[id].y }))
          : attackFirst &&
              old &&
              Math.max(Math.abs(old.x - unit.x), Math.abs(old.y - unit.y)) === 1
            ? [
                { x: old.x, y: old.y },
                { x: unit.x, y: unit.y },
              ]
            : undefined;
        const safePath =
          !!path &&
          hadVisibility &&
          (preview ||
            unit.owner === 0 ||
            path.every((point, index) =>
              isVisibleTransition(
                path[Math.max(0, index - 1)],
                point,
                visibleBefore,
                visibleNow,
                game.options.size,
              ),
            ));
        const attackTarget =
          attack?.at &&
          (preview ||
            visibleNow.has(attack.at.y * game.options.size + attack.at.x))
            ? { x: attack.at.x, y: attack.at.y }
            : undefined;
        const hit = !!old && unit.hp < old.hp;
        const appeared = !record || !hadVisibility;
        if (!moved && !attackTarget && !hit && !appeared) {
          result.push({ unit, cue: record!.cue });
          continue;
        }
        result.push({
          unit,
          cue: {
            serial: revision,
            issuedAt: performance.now(),
            path: safePath ? path : undefined,
            from: moved && safePath ? { x: old!.x, y: old!.y } : undefined,
            attackTarget,
            attackFirst,
            hit,
            appear: appeared || (moved && !safePath),
            trained: !old,
            dying: false,
          },
        });
      }
      for (const record of current) {
        if (newIds.has(record.unit.id)) continue;
        if (record.cue.dying) {
          if (performance.now() - record.cue.issuedAt < 500)
            result.push(record);
          continue;
        }
        const death = deaths.get(record.unit.id);
        const at = death?.at ?? record.unit;
        if (
          !death ||
          (!preview &&
            record.unit.owner !== 0 &&
            !visibleNow.has(at.y * game.options.size + at.x))
        )
          continue;
        result.push({
          unit: { ...record.unit, x: at.x, y: at.y },
          cue: {
            ...idleCue(revision),
            issuedAt: performance.now(),
            hit: true,
            dying: true,
          },
        });
      }
      // Short visual effects are bounded independently of the total map size.
      const ghosts = result.filter((record) => record.cue.dying).slice(-24);
      return [...result.filter((record) => !record.cue.dying), ...ghosts];
    });
  }, [game, preview]);
  const finish = useCallback((unitId: string, cueSerial: number) => {
    setPresented((records) =>
      records.filter(
        (record) =>
          !(
            record.unit.id === unitId &&
            record.cue.serial === cueSerial &&
            record.cue.dying
          ),
      ),
    );
  }, []);
  return { presented, finish };
}

function positionOf(
  game: GameState,
  unit: Pick<Unit, "x" | "y">,
  offset: number,
): MotionVector {
  const tile = game.tiles[unit.y * game.options.size + unit.x];
  const extra = tile.cityId ? 0.24 : 0;
  return [
    unit.x - offset + extra,
    terrainHeight(tile) + 0.08,
    unit.y - offset + extra,
  ];
}
interface Track {
  serial: number;
  started: number;
  from: MotionVector;
  to: MotionVector;
  path: MotionPath;
  segment: number;
  moveDuration: number;
  moveDelay: number;
  attackDelay: number;
  attackDuration: number;
  attackX: number;
  attackZ: number;
  startYaw: number;
  moveYaw: number;
  attackYaw: number;
  hit: boolean;
  appear: boolean;
  trained: boolean;
  dying: boolean;
  finished: boolean;
}
export function useUnitMotion(
  record: PresentedUnit,
  game: GameState,
  offset: number,
  reducedMotion: boolean,
  onFinish: (id: string, serial: number) => void,
) {
  const root = useRef<THREE.Group>(null);
  const model = useRef<THREE.Group>(null);
  const clock = useThree((state) => state.clock);
  const target = positionOf(game, record.unit, offset);
  const initial = useRef<MotionVector>(
    record.cue.from && performance.now() - record.cue.issuedAt < 800
      ? positionOf(game, record.cue.from, offset)
      : target,
  );
  const output = useRef<MotionVector>([...target]);
  const heading = useRef(0);
  const initialized = useRef(false);
  const track = useRef<Track>({
    serial: -1,
    started: 0,
    from: target,
    to: target,
    path: createMotionPath([target, target]),
    segment: 1,
    moveDuration: 0,
    moveDelay: 0,
    attackDelay: 0,
    attackDuration: 0,
    attackX: 0,
    attackZ: 0,
    startYaw: 0,
    moveYaw: 0,
    attackYaw: 0,
    hit: false,
    appear: false,
    trained: false,
    dying: false,
    finished: false,
  });
  useLayoutEffect(() => {
    if (!root.current || !model.current) return;
    const cue = record.cue;
    const to = positionOf(game, record.unit, offset);
    const from: MotionVector = initialized.current
      ? [
          root.current.position.x,
          root.current.position.y,
          root.current.position.z,
        ]
      : cue.from
        ? positionOf(game, cue.from, offset)
        : [...to];
    initialized.current = true;
    // Missing/hidden origins must snap to the known endpoint, never cross fog.
    if (cue.appear && !cue.from) from.splice(0, 3, ...to);
    if (cue.dying) to.splice(0, 3, ...from);
    const distance = Math.hypot(to[0] - from[0], to[2] - from[2]);
    const points: MotionVector[] = [from];
    if (!cue.appear && !cue.dying) {
      // A fast follow-up action continues the still-visible remainder of the old path.
      const running = track.current;
      if (
        initialized.current &&
        running.moveDuration &&
        clock.elapsedTime - running.started <
          running.moveDelay + running.moveDuration
      )
        points.push(...running.path.points.slice(running.segment));
      if (cue.path)
        points.push(
          ...cue.path.slice(1).map((point) => positionOf(game, point, offset)),
        );
    }
    points.push(to);
    const path = createMotionPath(points);
    const duration =
      (!cue.appear || !!cue.from) && distance > 0.015
        ? movementDuration(path.total)
        : 0;
    const attackOrigin = cue.attackFirst ? from : to;
    const dx = cue.attackTarget
      ? cue.attackTarget.x - offset - attackOrigin[0]
      : 0;
    const dz = cue.attackTarget
      ? cue.attackTarget.y - offset - attackOrigin[2]
      : 0;
    const length = Math.hypot(dx, dz) || 1;
    const attackDuration = cue.attackTarget ? 0.24 : 0;
    track.current = {
      serial: cue.serial,
      started:
        clock.elapsedTime -
        (initialized.current && track.current.serial < 0
          ? Math.max(0, performance.now() - cue.issuedAt) / 1000
          : 0),
      from,
      to,
      path,
      segment: 1,
      moveDuration: duration,
      moveDelay: cue.attackFirst ? attackDuration * 0.75 : 0,
      attackDelay: cue.attackFirst ? 0 : duration,
      attackDuration,
      attackX: dx / length,
      attackZ: dz / length,
      startYaw: heading.current,
      moveYaw:
        distance > 0.015
          ? Math.atan2(-(to[0] - from[0]), -(to[2] - from[2]))
          : heading.current,
      attackYaw: cue.attackTarget ? Math.atan2(-dx, -dz) : heading.current,
      hit: cue.hit,
      appear: cue.appear,
      trained: cue.trained,
      dying: cue.dying,
      finished: false,
    };
    root.current.position.fromArray(from);
    // Track changes are tied to snapshot cues, never to incidental UI rerenders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record.cue.serial, record.unit.id, clock, offset]);
  useFrame(({ clock }) => {
    if (!root.current || !model.current) return;
    const state = track.current;
    const elapsed = clock.elapsedTime - state.started;
    if (reducedMotion) {
      root.current.position.fromArray(state.to);
      model.current.position.set(0, 0, 0);
      model.current.rotation.set(
        0,
        state.attackDuration ? state.attackYaw : state.moveYaw,
        0,
      );
      model.current.scale.setScalar(1);
      if (state.dying && !state.finished) {
        state.finished = true;
        onFinish(record.unit.id, state.serial);
      }
      return;
    }
    state.segment = sampleMotionPath(
      state.path,
      elapsed - state.moveDelay,
      state.moveDuration,
      output.current,
    );
    root.current.position.fromArray(output.current);
    const moveProgress = state.moveDuration
      ? clampProgress((elapsed - state.moveDelay) / state.moveDuration)
      : 1;
    const moving = elapsed >= state.moveDelay && moveProgress < 1;
    const attackProgress = state.attackDuration
      ? clampProgress((elapsed - state.attackDelay) / state.attackDuration)
      : 1;
    const attackActive =
      state.attackDuration > 0 &&
      elapsed >= state.attackDelay &&
      attackProgress < 1;
    const lunge = attackActive ? Math.sin(attackProgress * Math.PI) * 0.23 : 0;
    const hit = state.hit ? Math.max(0, 1 - elapsed / 0.28) : 0;
    const gait = moving ? Math.sin(moveProgress * Math.PI * 4) * 0.025 : 0;
    const bob = moving
      ? Math.abs(Math.sin(moveProgress * Math.PI * 3)) * 0.055
      : 0;
    const spawn = state.appear
      ? easeInOut(elapsed / (state.trained ? 0.32 : 0.2))
      : 1;
    const spawnScale = state.appear
      ? 0.6 + 0.4 * spawn + Math.sin(spawn * Math.PI) * 0.08
      : 1;
    const death = state.dying ? clampProgress(elapsed / 0.42) : 0;
    const deathScale = 1 - easeInOut(death);
    if (moving) {
      const a = state.path.points[state.segment - 1],
        b = state.path.points[state.segment];
      if (a && b && Math.hypot(b[0] - a[0], b[2] - a[2]) > 0.01)
        state.moveYaw = Math.atan2(-(b[0] - a[0]), -(b[2] - a[2]));
    }
    const yaw =
      attackActive || (elapsed >= state.attackDelay && state.attackDuration > 0)
        ? turnTowards(
            state.moveDuration ? state.moveYaw : state.startYaw,
            state.attackYaw,
            (elapsed - state.attackDelay) / 0.13,
          )
        : turnTowards(
            heading.current,
            state.moveYaw,
            Math.min(1, elapsed / 0.1),
          );
    heading.current = yaw;
    model.current.rotation.set(
      state.dying ? death * 0.4 : 0,
      yaw,
      gait +
        Math.sin(hit * Math.PI * 3) * 0.1 +
        (state.dying ? death * 0.5 : 0),
    );
    model.current.position.set(
      state.attackX * lunge,
      bob + hit * 0.055 - death * 0.15,
      state.attackZ * lunge,
    );
    model.current.scale.setScalar(spawnScale * deathScale);
    if (state.dying && death >= 1 && !state.finished) {
      state.finished = true;
      onFinish(record.unit.id, state.serial);
    }
  });
  return { root, model, initial: initial.current };
}
