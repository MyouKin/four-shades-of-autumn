import { useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  LockKeyhole,
  Volume2,
  Activity,
  HelpCircle,
  Download,
  Upload,
  Save,
  Home,
  Flag,
  Building2,
} from "lucide-react";
import {
  TECHNOLOGIES,
  getTechCost,
  getScore,
  validateAction,
  getEmbassyCost,
} from "../game";
import type { Action, GameState, TechDefinition } from "../game/types";
import { serializeGame, useGameStore } from "../store/gameStore";
import { Modal, Cost, ResourceIcon } from "./Common";
import { scenarioLabels } from "./Menu";
import { PwaControls } from "../pwa/PwaControls";

export function TechPanel({
  game,
  onClose,
  onCommand,
}: {
  game: GameState;
  onClose: () => void;
  onCommand: (a: Action) => void;
}) {
  const player = game.players[0];
  const roots = TECHNOLOGIES.filter((t) => !t.prerequisites.length);
  const nodes: {
    tech: TechDefinition;
    x: number;
    y: number;
    parent?: string;
  }[] = [];
  const point = (angle: number, r: number) => ({
    x: 50 + Math.cos(angle) * r,
    y: 50 + Math.sin(angle) * r,
  });
  roots.forEach((root, i) => {
    const angle = -Math.PI / 2 + (i * Math.PI * 2) / 5;
    nodes.push({ tech: root, ...point(angle, 16) });
    const children = TECHNOLOGIES.filter((t) =>
      t.prerequisites.includes(root.id),
    );
    children.forEach((child, j) => {
      const branchAngle = angle + (j === 0 ? -0.29 : 0.29);
      nodes.push({ tech: child, ...point(branchAngle, 30), parent: root.id });
      TECHNOLOGIES.filter((t) => t.prerequisites.includes(child.id)).forEach(
        (leaf) =>
          nodes.push({
            tech: leaf,
            ...point(branchAngle, 43),
            parent: child.id,
          }),
      );
    });
  });
  return (
    <Modal title="科技树" onClose={onClose} wide>
      <div className="tech-balance">
        <span className="resource-pill">
          <ResourceIcon />
          {player.resources}
        </span>
        <span>
          {player.technologies.length} / {TECHNOLOGIES.length}
        </span>
      </div>
      <div className="radial-tech-scroll">
        <div className="radial-tech-tree">
          <svg
            viewBox="0 0 100 100"
            className="tech-connections"
            aria-hidden="true"
          >
            {nodes.map((n) => {
              const p = n.parent
                ? nodes.find((a) => a.tech.id === n.parent)
                : { x: 50, y: 50 };
              return (
                p && (
                  <line
                    key={n.tech.id}
                    x1={p.x}
                    y1={p.y}
                    x2={n.x}
                    y2={n.y}
                    className={
                      player.technologies.includes(n.tech.id) ? "complete" : ""
                    }
                  />
                )
              );
            })}
          </svg>
          <div className="tech-center" style={{ borderColor: player.color }}>
            <strong>{player.name}</strong>
            <span>科技</span>
          </div>
          {nodes.map(({ tech, x, y }) => {
            const done = player.technologies.includes(tech.id),
              ready =
                tech.tier === 1 ||
                tech.prerequisites.some((p) =>
                  player.technologies.includes(p),
                ) ||
                TECHNOLOGIES.some(
                  (c) =>
                    c.prerequisites.includes(tech.id) &&
                    player.technologies.includes(c.id),
                );
            const action: Action = { type: "RESEARCH", techId: tech.id },
              reason = validateAction(game, action);
            return (
              <button
                key={tech.id}
                className={`radial-tech ${done ? "researched" : ready ? "researchable" : "locked"}`}
                style={{ left: `${x}%`, top: `${y}%` }}
                disabled={done || !!reason || game.currentPlayer !== 0}
                onClick={() => onCommand(action)}
                title={`${tech.unlocks}${reason ? `\n${reason}` : ""}`}
              >
                <strong>{tech.name}</strong>
                <span>
                  {done ? (
                    <Check size={15} />
                  ) : !ready ? (
                    <LockKeyhole size={14} />
                  ) : (
                    <Cost value={getTechCost(game, 0, tech.id)} />
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="tech-legend">
        <span>
          <i className="researched-dot" />
          已研究
        </span>
        <span>
          <i className="researchable-dot" />
          可研究
        </span>
        <span>
          <LockKeyhole size={12} />
          未解锁
        </span>
      </div>
    </Modal>
  );
}

export function DiplomacyPanel({
  game,
  onClose,
  onCommand,
}: {
  game: GameState;
  onClose: () => void;
  onCommand: (a: Action) => void;
}) {
  const player = game.players[0];
  const others = game.players.filter(
    (p) => p.id !== 0 && player.metPlayers.includes(p.id),
  );
  const button = (action: Action, label: string, cost?: number) => {
    const reason = validateAction(game, action);
    return (
      <button
        className="secondary"
        disabled={!!reason || game.currentPlayer !== 0}
        title={reason || label}
        onClick={() => onCommand(action)}
      >
        {label}
        {cost !== undefined && <Cost value={cost} />}
      </button>
    );
  };
  return (
    <Modal title="外交" onClose={onClose}>
      <div className="diplomacy-body">
        {others.length ? (
          others.map((p) => (
            <article className="diplomacy-row" key={p.id}>
              <header>
                <i style={{ background: p.color }} />
                <h3>{p.name}</h3>
                <span>
                  {p.eliminated
                    ? "已消灭"
                    : player.peaceWith.includes(p.id)
                      ? "和平"
                      : "战争"}
                </span>
              </header>
              {!p.eliminated && (
                <div>
                  {player.peaceWith.includes(p.id)
                    ? button(
                        { type: "BREAK_PEACE", targetPlayer: p.id },
                        "解除和平",
                      )
                    : button(
                        { type: "PEACE", targetPlayer: p.id },
                        player.peaceOffers.includes(p.id)
                          ? "接受和平"
                          : p.peaceOffers.includes(0)
                            ? "已提议和平"
                            : "提议和平",
                      )}
                  {player.embassies.includes(p.id) ? (
                    <span className="embassy-label">
                      <Building2 size={15} />
                      已建大使馆
                    </span>
                  ) : (
                    button(
                      { type: "EMBASSY", targetPlayer: p.id },
                      "大使馆",
                      getEmbassyCost(game, 0),
                    )
                  )}
                </div>
              )}
            </article>
          ))
        ) : (
          <p>尚未发现其他阵营。</p>
        )}
      </div>
    </Modal>
  );
}

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const { game, settings, updateSettings, save, menu, importSave, command, busy } =
    useGameStore();
  const [resign, setResign] = useState(false),
    file = useRef<HTMLInputElement>(null);
  const exportFile = () => {
    if (!game) return;
    const url = URL.createObjectURL(
      new Blob([serializeGame(game)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `game-${game.options.seed}-turn${game.round}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <Modal title="设置" onClose={onClose}>
      <div className="settings-body">
        <PwaControls canUpdate={!busy} beforeUpdate={save} />
        {(
          [
            { key: "sound", icon: Volume2, title: "音效" },
            { key: "reducedMotion", icon: Activity, title: "减少动画" },
            { key: "showHints", icon: HelpCircle, title: "操作提示" },
          ] as const
        ).map(({ key, icon: Icon, title }) => (
          <button
            key={key}
            className="setting-row"
            role="switch"
            aria-checked={settings[key]}
            onClick={() => updateSettings({ [key]: !settings[key] })}
          >
            <Icon size={20} />
            <span>
              <strong>{title}</strong>
            </span>
            <i className={`toggle ${settings[key] ? "on" : ""}`} />
          </button>
        ))}
        {game && (
          <div className="save-actions">
            <button
              className="secondary"
              onClick={() => {
                save();
                onClose();
              }}
            >
              <Save size={16} />
              保存
            </button>
            <button className="secondary" onClick={exportFile}>
              <Download size={16} />
              导出存档
            </button>
          </div>
        )}
        <input
          type="file"
          accept=".json,application/json"
          hidden
          ref={file}
          onChange={async (e) => {
            const selected = e.target.files?.[0];
            if (selected) {
              if (selected.size > 8_000_000) {
                useGameStore.getState().setNotice("存档不能超过 8 MB。");
                return;
              }
              importSave(await selected.text());
              onClose();
            }
          }}
        />
        <button className="text-action" onClick={() => file.current?.click()}>
          <Upload size={16} />
          导入存档
        </button>
        {game && (
          <>
            <div className="settings-game">
              <span>{scenarioLabels[game.options.scenario]}</span>
              <code>{game.options.seed}</code>
              <span>
                {game.options.size} × {game.options.size} ·{" "}
                {game.options.mode === "conquest" ? "统治" : "完美"}
              </span>
            </div>
            <button
              className="secondary full"
              onClick={() => {
                menu();
                onClose();
              }}
            >
              <Home size={17} />
              保存并返回主菜单
            </button>
            {game.status === "playing" &&
              !game.players[0].eliminated &&
              (resign ? (
                <div className="resign-confirm">
                  <p>确认认输并结束对局？</p>
                  <button
                    className="danger"
                    onClick={() => {
                      command({ type: "RESIGN" });
                      onClose();
                    }}
                  >
                    确认认输
                  </button>
                  <button
                    className="secondary"
                    onClick={() => setResign(false)}
                  >
                    取消
                  </button>
                </div>
              ) : (
                <button
                  className="text-action muted"
                  disabled={game.currentPlayer !== 0}
                  onClick={() => setResign(true)}
                >
                  <Flag size={14} />
                  认输
                </button>
              ))}
          </>
        )}
      </div>
    </Modal>
  );
}

export function HelpPanel({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="操作说明" onClose={onClose}>
      <div className="help-body">
        {[
          [
            "01",
            "移动",
            "点击己方单位，再点击绿色地块。拖动地图平移，滚轮缩放。不同兵种的行动能力由技能决定。",
          ],
          [
            "02",
            "建设",
            "点击城市训练单位。点击领土内的资源进行采集或建设。城市升级后选择奖励。",
          ],
          ["03", "科技", "科技树中点击可研究的科技。城市越多，研究费用越高。"],
          [
            "04",
            "战斗",
            "点击红色目标查看伤害，确认后攻击。单位进入村庄或敌方城市，下一回合可占领。",
          ],
          [
            "05",
            "回合",
            "点击结束回合，其他阵营依次行动。统治模式消灭所有对手；完美模式在 30 回合后结算。",
          ],
        ].map(([n, title, desc]) => (
          <div key={n} className="help-step">
            <span>{n}</span>
            <div>
              <h3>{title}</h3>
              <p>{desc}</p>
            </div>
          </div>
        ))}
        <div className="keyboard-hints">
          <kbd>Esc</kbd>取消<kbd>N</kbd>下一单位<kbd>T</kbd>科技<kbd>Enter</kbd>
          结束回合
        </div>
      </div>
    </Modal>
  );
}

export function ResultsPanel({
  game,
  onClose,
}: {
  game: GameState;
  onClose: () => void;
}) {
  const menu = useGameStore((s) => s.menu),
    win = game.winner === 0;
  return (
    <Modal
      title={win ? "胜利" : game.winner === null ? "对局结束" : "失败"}
      onClose={onClose}
    >
      <div className="results-content">
        <p>
          {game.winner !== null
            ? `${game.players[game.winner]?.name} 获胜`
            : ""}
        </p>
        <div className="result-stats">
          <div>
            <strong>{game.round}</strong>
            <span>回合</span>
          </div>
          <div>
            <strong>{getScore(game, 0)}</strong>
            <span>分数</span>
          </div>
          <div>
            <strong>{game.players[0].stats.kills}</strong>
            <span>击败单位</span>
          </div>
        </div>
        <div className="ranking">
          {[...game.players]
            .sort((a, b) => getScore(game, b.id) - getScore(game, a.id))
            .map((p, i) => (
              <div key={p.id}>
                <span>{i + 1}</span>
                <i style={{ background: p.color }} />
                <strong>
                  {p.name}
                  {p.id === 0 ? " · 你" : ""}
                </strong>
                <span>{getScore(game, p.id)}</span>
              </div>
            ))}
        </div>
        <button className="primary full" onClick={menu}>
          返回主菜单
          <ArrowRight size={18} />
        </button>
        <button className="text-action" onClick={onClose}>
          查看地图
        </button>
      </div>
    </Modal>
  );
}
