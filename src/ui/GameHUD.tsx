import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUp,
  BrainCircuit,
  Building2,
  Check,
  ChevronRight,
  CircleHelp,
  Compass,
  Crosshair,
  Flag,
  Heart,
  LocateFixed,
  Mountain,
  Route,
  Settings2,
  Shield,
  Sprout,
  Swords,
  Trees,
  Users,
  Waves,
  X,
  Zap,
  Handshake,
  Eye,
  Award,
  Trash2,
} from "lucide-react";
import {
  BUILDINGS,
  TECHNOLOGIES,
  UNITS,
  getCityCapacity,
  getCityIncome,
  getIncome,
  getMovement,
  getScore,
  getTrainingCost,
  populationNeeded,
  previewCombat,
  validateAction,
  getUpgradeRewards,
  isUnitVisible,
  getVisibleResource,
} from "../game";
import type {
  Action,
  GameState,
  Reward,
  Terrain,
  UnitType,
  Tile,
  Unit,
} from "../game/types";
import { useGameStore } from "../store/gameStore";
import { Cost, ResourceIcon } from "./Common";
import { mapLabels } from "./Menu";

const terrainNames: Record<Terrain, string> = {
  plain: "田野",
  forest: "森林",
  mountain: "山脉",
  shallow: "浅水",
  deep: "海洋",
};
const resourceNames = {
  fruit: "水果",
  animal: "动物",
  crop: "作物",
  ore: "金属",
  fish: "鱼",
  starfish: "海星",
};
const unitIcons: Record<UnitType, typeof Shield> = {
  warrior: Swords,
  rider: Zap,
  defender: Shield,
  archer: Crosshair,
  swordsman: Swords,
  catapult: Crosshair,
  knight: Zap,
  mindBender: BrainCircuit,
  cloak: Eye,
  dagger: Swords,
  giant: Users,
  raft: Waves,
  scout: Compass,
  rammer: Waves,
  bomber: Crosshair,
  juggernaut: Waves,
  dinghy: Waves,
  pirate: Swords,
};
const rewards: Record<Reward, [string, string]> = {
  income: ["工坊", "每回合 +1 星星"],
  explore: ["探索者", "自动探索 15 步"],
  resources: ["资源", "获得 5 星星"],
  defense: ["城墙", "城市防御提升"],
  population: ["人口", "增加 3 人口"],
  territory: ["边界扩张", "领土扩大 1 格"],
  park: ["公园", "增加 250 分"],
  giant: ["巨人", "生成巨人"],
};
const harvestCost = (tile: Tile) => (tile.resource === "starfish" ? 0 : 2);
function resourceVisible(game: GameState, tile: Tile) {
  return getVisibleResource(game, tile, 0) !== null;
}
const seenUnit = (game: GameState, unit: Unit) => isUnitVisible(game, unit, 0);
interface Props {
  game: GameState;
  onCommand: (a: Action) => void;
  onTech: () => void;
  onDiplomacy: () => void;
  onSettings: () => void;
  onHelp: () => void;
  nextUnit: () => void;
  target: string | null;
  setTarget: (id: string | null) => void;
}
export function GameHUD({
  game,
  onCommand,
  onTech,
  onDiplomacy,
  onSettings,
  onHelp,
  nextUnit,
  target,
  setTarget,
}: Props) {
  const { selectedTile, selectedUnit, busy, aiError, advanceAI, resetCamera, settings } =
    useGameStore();
  const player = game.players[0],
    available = game.units.filter(
      (u) => u.owner === 0 && (!u.moved || !u.attacked),
    );
  const events = game.events
    .filter(
      (e) =>
        e.player === 0 ||
        (e.at && player.visible.includes(e.at.y * game.options.size + e.at.x)),
    )
    .slice(-2)
    .reverse();
  return (
    <>
      {aiError && (
        <div className="ai-error" role="alert">
          <span>{aiError}</span>
          <button className="secondary" onClick={advanceAI}>重试 AI 回合</button>
        </div>
      )}
      <header className="game-topbar">
        <button
          className="game-brand"
          onClick={onSettings}
          aria-label="打开游戏菜单"
        >
          <Settings2 size={22} />
        </button>
        <div className="hud-civ">
          <span className="mini-emblem" style={{ background: player.color }}>
            <Flag size={17} />
          </span>
          <strong>{player.name}</strong>
        </div>
        <div className="hud-economy">
          <div className="hud-resources">
            <ResourceIcon size={22} />
            <strong>{player.resources}</strong>
          </div>
          <span className="income">+{getIncome(game, 0)} / 回合</span>
        </div>
        <div className="hud-territory">
          <Building2 size={17} />
          <strong>{game.cities.filter((c) => c.owner === 0).length}</strong>
          <span>城市</span>
        </div>
        <div className="hud-turn">
          <strong>
            第 <b>{game.round}</b> 回合
            {game.options.mode === "score" && <em>/ 30</em>}
          </strong>
        </div>
      </header>
      <div className="map-tools">
        <button onClick={onTech} title="科技树 (T)">
          <BrainCircuit size={22} />
          <span>科技</span>
        </button>
        <button onClick={nextUnit} title="下一单位 (N)">
          <Flag size={21} />
          <span>单位</span>
          <i>{available.length}</i>
        </button>
        <button onClick={onDiplomacy} title="外交">
          <Handshake size={21} />
          <span>外交</span>
        </button>
        <button onClick={resetCamera} title="重置视角">
          <LocateFixed size={21} />
          <span>视角</span>
        </button>
        <button onClick={onHelp} title="操作说明">
          <CircleHelp size={21} />
          <span>帮助</span>
        </button>
      </div>
      <div className="event-feed" aria-live="polite">
        {events.map((e) => (
          <div key={e.id}>
            <span />
            <p>{e.message}</p>
          </div>
        ))}
      </div>
      {settings.showHints && selectedTile === null && (
        <div className="onboarding-note">
          <Compass size={23} />
          <div>
            <strong>点击单位，再点击绿色地块移动。</strong>
          </div>
          <button
            onClick={() =>
              useGameStore.getState().updateSettings({ showHints: false })
            }
            aria-label="隐藏提示"
          >
            <X size={14} />
          </button>
        </div>
      )}
      <div className="map-bottom">
        <MiniMap game={game} />
        <div className="map-caption">
          <span>
            {mapLabels[game.options.mapType]} · {game.options.size} ×{" "}
            {game.options.size}
          </span>
        </div>
      </div>
      {selectedTile !== null && (
        <SelectionPanel
          key={`${selectedTile}-${selectedUnit}`}
          game={game}
          selectedTile={selectedTile}
          selectedUnit={selectedUnit}
          onCommand={onCommand}
          closeSelection={() =>
            useGameStore.setState({ selectedTile: null, selectedUnit: null })
          }
          onTech={onTech}
        />
      )}
      <div className="turn-control">
        {busy && (
          <span className="turn-status">
            {game.players[game.currentPlayer]?.name} 正在行动
          </span>
        )}
        <button
          className="end-turn"
          disabled={
            busy || game.status === "finished" || game.currentPlayer !== 0
          }
          onClick={() => {
            setTarget(null);
            onCommand({ type: "END_TURN" });
          }}
        >
          <span>
            {busy ? <span className="spinner" /> : <Check size={22} />}
          </span>
          <strong>{busy ? "等待对手" : "结束回合"}</strong>
          <ArrowRight size={20} />
        </button>
      </div>
      {target && selectedUnit && (
        <CombatConfirm
          game={game}
          attacker={selectedUnit}
          target={target}
          onClose={() => setTarget(null)}
          onAttack={() => {
            onCommand({
              type: UNITS[
                game.units.find((u) => u.id === selectedUnit)!.type
              ].skills.includes("convert")
                ? "CONVERT"
                : "ATTACK",
              unitId: selectedUnit,
              targetId: target,
            });
            setTarget(null);
          }}
        />
      )}
    </>
  );
}

