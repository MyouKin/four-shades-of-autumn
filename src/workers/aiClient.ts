import type { GameState } from "../game/types";
import type { AiRequest, AiResponse } from "./aiProtocol";

export interface WorkerPort {
  onmessage: ((event: MessageEvent<AiResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
  postMessage(message: AiRequest): void;
  terminate(): void;
}

const createWorker = (): WorkerPort =>
  new Worker(new URL("./ai.worker.ts", import.meta.url), { type: "module" });

/** One reusable worker; cancellation terminates computation, not just its callback. */
export class AiWorkerClient {
  private worker: WorkerPort | null = null;
  private sequence = 0;
  private pending: {
    id: number;
    resolve: (state: GameState) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  } | null = null;

  constructor(
    private factory: () => WorkerPort = createWorker,
    private timeoutMs = 120_000,
  ) {}

  run(state: GameState): Promise<GameState> {
    if (this.pending) return Promise.reject(new Error("AI 回合仍在计算。"));
    return new Promise((resolve, reject) => {
      try {
        if (!this.worker) {
          this.worker = this.factory();
          this.worker.onmessage = (event) => {
            const response = event.data;
            const pending = this.pending;
            if (!pending || response.requestId !== pending.id) return;
            clearTimeout(pending.timer);
            this.pending = null;
            if (response.type === "TURN_COMPLETE") pending.resolve(response.state);
            else pending.reject(new Error(response.error));
          };
          this.worker.onerror = (event) => {
            event.preventDefault?.();
            this.fail(new Error(event.message || "AI 工作线程无法启动。"));
          };
          this.worker.onmessageerror = () => this.fail(new Error("AI 结果读取失败。"));
        }
        const id = ++this.sequence;
        const timer = setTimeout(() => this.fail(new Error("AI 计算超时，请重试。")), this.timeoutMs);
        this.pending = { id, resolve, reject, timer };
        this.worker.postMessage({ type: "RUN_TURN", requestId: id, state });
      } catch (error) {
        const reason = error instanceof Error ? error : new Error("AI 工作线程不可用。");
        this.fail(reason);
        reject(reason);
      }
    });
  }

  cancel(): void {
    const error = new Error("AI 回合已取消。");
    error.name = "AbortError";
    this.fail(error);
  }

  private fail(error: Error): void {
    this.worker?.terminate();
    this.worker = null;
    const pending = this.pending;
    this.pending = null;
    if (pending) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
  }
}

export const aiWorker = new AiWorkerClient();
