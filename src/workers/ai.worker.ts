import { runAiTurn } from "../game/ai/ai";
import type { AiRequest, AiResponse } from "./aiProtocol";

// No DOM, store, rendering, or network access belongs in the AI worker.
self.onmessage = (event: MessageEvent<AiRequest>) => {
  const request = event.data;
  if (request.type !== "RUN_TURN") return;
  let response: AiResponse;
  try {
    response = {
      type: "TURN_COMPLETE",
      requestId: request.requestId,
      state: runAiTurn(request.state),
    };
  } catch (error) {
    response = {
      type: "TURN_ERROR",
      requestId: request.requestId,
      error: error instanceof Error ? error.message : "AI 计算失败。",
    };
  }
  self.postMessage(response);
};
