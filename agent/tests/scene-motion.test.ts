import { describe, expect, it } from "vitest";
import {
  createMotionPath,
  isVisibleTransition,
  movementDuration,
  sampleMotionPath,
  sampleMovement,
  turnTowards,
} from "../../src/scene/motion";
import type { MotionVector } from "../../src/scene/motion";

describe("unit presentation timing", () => {
  it("holds the starting square before a delayed melee advance", () => {
    const out: MotionVector = [0, 0, 0];
    sampleMovement([2, 0.1, 2], [3, 0.1, 2], -0.12, 0.3, out);
    expect(out).toEqual([2, 0.1, 2]);
  });
  it("has the same pose at a fixed elapsed time regardless of frame cadence", () => {
    const from: MotionVector = [1, 0, 1],
      to: MotionVector = [3, 0.2, 1];
    const direct: MotionVector = [0, 0, 0],
      stepped: MotionVector = [0, 0, 0];
    sampleMovement(from, to, 0.2, 0.4, direct);
    for (let frame = 1; frame <= 12; frame++)
      sampleMovement(from, to, frame / 60, 0.4, stepped);
    expect(stepped).toEqual(direct);
    expect(direct).toEqual([2, 0.1, 1]);
  });
  it("finishes on the precise target without asymptotic drift", () => {
    const out: MotionVector = [0, 0, 0];
    sampleMovement([0, 0, 0], [2, 0.17, 3], 3, 0.4, out);
    expect(out).toEqual([2, 0.17, 3]);
  });
  it("keeps one-square moves legible and long moves bounded", () => {
    expect(movementDuration(1)).toBeGreaterThanOrEqual(0.28);
    expect(movementDuration(6)).toBeLessThanOrEqual(0.55);
  });
  it("turns across the short arc at the angle wrap", () => {
    const result = turnTowards(Math.PI - 0.1, -Math.PI + 0.1, 0.5);
    expect(result).toBeCloseTo(Math.PI);
  });
});

describe("legal route presentation", () => {
  it("follows the route around an obstacle instead of cutting its corner", () => {
    const path = createMotionPath([
      [0, 0, 0],
      [0, 0, 2],
      [2, 0, 2],
    ]);
    const out: MotionVector = [0, 0, 0];
    for (let frame = 0; frame <= 30; frame++) {
      sampleMotionPath(path, frame / 60, 0.5, out);
      expect(out[0] === 0 || out[2] === 2).toBe(true);
    }
    expect(out).toEqual([2, 0, 2]);
  });
  it("samples a terrain height only along the selected segment", () => {
    const path = createMotionPath([
      [0, 0, 0],
      [1, 0.5, 0],
      [2, 0, 0],
    ]);
    const out: MotionVector = [0, 0, 0];
    sampleMotionPath(path, 0.25, 0.5, out);
    expect(out).toEqual([1, 0.5, 0]);
  });
  it("handles repeated endpoints without division by zero", () => {
    const path = createMotionPath([
      [1, 0.2, 1],
      [1, 0.2, 1],
    ]);
    const out: MotionVector = [0, 0, 0];
    sampleMotionPath(path, 2, 0, out);
    expect(out).toEqual([1, 0.2, 1]);
  });
});

describe("fog-safe transitions", () => {
  const from = { x: 0, y: 0 },
    to = { x: 2, y: 0 };
  it("allows a path visible in both rule snapshots", () => {
    expect(
      isVisibleTransition(from, to, new Set([0, 1, 2]), new Set([0, 1, 2]), 8),
    ).toBe(true);
  });
  it("rejects a hidden intermediate square even when endpoints are visible", () => {
    expect(
      isVisibleTransition(from, to, new Set([0, 2]), new Set([0, 1, 2]), 8),
    ).toBe(false);
  });
  it("does not reveal a path that became hidden after the move", () => {
    expect(
      isVisibleTransition(from, to, new Set([0, 1, 2]), new Set([1, 2]), 8),
    ).toBe(false);
  });
  it("checks diagonal paths with the same privacy requirement", () => {
    expect(
      isVisibleTransition(
        from,
        { x: 2, y: 2 },
        new Set([0, 9, 18]),
        new Set([0, 18]),
        8,
      ),
    ).toBe(false);
  });
});