function SelectionPanel({
  game,
  selectedTile,
  selectedUnit,
  onCommand,
  closeSelection,
  onTech,
}: {
  game: GameState;
  selectedTile: number;
  selectedUnit: string | null;
  onCommand: (a: Action) => void;
  closeSelection: () => void;
  onTech: () => void;
}) {
  const tile = game.tiles[selectedTile],
    player = game.players[0],
    explored = player.explored.includes(selectedTile);
  const city = game.cities.find((c) => c.id === tile.cityId),
    unit = game.units.find((u) => u.id === selectedUnit && seenUnit(game, u));
  const [tab, setTab] = useState<"unit" | "city">(unit ? "unit" : "city");
  const moveReady =
    unit &&
    ((!unit.moved && !unit.attacked) ||
      (UNITS[unit.type].skills.includes("escape") &&
        unit.attacked &&
        !unit.escapeUsed));
  const attackReady =
    unit &&
    !unit.attacked &&
    (!unit.moved || UNITS[unit.type].skills.includes("dash"));
  const enabled = (a: Action) =>
    game.currentPlayer === 0 &&
    game.status === "playing" &&
    !validateAction(game, a);
  const actionButton = (
    action: Action,
    label: string,
    Icon: typeof Shield,
    cost?: number,
  ) => (
    <button
      key={JSON.stringify(action)}
      className="secondary full"
      disabled={!enabled(action)}
      title={validateAction(game, action) || label}
      onClick={() => onCommand(action)}
    >
      <Icon size={16} />
      {label}
      {cost !== undefined && <Cost value={cost} />}
    </button>
  );
  const tileActions = (t: Tile) => {
    const actions: { action: Action; label: string; cost: number }[] = [];
    if (
      t.resource &&
      resourceVisible(game, t) &&
      ["fruit", "animal", "fish", "starfish"].includes(t.resource)
    )
      actions.push({
        action: { type: "HARVEST", tileId: t.id },
        label: `采集${resourceNames[t.resource]}`,
        cost: harvestCost(t),
      });
    if (!t.building && !t.cityId)
      for (const b of Object.values(BUILDINGS))
        if (
          b.terrain.includes(t.terrain) &&
          (!b.resource || b.resource === t.resource) &&
          (!b.monument ||
            enabled({ type: "BUILD", tileId: t.id, building: b.id }))
        )
          actions.push({
            action: { type: "BUILD", tileId: t.id, building: b.id },
            label: b.name,
            cost: b.cost,
          });
    return actions;
  };
  return (
    <aside className="selection-panel">
      <header>
        <div>
          <span className="eyebrow">
            {explored
              ? tile.owner === 0
                ? "你的领土"
                : tile.owner === null
                  ? "中立"
                  : game.players[tile.owner].name
              : "未探索"}
            <span className="coordinates">
              {tile.x + 1}, {tile.y + 1}
            </span>
          </span>
          <h2>
            {!explored
              ? "未探索"
              : tab === "unit" && unit
                ? UNITS[unit.type].name
                : city
                  ? city.name
                  : terrainNames[tile.terrain]}
          </h2>
        </div>
        <button
          className="icon-button"
          onClick={closeSelection}
          aria-label="关闭地块面板"
        >
          <X size={18} />
        </button>
      </header>
      {explored && (
        <>
          {unit && (
            <div className="selection-tabs">
              <button
                className={tab === "unit" ? "active" : ""}
                onClick={() => setTab("unit")}
              >
                <Flag size={14} />
                单位
              </button>
              <button
                className={tab === "city" ? "active" : ""}
                onClick={() => setTab("city")}
              >
                <Building2 size={14} />
                {city ? "城市" : "地块"}
              </button>
            </div>
          )}
          <div className="selection-scroll">
            {tab === "unit" && unit ? (
              <>
                <div className="unit-summary">
                  <span
                    className="unit-badge"
                    style={{ color: game.players[unit.owner].color }}
                  >
                    {(() => {
                      const Icon = unitIcons[unit.type];
                      return <Icon size={34} />;
                    })()}
                  </span>
                  <div>
                    <span>
                      {game.players[unit.owner].name}
                      {unit.veteran ? " · 老兵" : ""}
                    </span>
                    <div className="health-bar">
                      <i
                        style={{ width: `${(unit.hp / unit.maxHp) * 100}%` }}
                      />
                    </div>
                    <strong>
                      <Heart size={12} />
                      {unit.hp} / {unit.maxHp}
                    </strong>
                  </div>
                </div>
                <div className="unit-stats">
                  <span>
                    <Swords size={15} />
                    {UNITS[unit.type].attack}
                    <small>攻击</small>
                  </span>
                  <span>
                    <Shield size={15} />
                    {UNITS[unit.type].defense}
                    <small>防御</small>
                  </span>
                  <span>
                    <Route size={15} />
                    {getMovement(game, unit)}
                    <small>移动</small>
                  </span>
                  <span>
                    <Crosshair size={15} />
                    {UNITS[unit.type].range}
                    <small>射程</small>
                  </span>
                </div>
                <p className="unit-skills">{UNITS[unit.type].description}</p>
                {unit.owner === 0 && (
                  <>
                    <div className="action-state">
                      <span className={moveReady ? "" : "used"}>
                        <i />
                        {moveReady ? "可移动" : "移动结束"}
                      </span>
                      <span className={attackReady ? "" : "used"}>
                        <i />
                        {attackReady ? "行动可用" : "行动结束"}
                      </span>
                    </div>
                    {city &&
                      city.owner !== 0 &&
                      actionButton(
                        { type: "CAPTURE", unitId: unit.id },
                        enabled({ type: "CAPTURE", unitId: unit.id })
                          ? "占领"
                          : "占领（下一回合）",
                        Flag,
                      )}
                    {UNITS[unit.type].skills.includes("infiltrate") &&
                      game.cities
                        .filter(
                          (c) =>
                            c.owner !== null &&
                            c.owner !== unit.owner &&
                            Math.max(
                              Math.abs(c.x - unit.x),
                              Math.abs(c.y - unit.y),
                            ) <= 1,
                        )
                        .map((c) =>
                          actionButton(
                            {
                              type: "INFILTRATE",
                              unitId: unit.id,
                              cityId: c.id,
                            },
                            `渗透 ${c.name}`,
                            Eye,
                          ),
                        )}
                    {tile.resource === "starfish" &&
                      actionButton(
                        { type: "HARVEST", tileId: tile.id },
                        "采集海星",
                        Sprout,
                      )}
                    {tile.ruin &&
                      actionButton(
                        { type: "EXAMINE", unitId: unit.id },
                        "探索遗迹",
                        Compass,
                      )}
                    {actionButton(
                      { type: "HEAL", unitId: unit.id },
                      "恢复",
                      Heart,
                    )}
                    {UNITS[unit.type].skills.includes("heal") &&
                      actionButton(
                        { type: "HEAL_OTHERS", unitId: unit.id },
                        "治疗相邻单位",
                        Heart,
                      )}
                    {unit.kills >= 3 &&
                      !unit.veteran &&
                      !UNITS[unit.type].skills.includes("static") &&
                      actionButton(
                        { type: "PROMOTE", unitId: unit.id },
                        "晋升老兵",
                        Award,
                      )}
                    {unit.type === "raft" && (
                      <div className="naval-upgrades">
                        {(["scout", "rammer", "bomber"] as const)
                          .filter((t) => unit.type !== t)
                          .map((t) =>
                            actionButton(
                              {
                                type: "UPGRADE_NAVAL",
                                unitId: unit.id,
                                unitType: t,
                              },
                              `升级为${UNITS[t].name}`,
                              Waves,
                              UNITS[t].cost,
                            ),
                          )}
                      </div>
                    )}
                    {player.technologies.includes("freeSpirit") &&
                      actionButton(
                        { type: "DISBAND", unitId: unit.id },
                        "解散",
                        Trash2,
                      )}
                  </>
                )}
              </>
            ) : city ? (
              <>
                <div className="city-overview">
                  <span className="city-level">
                    <Building2 size={23} />
                    <b>{city.level}</b>
                    <small>等级</small>
                  </span>
                  <div className="city-metrics">
                    <span>
                      <ResourceIcon />+{getCityIncome(game, city.id)}
                      <small>每回合</small>
                    </span>
                    <span>
                      <Users size={15} />
                      {
                        game.units.filter(
                          (u) =>
                            u.homeCityId === city.id && u.owner === city.owner,
                        ).length
                      }{" "}
                      / {getCityCapacity(city)}
                      <small>单位</small>
                    </span>
                  </div>
                </div>
                <div className="population">
                  <div>
                    <span>人口</span>
                    <strong>
                      {city.population} / {populationNeeded(city)}
                    </strong>
                  </div>
                  <div className="progress-track">
                    <i
                      style={{
                        width: `${Math.max(0, Math.min(100, (city.population / populationNeeded(city)) * 100))}%`,
                      }}
                    />
                  </div>
                </div>
                {city.owner === 0 ? (
                  <>
                    {city.pendingRewards > 0 && (
                      <div className="upgrade-rewards">
                        <h3>
                          <ArrowUp size={16} />
                          选择升级奖励
                        </h3>
                        {getUpgradeRewards(city).map((reward) => (
                          <button
                            key={reward}
                            disabled={
                              !enabled({
                                type: "CITY_REWARD",
                                cityId: city.id,
                                reward,
                              })
                            }
                            onClick={() =>
                              onCommand({
                                type: "CITY_REWARD",
                                cityId: city.id,
                                reward,
                              })
                            }
                          >
                            <strong>{rewards[reward][0]}</strong>
                            <span>{rewards[reward][1]}</span>
                            <ChevronRight size={14} />
                          </button>
                        ))}
                      </div>
                    )}
                    <h3 className="section-label">
                      训练单位{city.connected && <span>已连接首都</span>}
                    </h3>
                    <div className="training-grid">
                      {Object.values(UNITS)
                        .filter((d) => d.trainable)
                        .map((def) => {
                          const Icon = unitIcons[def.id],
                            action: Action = {
                              type: "TRAIN",
                              cityId: city.id,
                              unitType: def.id,
                            },
                            locked =
                              def.tech &&
                              !player.technologies.includes(def.tech);
                          return (
                            <button
                              key={def.id}
                              disabled={!enabled(action)}
                              title={
                                validateAction(game, action) || def.description
                              }
                              onClick={() => onCommand(action)}
                            >
                              <Icon size={22} />
                              <strong>{def.name}</strong>
                              {locked ? (
                                <small>
                                  {
                                    TECHNOLOGIES.find((t) => t.id === def.tech)
                                      ?.name
                                  }
                                </small>
                              ) : (
                                <Cost
                                  value={getTrainingCost(game, 0, def.id)}
                                />
                              )}
                            </button>
                          );
                        })}
                    </div>
                    <h3 className="section-label">资源与建设</h3>
                    <div className="city-developments">
                      {city.territory
                        .flatMap((id) => tileActions(game.tiles[id]))
                        .filter((a) => enabled(a.action))
                        .slice(0, 10)
                        .map(({ action, label, cost }) => (
                          <button
                            key={JSON.stringify(action)}
                            onClick={() => onCommand(action)}
                          >
                            <Sprout size={15} />
                            <span>
                              {label}
                              <small>
                                {"tileId" in action
                                  ? `${game.tiles[action.tileId].x + 1}, ${game.tiles[action.tileId].y + 1}`
                                  : ""}
                              </small>
                            </span>
                            <Cost value={cost} />
                          </button>
                        ))}
                    </div>
                  </>
                ) : (
                  <p className="selection-description">
                    {city.owner === null
                      ? "进入村庄，下一回合可占领。"
                      : "进入敌方城市，下一回合可占领。"}
                  </p>
                )}
              </>
            ) : (
              <>
                <div className="terrain-detail">
                  {tile.terrain === "forest" ? (
                    <Trees size={30} />
                  ) : tile.terrain === "mountain" ? (
                    <Mountain size={30} />
                  ) : ["shallow", "deep"].includes(tile.terrain) ? (
                    <Waves size={30} />
                  ) : (
                    <Sprout size={30} />
                  )}
                  <div>
                    <strong>{terrainNames[tile.terrain]}</strong>
                    <span>
                      {tile.resource && resourceVisible(game, tile)
                        ? resourceNames[tile.resource]
                        : ""}
                      {tile.road ? " · 道路" : ""}
                    </span>
                  </div>
                </div>
                {tile.ruin && <p className="ruin-note">遗迹</p>}
                {tile.lighthouse && <p className="built-note">灯塔</p>}
                {tile.building && (
                  <p className="built-note">
                    <Check size={15} />
                    {BUILDINGS[tile.building].name}
                  </p>
                )}
                {(tile.owner === 0 || tile.resource === "starfish") && (
                  <div className="build-actions">
                    {tileActions(tile).map(({ action, label, cost }) => (
                      <button
                        key={JSON.stringify(action)}
                        disabled={!enabled(action)}
                        title={validateAction(game, action) || label}
                        onClick={() => onCommand(action)}
                      >
                        <Sprout size={18} />
                        <span>
                          <strong>{label}</strong>
                        </span>
                        <Cost value={cost} />
                      </button>
                    ))}
                  </div>
                )}
                {(tile.owner === 0 || tile.owner === null) &&
                  !tile.road &&
                  !["deep", "shallow", "mountain"].includes(tile.terrain) &&
                  actionButton(
                    { type: "ROAD", tileId: tile.id },
                    "道路",
                    Route,
                    3,
                  )}
                {tile.owner === 0 && (
                  <>
                    {tile.terrain === "forest" &&
                      !tile.building &&
                      actionButton(
                        { type: "CLEAR_FOREST", tileId: tile.id },
                        "砍伐森林（+1 星星）",
                        Trees,
                      )}
                    {tile.terrain === "forest" &&
                      !tile.building &&
                      actionButton(
                        { type: "BURN_FOREST", tileId: tile.id },
                        "烧毁森林",
                        Sprout,
                        3,
                      )}
                    {tile.terrain === "plain" &&
                      !tile.building &&
                      actionButton(
                        { type: "GROW_FOREST", tileId: tile.id },
                        "种植森林",
                        Trees,
                        5,
                      )}
                    {tile.building &&
                      actionButton(
                        { type: "DESTROY", tileId: tile.id },
                        "拆除",
                        Trash2,
                      )}
                  </>
                )}
              </>
            )}
            <button className="panel-tech-link" onClick={onTech}>
              <BrainCircuit size={15} />
              科技树
              <ChevronRight size={14} />
            </button>
          </div>
        </>
      )}
    </aside>
  );
}

