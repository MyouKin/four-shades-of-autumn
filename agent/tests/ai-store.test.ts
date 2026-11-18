import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GameState } from "../../src/game/types";
import { applyAction, DEFAULT_OPTIONS } from "../../src/game";

const jobs = vi.hoisted(() => ({
  pending: [] as { resolve: (state: GameState) => void; reject: (error: Error) => void }[],
  run: vi.fn<(state: GameState) => Promise<GameState>>(),
  cancel: vi.fn(),
}));
vi.mock("../../src/workers/aiClient", () => ({ aiWorker: jobs }));
import { useGameStore } from "../../src/store/gameStore";
import { deserializeGame } from "../../src/store/save";

beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  });
  jobs.pending = [];
  jobs.run.mockReset();
  jobs.cancel.mockReset();
  jobs.run.mockImplementation(() => new Promise((resolve, reject) => jobs.pending.push({ resolve, reject })));
  useGameStore.getState().start({ ...structuredClone(DEFAULT_OPTIONS), size: 12, aiCount: 2 });
});

describe("worker and game session coordination", () => {
  it("advances multiple opponents asynchronously, checkpoints each turn, and returns control", async () => {
    expect(useGameStore.getState().command({ type: "END_TURN" })).toBe(true);
    expect(useGameStore.getState().busy).toBe(true);
    expect(jobs.run).toHaveBeenCalledTimes(1);
    let state = useGameStore.getState().game!;
    state = applyAction(state, { type: "END_TURN" }).state;
    jobs.pending[0].resolve(state);
    await vi.waitFor(() => expect(jobs.run).toHaveBeenCalledTimes(2));
    expect(deserializeGame(localStorage.getItem("four-shades-of-autumn.save.v2")!).currentPlayer).toBe(2);
    state = applyAction(state, { type: "END_TURN" }).state;
    jobs.pending[1].resolve(state);
    await vi.waitFor(() => expect(useGameStore.getState().busy).toBe(false));
    expect(useGameStore.getState().game?.currentPlayer).toBe(0);
    expect(useGameStore.getState().game?.round).toBe(2);
  });

  it("pauses in the menu and ignores stale completion after starting another game", async () => {
    useGameStore.getState().command({ type: "END_TURN" });
    const previous = useGameStore.getState().game!;
    useGameStore.getState().menu();
    expect(useGameStore.getState().busy).toBe(false);
    useGameStore.getState().start({ ...structuredClone(DEFAULT_OPTIONS), size: 12, aiCount: 1, seed: "replacement" });
    const fresh = useGameStore.getState().game;
    jobs.pending[0].resolve(applyAction(previous, { type: "END_TURN" }).state);
    await Promise.resolve();
    expect(useGameStore.getState().game).toBe(fresh);
    expect(useGameStore.getState().game?.options.seed).toBe("replacement");
    expect(jobs.cancel).toHaveBeenCalledTimes(3);
  });

  it("restores an AI turn from disk and retries errors without silently skipping an opponent", async () => {
    useGameStore.getState().command({ type: "END_TURN" });
    useGameStore.getState().menu();
    useGameStore.getState().load();
    expect(jobs.run).toHaveBeenCalledTimes(2);
    jobs.pending[1].reject(new Error("worker failed"));
    await vi.waitFor(() => expect(useGameStore.getState().aiError).toBe("worker failed"));
    expect(useGameStore.getState().busy).toBe(false);
    expect(useGameStore.getState().game?.currentPlayer).toBe(1);
    useGameStore.getState().advanceAI();
    expect(jobs.run).toHaveBeenCalledTimes(3);
    expect(useGameStore.getState().aiError).toBe("");
    useGameStore.getState().menu();
  });
});
