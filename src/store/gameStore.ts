import { create } from "zustand";
import { applyAction, createGame } from "../game";
import type { Action, GameOptions, GameState } from "../game/types";
import { deserializeGame, serializeGame } from "./save";
import { aiWorker } from "../workers/aiClient";
export { deserializeGame, serializeGame } from "./save";

const SAVE_KEY = "four-shades-of-autumn.save.v2";
const SETTINGS_KEY = "four-shades-of-autumn.settings.v1";
export interface Settings {
  sound: boolean;
  reducedMotion: boolean;
  showHints: boolean;
}
const defaultSettings: Settings = {
  sound: true,
  reducedMotion: false,
  showHints: false,
};
function readSettings(): Settings {
  try {
    const saved = JSON.parse(
      localStorage.getItem(SETTINGS_KEY) || "{}",
    ) as Partial<Settings>;
    return {
      sound: saved.sound ?? defaultSettings.sound,
      reducedMotion: saved.reducedMotion ?? defaultSettings.reducedMotion,
      showHints: saved.showHints ?? defaultSettings.showHints,
    };
  } catch {
    return defaultSettings;
  }
}
export function hasSavedGame(): boolean {
  try {
    return !!localStorage.getItem(SAVE_KEY);
  } catch {
    return false;
  }
}
function persist(game: GameState) {
  try {
    localStorage.setItem(SAVE_KEY, serializeGame(game));
    return true;
  } catch {
    return false;
  }
}
let generation = 0;

interface Store {
  game: GameState | null;
  screen: "menu" | "game";
  selectedTile: number | null;
  selectedUnit: string | null;
  busy: boolean;
  aiError: string;
  notice: string;
  resetKey: number;
  sessionId: number;
  settings: Settings;
  start: (options: GameOptions) => void;
  select: (tileId: number, unitId?: string | null) => void;
  command: (action: Action) => boolean;
  advanceAI: () => void;
  save: () => boolean;
  load: () => void;
  importSave: (text: string) => void;
  menu: () => void;
  resume: () => void;
  setNotice: (text: string) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  resetCamera: () => void;
}
export const useGameStore = create<Store>((set, get) => ({
  game: null,
  screen: "menu",
  selectedTile: null,
  selectedUnit: null,
  busy: false,
  aiError: "",
  notice: "",
  resetKey: 0,
  sessionId: 0,
  settings: readSettings(),
  start: (options) => {
    const game = createGame(options);
    generation++;
    aiWorker.cancel();
    const saved = persist(game);
    set({
      game,
      screen: "game",
      selectedTile: null,
      selectedUnit: null,
      busy: false,
      aiError: "",
      notice: saved ? "" : "存档失败，请导出存档。",
      resetKey: get().resetKey + 1,
      sessionId: get().sessionId + 1,
    });
  },
  select: (tileId, unitId) =>
    set({ selectedTile: tileId, selectedUnit: unitId ?? null }),
  command: (action) => {
    const { game, busy } = get();
    if (!game || busy || game.currentPlayer !== 0 || game.status !== "playing")
      return false;
    const result = applyAction(game, action);
    if (!result.ok) {
      set({ notice: result.error || "现在无法执行这个行动。" });
      return false;
    }
    const unit = result.state.units.find((u) => u.id === get().selectedUnit);
    const next = result.state;
    const saved = persist(next);
    set({
      game: next,
      notice: saved ? "" : "浏览器存储空间不足，请从菜单导出存档。",
      selectedUnit: unit?.id ?? null,
      selectedTile: unit
        ? unit.y * game.options.size + unit.x
        : get().selectedTile,
    });
    if (next.status === "playing" && next.currentPlayer !== 0)
      get().advanceAI();
    return true;
  },
  advanceAI: () => {
    if (get().busy || get().screen !== "game") return;
    const currentGeneration = generation;
    const game = get().game;
    if (!game || game.status !== "playing" || game.currentPlayer === 0) {
      set({ busy: false });
      return;
    }
    set({ busy: true, aiError: "" });
    void (async () => {
      let saveFailed = false;
      try {
        while (currentGeneration === generation && get().screen === "game") {
          const live = get().game;
          if (!live || live.status !== "playing" || live.currentPlayer === 0) break;
          const next = await aiWorker.run(live);
          // Loading, restarting, or leaving the game invalidates in-flight results.
          if (currentGeneration !== generation || get().game !== live) return;
          const saved = persist(next);
          saveFailed ||= !saved;
          set({ game: next, notice: saved ? "" : "存档失败，请导出存档。" });
        }
        if (currentGeneration !== generation) return;
        const next = get().game;
        set({
          busy: false,
          notice: saveFailed ? "存档失败，请导出存档。" : next?.status === "playing" ? `第 ${next.round} 回合 · 轮到你了` : "",
        });
      } catch (error) {
        if (currentGeneration !== generation) return;
        set({
          busy: false,
          aiError: error instanceof Error ? error.message : "AI 回合处理失败。",
        });
      }
    })();
  },
  save: () => {
    const game = get().game;
    if (!game) return true;
    const saved = persist(game);
    set({ notice: saved ? "对局已保存到此浏览器。" : "无法写入本地存储，请导出存档。" });
    return saved;
  },
  load: () => {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) {
        set({ notice: "还没有本地存档。" });
        return;
      }
      get().importSave(raw);
    } catch {
      set({ notice: "存档无法读取，请导入备份或开始新对局。" });
    }
  },
  importSave: (raw) => {
    try {
      const game = deserializeGame(raw);
      generation++;
      aiWorker.cancel();
      persist(game);
      set({
        game,
        screen: "game",
        busy: false,
        aiError: "",
        selectedTile: null,
        selectedUnit: null,
        notice: "已恢复对局。",
        resetKey: get().resetKey + 1,
        sessionId: get().sessionId + 1,
      });
      if (game.currentPlayer !== 0 && game.status === "playing")
        get().advanceAI();
    } catch (error) {
      set({
        notice: error instanceof Error ? error.message : "存档读取失败。",
      });
    }
  },
  menu: () => {
    generation++;
    aiWorker.cancel();
    const game = get().game;
    if (game) persist(game);
    set({ screen: "menu", busy: false, aiError: "" });
  },
  resume: () => {
    set({ screen: "game" });
    get().advanceAI();
  },
  setNotice: (notice) => set({ notice }),
  updateSettings: (patch) => {
    const settings = { ...get().settings, ...patch };
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      /* Settings stay valid in memory. */
    }
    set({ settings });
  },
  resetCamera: () => set({ resetKey: get().resetKey + 1 }),
}));