function CombatConfirm({
  game,
  attacker,
  target,
  onClose,
  onAttack,
}: {
  game: GameState;
  attacker: string;
  target: string;
  onClose: () => void;
  onAttack: () => void;
}) {
  const a = game.units.find((u) => u.id === attacker),
    t = game.units.find((u) => u.id === target);
  if (!a || !t) return null;
  const convert = UNITS[a.type].skills.includes("convert"),
    preview = previewCombat(game, attacker, target);
  return (
    <div className="combat-preview">
      <header>
        <Swords size={19} />
        <strong>{convert ? "转化" : "战斗预估"}</strong>
        <button className="icon-button" onClick={onClose} aria-label="取消攻击">
          <X size={17} />
        </button>
      </header>
      {convert ? (
        <p>将 {UNITS[t.type].name} 转化为己方单位。</p>
      ) : (
        <div className="combat-sides">
          <div>
            <span>{UNITS[a.type].name}</span>
            <strong>
              {a.hp}
              <ArrowRight size={12} />
              <b>{Math.max(0, a.hp - preview.retaliation)}</b>
            </strong>
            <small>
              {preview.retaliation ? `反击 −${preview.retaliation}` : "无反击"}
            </small>
          </div>
          <Swords size={20} />
          <div>
            <span>{UNITS[t.type].name}</span>
            <strong>
              {t.hp}
              <ArrowRight size={12} />
              <b>{Math.max(0, t.hp - preview.damage)}</b>
            </strong>
            <small>
              {preview.damage >= t.hp ? "击败" : `伤害 −${preview.damage}`}
            </small>
          </div>
        </div>
      )}
      <button
        className="danger full"
        disabled={
          convert
            ? !!validateAction(game, {
                type: "CONVERT",
                unitId: a.id,
                targetId: t.id,
              })
            : !preview.canAttack
        }
        onClick={onAttack}
      >
        {convert ? "确认转化" : "确认攻击"}
        <ArrowRight size={16} />
      </button>
    </div>
  );
}

