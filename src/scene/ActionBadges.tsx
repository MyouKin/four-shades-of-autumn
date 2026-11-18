import { useRef } from "react";
import type { RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { ChevronsUp, Flag } from "lucide-react";
import { Matrix4, Vector3 } from "three";
import { validateAction } from "../game/rules/engine";
import type { GameState } from "../game/types";
import { terrainHeight } from "./models";
import "./actionBadges.css";

export type BadgeAction = "upgrade" | "capture";
export type OpenBadge = (
  tileId: number,
  action: BadgeAction,
  unitId?: string,
) => void;

export interface MapBadge {
  action: BadgeAction;
  tileId: number;
  cityName: string;
  unitId?: string;
  position: [number, number, number];
}

export function getMapBadges(game: GameState): MapBadge[] {
  if (
    game.status !== "playing" ||
    game.currentPlayer !== 0 ||
    game.players[0].eliminated
  )
    return [];
  const size = game.options.size;
  const offset = (size - 1) / 2;
  const visible = new Set(game.players[0].visible);
  const garrisons = new Map(
    game.units
      .filter((unit) => unit.owner === 0)
      .map((unit) => [unit.y * size + unit.x, unit]),
  );
  const badges: MapBadge[] = [];
  for (const city of game.cities) {
    const tileId = city.y * size + city.x;
    if (!visible.has(tileId)) continue;
    const floor = terrainHeight(game.tiles[tileId]);
    const x = city.x - offset;
    const z = city.y - offset;
    const unit = garrisons.get(tileId);
    if (city.owner === 0 && city.pendingRewardLevels.length > 0) {
      badges.push({
        action: "upgrade",
        tileId,
        cityName: city.name,
        position: [x - 0.12, floor + 1.05, z - 0.12],
      });
    } else if (
      city.owner !== 0 &&
      unit &&
      !validateAction(game, { type: "CAPTURE", unitId: unit.id })
    ) {
      badges.push({
        action: "capture",
        tileId,
        cityName: city.name,
        unitId: unit.id,
        // A garrison stands forward of the city. Leave its HP number visible below the flag.
        position: [
          x + 0.24,
          floor + (unit.type === "giant" ? 1.48 : 1.18),
          z + 0.24,
        ],
      });
    }
  }
  return badges;
}

export interface MapBadgesProps {
  badges: MapBadge[];
  badgeButtons: RefObject<Map<number, HTMLButtonElement>>;
}

export function MapBadgeButtons({
  badges,
  badgeButtons,
  onOpen,
  reducedMotion,
}: MapBadgesProps & { onOpen: OpenBadge; reducedMotion?: boolean }) {
  return (
    <div
      className="map-action-layer"
      data-reduced-motion={reducedMotion || undefined}
    >
      {badges.map(({ tileId, action, unitId, cityName }) => {
        const upgrade = action === "upgrade";
        const Icon = upgrade ? ChevronsUp : Flag;
        return (
          <button
            key={tileId}
            type="button"
            className="map-action-badge"
            data-action={action}
            aria-label={
              upgrade
                ? `选择${cityName}的升级奖励`
                : `查看占领${cityName}的单位`
            }
            ref={(button) => {
              if (button) badgeButtons.current.set(tileId, button);
              else badgeButtons.current.delete(tileId);
            }}
            onClick={() => onOpen(tileId, action, unitId)}
          >
            <span className="map-action-tag">
              <Icon aria-hidden="true" size={16} strokeWidth={2.5} />
              <span>{upgrade ? "升级" : "占领"}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function projectMapBadge(
  badge: MapBadge,
  renderedIds: Set<number>,
  viewProjection: Matrix4,
  size: { width: number; height: number },
  screen: Vector3,
): boolean {
  if (!renderedIds.has(badge.tileId)) return false;
  screen.fromArray(badge.position).applyMatrix4(viewProjection);
  if (
    Math.abs(screen.x) > 1 ||
    Math.abs(screen.y) > 1 ||
    Math.abs(screen.z) > 1
  )
    return false;
  screen.x = ((screen.x + 1) * size.width) / 2;
  screen.y = ((1 - screen.y) * size.height) / 2;
  return true;
}

// Keep native, keyboard-accessible buttons anchored to their models without a React
// update on every camera frame. The same tile budget as the 3D models applies.
export function MapBadgePositions({
  badges,
  badgeButtons,
  renderedIds,
}: MapBadgesProps & { renderedIds: Set<number> }) {
  const point = useRef(new Vector3());
  const matrix = useRef(new Matrix4());
  const previous = useRef({
    matrix: new Matrix4(),
    width: -1,
    height: -1,
    badges: null as MapBadge[] | null,
    renderedIds: null as Set<number> | null,
  });
  useFrame(({ camera, size }) => {
    if (badges.length === 0) return;
    const view = previous.current;
    camera.updateMatrixWorld();
    matrix.current.multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse,
    );
    if (
      view.badges === badges &&
      view.renderedIds === renderedIds &&
      view.width === size.width &&
      view.height === size.height &&
      view.matrix.equals(matrix.current)
    )
      return;
    view.matrix.copy(matrix.current);
    Object.assign(view, {
      badges,
      renderedIds,
      width: size.width,
      height: size.height,
    });
    for (const badge of badges) {
      const button = badgeButtons.current.get(badge.tileId);
      if (!button) {
        view.badges = null;
        continue;
      }
      const inView = projectMapBadge(
        badge,
        renderedIds,
        matrix.current,
        size,
        point.current,
      );
      button.style.visibility = inView ? "visible" : "hidden";
      if (!inView) continue;
      button.style.left = `${point.current.x.toFixed(1)}px`;
      button.style.top = `${point.current.y.toFixed(1)}px`;
      button.toggleAttribute("data-compact", camera.zoom < 27);
    }
  });
  return null;
}
