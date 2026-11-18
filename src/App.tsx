import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import {
  createGame,
  DEFAULT_OPTIONS,
  getAttackTargets,
  getPendingUpgradeCity,
  isUnitVisible,
  validateAction,
  getReachableTiles,
} from "./game";
import type { Action } from "./game/types";
import GameScene from "./scene/GameScene";
import { useGameStore } from "./store/gameStore";
import { MainMenu, About } from "./ui/Menu";
import { GameHUD, ScoreChip } from "./ui/GameHUD";
import {
  HelpPanel,
  ResultsPanel,
  SettingsPanel,
  TechPanel,
  DiplomacyPanel,
} from "./ui/Panels";
import { playSound } from "./ui/sound";

type Panel = "tech" | "diplomacy" | "settings" | "about" | "help" | null;
export default function App() {
  const {
    game,
    screen,
    selectedTile,
    selectedUnit,
    select,
    command,
    busy,
    notice,
    setNotice,
    resetKey,
    sessionId,
    settings,
  } = useGameStore();
  const [panel, setPanel] = useState<Panel>(null),
    [target, setTarget] = useState<string | null>(null),
    [dismissedResult, setDismissedResult] = useState<string | null>(null);
  const [selectionRequest, setSelectionRequest] = useState(0);
  const [systemReducedMotion, setSystemReducedMotion] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setSystemReducedMotion(preference.matches);
    preference.addEventListener("change", update);
    return () => preference.removeEventListener("change", update);
  }, []);
  const reducedMotion = settings.reducedMotion || systemReducedMotion;
  useEffect(() => {
    setTarget(null);
  }, [sessionId]);
  const preview = useMemo(
    () =>
      createGame({
        ...DEFAULT_OPTIONS,
        size: 12,
        aiCount: 3,
        seed: "four-shades-diorama",
        mapType: "lakes",
      }),
    [],
  );
  const current = screen === "game" && game ? game : preview;
  const reachable = useMemo(
    () =>
      game && selectedUnit && !busy
        ? getReachableTiles(game, selectedUnit)
        : [],
    [game, selectedUnit, busy],
  );
  const attackTargets = useMemo(
    () =>
      game && selectedUnit && !busy
        ? [
            ...getAttackTargets(game, selectedUnit),
            ...game.units.filter(
              (u) =>
                !validateAction(game, {
                  type: "CONVERT",
                  unitId: selectedUnit,
                  targetId: u.id,
                }),
            ),
          ].map((u) => u.id)
        : [],
    [game, selectedUnit, busy],
  );
  const pendingUpgrade = game?.status === "playing" && game.currentPlayer === 0 && !busy
    ? getPendingUpgradeCity(game)
    : undefined;
  function openActionTile(
    tileId: number,
    kind: "upgrade" | "capture",
    unitId?: string,
  ) {
    select(tileId, kind === "capture" ? unitId : null);
    setTarget(null);
    setSelectionRequest((request) => request + 1);
  }
  function perform(action: Action) {
    if (action.type === "END_TURN" && pendingUpgrade && game) {
      openActionTile(pendingUpgrade.y * game.options.size + pendingUpgrade.x, "upgrade");
      return;
    }
    if (command(action) && settings.sound)
      playSound(
        action.type === "MOVE"
          ? "move"
          : action.type === "ATTACK"
            ? "attack"
            : action.type === "END_TURN"
              ? "turn"
              : action.type === "RESEARCH"
                ? "research"
                : "click",
      );
  }
  function nextUnit() {
    if (!game) return;
    const units = game.units.filter(
      (u) => u.owner === 0 && (!u.moved || !u.attacked),
    );
    if (!units.length) {
      setNotice("没有待行动的单位。");
      return;
    }
    const next =
      units[(units.findIndex((u) => u.id === selectedUnit) + 1) % units.length];
    select(next.y * game.options.size + next.x, next.id);
    setTarget(null);
  }
  function clickTile(id: number) {
    if (screen !== "game" || !game || busy) return;
    const tile = game.tiles[id];
    const unit = game.units.find(
      (u) => u.x === tile.x && u.y === tile.y && isUnitVisible(game, u, 0),
    );
    if (selectedUnit && unit && attackTargets.includes(unit.id)) {
      setTarget(unit.id);
      return;
    }
    if (
      selectedUnit &&
      reachable.includes(id) &&
      id !== selectedTile &&
      !unit
    ) {
      perform({ type: "MOVE", unitId: selectedUnit, to: id });
      setTarget(null);
      return;
    }
    select(id, unit?.id ?? null);
    setTarget(null);
    if (settings.sound) playSound("click");
  }
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 5500);
    return () => clearTimeout(timer);
  }, [notice, setNotice]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        (e.target as HTMLElement)?.matches("input,select,textarea") ||
        panel ||
        screen !== "game"
      )
        return;
      if (e.key === "Escape") {
        setTarget(null);
        useGameStore.setState({ selectedTile: null, selectedUnit: null });
      }
      if (e.key.toLowerCase() === "t") setPanel("tech");
      if (e.key.toLowerCase() === "n") nextUnit();
      if (
        e.key === "Enter" &&
        !e.repeat &&
        !target &&
        !(e.target as HTMLElement)?.closest("button")
      ) {
        e.preventDefault();
        perform({ type: "END_TURN" });
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  const resultKey = game
    ? `${sessionId}-${game.options.seed}-${game.round}-${game.winner}`
    : "";
  return (
    <div
      className={`app ${screen === "menu" ? "is-menu" : "is-playing"} ${reducedMotion ? "reduce-motion" : ""}`}
    >
      <div className={screen === "menu" ? "menu-scene" : "game-scene"}>
        <GameScene
          key={`${screen}-${sessionId}`}
          game={current}
          selectedTile={screen === "game" ? selectedTile : null}
          selectedUnit={screen === "game" ? selectedUnit : null}
          reachable={screen === "game" ? reachable : []}
          attackTargets={screen === "game" ? attackTargets : []}
          onTileClick={clickTile}
          onActionBadge={openActionTile}
          resetKey={resetKey}
          reducedMotion={reducedMotion}
          preview={screen === "menu"}
        />
      </div>
      {screen === "menu" ? (
        <MainMenu
          onSettings={() => setPanel("settings")}
          onAbout={() => setPanel("about")}
        />
      ) : (
        game && (
          <>
            <GameHUD
              selectionRequest={selectionRequest}
              upgradePending={!!pendingUpgrade}
              game={game}
              onCommand={perform}
              onTech={() => setPanel("tech")}
              onDiplomacy={() => setPanel("diplomacy")}
              onSettings={() => setPanel("settings")}
              onHelp={() => setPanel("help")}
              nextUnit={nextUnit}
              target={target}
              setTarget={setTarget}
            />
            <ScoreChip game={game} />
          </>
        )
      )}
      {panel === "settings" && <SettingsPanel onClose={() => setPanel(null)} />}{" "}
      {panel === "about" && <About onClose={() => setPanel(null)} />}{" "}
      {panel === "help" && <HelpPanel onClose={() => setPanel(null)} />}{" "}
      {panel === "tech" && game && (
        <TechPanel
          game={game}
          onClose={() => setPanel(null)}
          onCommand={perform}
        />
      )}{" "}
      {panel === "diplomacy" && game && (
        <DiplomacyPanel
          game={game}
          onClose={() => setPanel(null)}
          onCommand={perform}
        />
      )}{" "}
      {screen === "game" &&
        game?.status === "finished" &&
        dismissedResult !== resultKey &&
        !panel && (
          <ResultsPanel
            game={game}
            onClose={() => setDismissedResult(resultKey)}
          />
        )}{" "}
      {notice && (
        <div className="toast" role="status">
          <span>{notice}</span>
          <button onClick={() => setNotice("")} aria-label="关闭通知">
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