function MiniMap({ game }: { game: GameState }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    const explored = new Set(game.players[0].explored),
      w = 192 / game.options.size;
    ctx.clearRect(0, 0, 192, 192);
    for (const t of game.tiles) {
      ctx.fillStyle = !explored.has(t.id)
        ? "#dadacf"
        : t.cityId
          ? t.owner === null
            ? "#fff"
            : game.players[t.owner].color
          : ["shallow", "deep"].includes(t.terrain)
            ? "#97b8b5"
            : t.terrain === "mountain"
              ? "#919986"
              : "#bac79b";
      ctx.fillRect(t.x * w, t.y * w, Math.ceil(w), Math.ceil(w));
    }
  }, [game]);
  return (
    <canvas
      ref={ref}
      className="minimap minimap-canvas"
      width={192}
      height={192}
      aria-label="小地图"
      onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect(),
          x = Math.min(
            game.options.size - 1,
            Math.floor(
              ((e.clientX - rect.left) / rect.width) * game.options.size,
            ),
          ),
          y = Math.min(
            game.options.size - 1,
            Math.floor(
              ((e.clientY - rect.top) / rect.height) * game.options.size,
            ),
          );
        useGameStore.getState().select(y * game.options.size + x);
      }}
    />
  );
}
export function ScoreChip({ game }: { game: GameState }) {
  return (
    <div className="score-chip">
      <span>分数</span>
      <strong>{getScore(game, 0)}</strong>
    </div>
  );
}
