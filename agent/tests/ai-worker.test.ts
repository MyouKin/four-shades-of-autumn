import { afterEach, describe, expect, it, vi } from "vitest";
import { AiWorkerClient, type WorkerPort } from "../../src/workers/aiClient";
import type { AiRequest, AiResponse } from "../../src/workers/aiProtocol";
import { newGame } from "./helpers";

class FakeWorker implements WorkerPort {
  onmessage: WorkerPort["onmessage"] = null;
  onerror: WorkerPort["onerror"] = null;
  onmessageerror: WorkerPort["onmessageerror"] = null;
  postMessage = vi.fn<(message: AiRequest) => void>();
  terminate = vi.fn();
  respond(message: AiResponse) {
    this.onmessage?.({ data: message } as MessageEvent<AiResponse>);
  }
}

afterEach(() => vi.useRealTimers());

describe("AI worker lifecycle", () => {
  it("waits for matching asynchronous replies and reuses the worker", async () => {
    const worker = new FakeWorker();
    const factory = vi.fn(() => worker);
    const client = new AiWorkerClient(factory);
    const state = newGame();
    const first = client.run(state);
    const id = worker.postMessage.mock.calls[0][0].requestId;
    worker.respond({ type: "TURN_COMPLETE", requestId: id + 1, state });
    await expect(client.run(state)).rejects.toThrow("仍在计算");
    worker.respond({ type: "TURN_COMPLETE", requestId: id, state });
    await expect(first).resolves.toEqual(state);
    const second = client.run(state);
    worker.respond({ type: "TURN_COMPLETE", requestId: id + 1, state });
    await expect(second).resolves.toEqual(state);
    expect(factory).toHaveBeenCalledTimes(1);
    client.cancel();
  });

  it("terminates canceled work and ignores stale replies after a new session starts", async () => {
    const workers = [new FakeWorker(), new FakeWorker()];
    let index = 0;
    const client = new AiWorkerClient(() => workers[index++]);
    const state = newGame();
    const old = client.run(state);
    const rejected = expect(old).rejects.toMatchObject({ name: "AbortError" });
    client.cancel();
    await rejected;
    expect(workers[0].terminate).toHaveBeenCalledOnce();
    const fresh = client.run(state);
    const freshId = workers[1].postMessage.mock.calls[0][0].requestId;
    workers[0].respond({ type: "TURN_COMPLETE", requestId: freshId - 1, state });
    workers[1].respond({ type: "TURN_COMPLETE", requestId: freshId, state });
    await expect(fresh).resolves.toBe(state);
    client.cancel();
  });

  it("surfaces load errors and permits a fresh worker retry without running AI on the main thread", async () => {
    const worker = new FakeWorker();
    const client = new AiWorkerClient(() => worker);
    const task = client.run(newGame());
    const rejected = expect(task).rejects.toThrow("offline worker missing");
    worker.onerror?.({ message: "offline worker missing", preventDefault: vi.fn() } as unknown as ErrorEvent);
    await rejected;
    expect(worker.terminate).toHaveBeenCalledOnce();
    const retry = client.run(newGame());
    const id = worker.postMessage.mock.calls[1][0].requestId;
    worker.respond({ type: "TURN_ERROR", requestId: id, error: "rule error" });
    await expect(retry).rejects.toThrow("rule error");
    client.cancel();
  });

  it("times out and terminates stalled computation instead of freezing the game", async () => {
    vi.useFakeTimers();
    const worker = new FakeWorker();
    const client = new AiWorkerClient(() => worker, 1000);
    const task = client.run(newGame());
    const rejected = expect(task).rejects.toThrow("超时");
    await vi.advanceTimersByTimeAsync(1000);
    await rejected;
    expect(worker.terminate).toHaveBeenCalledOnce();
  });
});
