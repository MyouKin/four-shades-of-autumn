import {
  Component,
  Suspense,
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { City, GameEvent, GameState, Tile } from "../game/types";
import { getVisibleResource } from "../game";
import { usePresentedUnits, useUnitMotion } from "./unitMotion";
import { easeInOut, getFreshEvents } from "./motion";
import type { PresentedUnit } from "./motion";

import {
  BuildingModel,
  CityModel,
  geometry,
  material,
  Piece,
  Resources,
  RuinModel,
  TerrainDetails,
  terrainHeight,
  UnitModel,
} from "./models";

export interface GameSceneProps {
  game: GameState;
  selectedTile: number | null;
  selectedUnit: string | null;
  reachable: number[];
  attackTargets: string[];
  onTileClick: (id: number) => void;
  resetKey: number;
  reducedMotion?: boolean;
  preview?: boolean;
}

const palettes = {
  plain: ["#94ad8d", "#a0b797", "#8ba787", "#a6ba9a"],
  forest: ["#7e9b7d", "#89a588", "#829e80", "#90aa8b"],
  mountain: ["#b3b4a5", "#c1c0ad", "#abae9f", "#bebfb1"],
  shallow: ["#5b9294", "#639a9a", "#588e91", "#6b9c9c"],
  deep: ["#2e6375", "#376d7e", "#326979", "#3c7380"],
};
const borders: [number, number, number, number, number][] = [
  [-1, 0, -0.49, 0, 0],
  [1, 0, 0.49, 0, 0],
  [0, -1, 0, -0.49, 1],
  [0, 1, 0, 0.49, 1],
];
const civilizationColor = (game: GameState, owner: number | null) =>
  owner === null ? "#a79a7d" : (game.players[owner]?.color ?? "#7a9275");

function CameraRig({
  game,
  resetKey,
  preview,
  selectedTile,
  reducedMotion,
}: Pick<
  GameSceneProps,
  "game" | "resetKey" | "preview" | "selectedTile" | "reducedMotion"
>) {
  const { camera, gl, size } = useThree();
  const controls = useMemo(
    () => new OrbitControls(camera, gl.domElement),
    [camera, gl.domElement],
  );
  const seed = game.options.seed;
  const n = game.options.size;
  const focus =
    game.cities.find((city) => city.capitalOf === 0) ?? game.cities[0];
  const center = useRef(new THREE.Vector3());
  const initialZoom = useRef(50);
  const panTarget = useRef<THREE.Vector3 | null>(null);
  const panStep = useRef(new THREE.Vector3());
  useEffect(() => {
    controls.enableRotate = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.14;
    controls.screenSpacePanning = true;
    controls.panSpeed = 0.85;
    controls.zoomSpeed = 0.85;
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.PAN,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN,
    };
    controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN };
    controls.minZoom = Math.max(5, 180 / n);
    controls.maxZoom = 150;
    const cancelAutomaticPan = () => {
      panTarget.current = null;
    };
    controls.addEventListener("start", cancelAutomaticPan);
    return () => {
      controls.removeEventListener("start", cancelAutomaticPan);
      controls.dispose();
    };
  }, [controls, n]);
  useEffect(() => {
    const offset = (n - 1) / 2;
    const x = preview ? 0 : (focus?.x ?? offset) - offset;
    const z = preview ? 0 : (focus?.y ?? offset) - offset;
    panTarget.current = null;
    center.current.set(x, 0, z);
    controls.target.copy(center.current);
    camera.position.set(x + 13, 17, z + 13);
    camera.lookAt(center.current);
    // Keep useful tiles in view on both wide desktop screens and narrow windows.
    initialZoom.current = preview
      ? Math.min(size.width / (n * 1.5), size.height / (n * 1.13))
      : Math.max(31, Math.min(size.width / 13, size.height / 9));
    camera.zoom = initialZoom.current;
    camera.updateProjectionMatrix();
    controls.update();
    // A new seed or explicit reset reframes the map; actions preserve the user's camera.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed, n, resetKey, preview, camera, controls]);
  useEffect(() => {
    camera.updateProjectionMatrix();
  }, [size, camera]);
  useEffect(() => {
    panTarget.current = null;
    if (preview || selectedTile === null) return;
    const offset = (n - 1) / 2;
    const point = new THREE.Vector3(
      (selectedTile % n) - offset,
      0.15,
      Math.floor(selectedTile / n) - offset,
    );
    camera.updateMatrixWorld();
    const projected = point.clone().project(camera);
    // Frame only a newly selected tile outside the space between HUD controls.
    // Other commands and already visible selections preserve the user's camera.
    if (
      projected.x < -0.7 ||
      projected.x > 0.35 ||
      projected.y < -0.65 ||
      projected.y > 0.6
    ) {
      panTarget.current = point.setY(0);
    }
  }, [selectedTile, preview, n, camera]);
  useFrame((_, delta) => {
    if (panTarget.current) {
      panStep.current.subVectors(panTarget.current, controls.target);
      const arrived = panStep.current.lengthSq() < 0.0001;
      panStep.current.multiplyScalar(
        reducedMotion || arrived ? 1 : 1 - Math.exp(-delta * 10),
      );
      controls.target.add(panStep.current);
      camera.position.add(panStep.current);
      if (reducedMotion || arrived) panTarget.current = null;
    }
    controls.update();
    const bound = n * 0.7;
    const x = THREE.MathUtils.clamp(controls.target.x, -bound, bound);
    const z = THREE.MathUtils.clamp(controls.target.z, -bound, bound);
    const dy =
      THREE.MathUtils.clamp(controls.target.y, -3, 3) - controls.target.y;
    camera.position.x += x - controls.target.x;
    camera.position.y += dy;
    camera.position.z += z - controls.target.z;
    controls.target.set(x, controls.target.y + dy, z);
  });
  return null;
}

function createLabel(
  text: string,
  foreground: string,
  background: string,
  fontSize: number,
  width: number,
  height: number,
) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, width, height);
  if (background !== "transparent") {
    ctx.fillStyle = background;
    ctx.beginPath();
    ctx.roundRect(3, 3, width - 6, height - 6, (height - 6) / 2);
    ctx.fill();
  }
  ctx.font = `600 ${fontSize}px "PingFang SC", "Microsoft YaHei", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = foreground;
  ctx.fillText(text, width / 2, height / 2 + 1);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function Label({
  text,
  color = "#243c42",
  background = "#f5f0e3f2",
  position,
  scale = 1,
  opacity = 1,
}: {
  text: string;
  color?: string;
  background?: string;
  position: [number, number, number];
  scale?: number;
  opacity?: number;
}) {
  const texture = useMemo(
    () =>
      createLabel(
        text,
        color,
        background,
        26,
        Math.max(96, text.length * 29 + 32),
        48,
      ),
    [text, color, background],
  );
  useEffect(() => () => texture.dispose(), [texture]);
  const ratio = texture.image.width / texture.image.height;
  return (
    <sprite
      position={position}
      scale={[0.34 * ratio * scale, 0.34 * scale, 1]}
      renderOrder={10}
    >
      <spriteMaterial
        map={texture}
        transparent
        depthWrite={false}
        depthTest={false}
        opacity={opacity}
      />
    </sprite>
  );
}

function SquareOutline({
  color,
  height,
  opacity = 1,
  thickness = 0.035,
}: {
  color: string;
  height: number;
  opacity?: number;
  thickness?: number;
}) {
  return (
    <group position={[0, height, 0]}>
      {[-0.48, 0.48].map((p) => (
        <group key={p}>
          <Piece
            position={[p, 0, 0]}
            scale={[thickness, 0.025, 0.99]}
            color={color}
            opacity={opacity}
          />
          <Piece
            position={[0, 0, p]}
            scale={[0.99, 0.025, thickness]}
            color={color}
            opacity={opacity}
          />
        </group>
      ))}
    </group>
  );
}

// The complete tile foundation is two draw calls, including per-instance terrain
// colours. Pointer instance IDs retain the same tile command interface as models.
function BoardTiles({
  game,
  explored,
  offset,
  onClick,
  onHover,
}: {
  game: GameState;
  explored: Set<number>;
  offset: number;
  onClick: (id: number) => void;
  onHover: (id: number | null) => void;
}) {
  const baseRef = useRef<THREE.InstancedMesh>(null);
  const topRef = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    if (!baseRef.current || !topRef.current) return;
    const transform = new THREE.Object3D();
    const color = new THREE.Color();
    game.tiles.forEach((tile, i) => {
      const known = explored.has(tile.id);
      const surface = known ? terrainHeight(tile) : 0.015;
      transform.position.set(
        tile.x - offset,
        (surface - 0.33) / 2,
        tile.y - offset,
      );
      transform.scale.set(0.988, surface + 0.33, 0.988);
      transform.updateMatrix();
      baseRef.current!.setMatrixAt(i, transform.matrix);
      baseRef.current!.setColorAt(i, color.set(known ? "#7b938b" : "#879994"));
      transform.position.y = surface - 0.012;
      transform.scale.y = 0.052;
      transform.updateMatrix();
      topRef.current!.setMatrixAt(i, transform.matrix);
      topRef.current!.setColorAt(
        i,
        color.set(
          known
            ? palettes[tile.terrain][(tile.x * 3 + tile.y * 7) % 4]
            : "#9eada8",
        ),
      );
    });
    for (const mesh of [baseRef.current, topRef.current]) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  }, [game.tiles, explored, offset]);
  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.delta < 6 && e.instanceId !== undefined)
      onClick(game.tiles[e.instanceId].id);
  };
  const hover = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (e.instanceId !== undefined) onHover(game.tiles[e.instanceId].id);
    glCursor("pointer");
  };
  return (
    <>
      <instancedMesh
        ref={baseRef}
        args={[geometry.box, material("#ffffff"), game.tiles.length]}
        receiveShadow
        dispose={null}
        onClick={click}
        onPointerMove={hover}
        onPointerOut={() => onHover(null)}
      />
      <instancedMesh
        ref={topRef}
        args={[geometry.box, material("#ffffff"), game.tiles.length]}
        receiveShadow
        dispose={null}
        onClick={click}
        onPointerMove={hover}
        onPointerOut={() => {
          onHover(null);
          glCursor("grab");
        }}
      />
    </>
  );
}

const TileView = memo(function TileView({
  tile,
  game,
  explored,
  visible,
  selected,
  reachable,
  targeted,
  onClick,
  offset,
  simple,
  reducedMotion,
  city,
  hovered,
  onHover,
}: {
  tile: Tile;
  game: GameState;
  explored: boolean;
  visible: boolean;
  selected: boolean;
  reachable: boolean;
  targeted: boolean;
  onClick: (id: number) => void;
  offset: number;
  simple: boolean;
  reducedMotion: boolean;
  city?: City;
  hovered: boolean;
  onHover: (id: number | null) => void;
}) {
  const surface = explored ? terrainHeight(tile) : 0.015;
  const ownerColor = civilizationColor(game, tile.owner);
  const click = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    if (event.delta < 6) onClick(tile.id);
  };
  const enter = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    onHover(tile.id);
    glCursor("pointer");
  };
  const leave = () => {
    onHover(null);
    glCursor("grab");
  };
  return (
    <group
      position={[tile.x - offset, 0, tile.y - offset]}
      onClick={click}
      onPointerOver={enter}
      onPointerOut={leave}
    >
      {explored && (
        <group position={[0, surface + 0.015, 0]}>
          {tile.road && (
            <>
              <Piece
                position={[0, 0.015, 0]}
                scale={[0.14, 0.025, 0.98]}
                color="#dcd4b6"
              />
              <Piece
                position={[0, 0.016, 0]}
                scale={[0.98, 0.025, 0.14]}
                color="#dcd4b6"
              />
            </>
          )}
          <TerrainDetails tile={tile} simple={simple} />
          {!simple && (
            <Resources
              tile={{ ...tile, resource: getVisibleResource(game, tile, 0) }}
            />
          )}
          {tile.ruin && !city && <RuinModel />}
          {tile.lighthouse && (
            <group>
              <Piece
                shape="cylinder"
                position={[0, 0.29, 0]}
                scale={[0.18, 0.56, 0.18]}
                color="#e1dec7"
                shadow
              />
              <Piece
                shape="cylinder"
                position={[0, 0.42, 0]}
                scale={[0.185, 0.08, 0.185]}
                color="#8c9c8e"
              />
              <Piece
                shape="cylinder"
                position={[0, 0.62, 0]}
                scale={[0.15, 0.16, 0.15]}
                color="#e2c880"
              />
              <Piece
                shape="cone"
                position={[0, 0.77, 0]}
                scale={[0.24, 0.17, 0.24]}
                color="#697c72"
              />
            </group>
          )}
          {tile.building && (
            <BuildingModel type={tile.building} color={ownerColor} />
          )}
          {city && (
            <AnimatedCity
              city={city}
              color={civilizationColor(game, city.owner)}
              reducedMotion={reducedMotion}
            />
          )}
          {tile.owner !== null &&
            borders.map(([dx, dy, x, z, horizontal], i) => {
              const nx = tile.x + dx,
                ny = tile.y + dy;
              const neighbor =
                nx >= 0 &&
                ny >= 0 &&
                nx < game.options.size &&
                ny < game.options.size
                  ? game.tiles[ny * game.options.size + nx]
                  : undefined;
              if (neighbor?.owner === tile.owner) return null;
              return (
                <Piece
                  key={i}
                  position={[x, 0.029, z]}
                  scale={
                    horizontal ? [0.98, 0.018, 0.035] : [0.035, 0.018, 0.98]
                  }
                  color={ownerColor}
                  opacity={0.8}
                />
              );
            })}
          {!visible && (
            <Piece
              position={[0, 0.017, 0]}
              scale={[0.989, 0.04, 0.989]}
              color="#515c57"
              opacity={0.25}
            />
          )}
        </group>
      )}
      {reachable && !selected && (
        <>
          <Piece
            position={[0, surface + 0.038, 0]}
            scale={[0.86, 0.012, 0.86]}
            color="#7fa58b"
            opacity={0.24}
          />
          <Piece
            shape="disc"
            position={[0, surface + 0.055, 0]}
            scale={[0.075, 0.018, 0.075]}
            color="#376954"
          />
          <SquareOutline
            color="#487d69"
            height={surface + 0.053}
            opacity={0.95}
            thickness={0.028}
          />
        </>
      )}
      {(selected || targeted || hovered) && (
        <SquareOutline
          color={targeted ? "#b85d4d" : selected ? "#b59a55" : "#f0eedc"}
          height={surface + 0.06}
          thickness={selected ? 0.055 : 0.03}
          opacity={hovered && !selected ? 0.65 : 1}
        />
      )}
    </group>
  );
});

function glCursor(cursor: string) {
  const canvas = document.querySelector(
    ".game-scene canvas",
  ) as HTMLCanvasElement | null;
  if (canvas) canvas.style.cursor = cursor;
}

const CityLabel = memo(function CityLabel({
  city,
  game,
  offset,
  visible,
  onClick,
}: {
  city: City;
  game: GameState;
  offset: number;
  visible: boolean;
  onClick: (id: number) => void;
}) {
  const tile = game.tiles[city.y * game.options.size + city.x];
  const name =
    city.owner === null
      ? "中立聚落"
      : `${city.capitalOf !== null ? "◇ " : ""}${city.name} · ${city.level}`;
  return (
    <group
      onClick={(e) => {
        e.stopPropagation();
        if (e.delta < 6) onClick(tile.id);
      }}
    >
      <Label
        text={name}
        position={[
          city.x - offset,
          terrainHeight(tile) + 0.03,
          city.y - offset + 0.58,
        ]}
        scale={1.05}
        color={city.owner === null ? "#59645c" : "#243c42"}
        opacity={visible ? 1 : 0.8}
      />
    </group>
  );
});

function SelectionHalo({ reducedMotion }: { reducedMotion: boolean }) {
  const ring = useRef<THREE.Mesh>(null);
  const age = useRef(0);
  useFrame((_, delta) => {
    age.current += delta;
    if (ring.current)
      ring.current.scale.setScalar(
        reducedMotion
          ? 1
          : 1 + Math.sin(Math.min(1, age.current / 0.3) * Math.PI) * 0.2,
      );
  });
  return (
    <mesh
      ref={ring}
      geometry={geometry.ring}
      material={material("#b59a55")}
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, 0.035, 0]}
      dispose={null}
    />
  );
}

function AnimatedUnit({
  record,
  game,
  offset,
  selected,
  targeted,
  onClick,
  reducedMotion,
  onFinish,
}: {
  record: PresentedUnit;
  game: GameState;
  offset: number;
  selected: boolean;
  targeted: boolean;
  onClick: (id: number) => void;
  reducedMotion: boolean;
  onFinish: (id: string, serial: number) => void;
}) {
  const { unit, cue } = record;
  const { root, model, initial } = useUnitMotion(
    record,
    game,
    offset,
    reducedMotion,
    onFinish,
  );
  const tile = game.tiles[unit.y * game.options.size + unit.x];
  const color = civilizationColor(game, unit.owner);
  return (
    <group
      ref={root}
      position={initial}
      onClick={(event) => {
        event.stopPropagation();
        if (event.delta < 6) onClick(tile.id);
      }}
    >
      {selected && !cue.dying && (
        <SelectionHalo reducedMotion={reducedMotion} />
      )}
      {targeted && !cue.dying && (
        <mesh
          geometry={geometry.ring}
          material={material("#c15f4c")}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0.035, 0]}
          dispose={null}
        />
      )}
      <group ref={model}>
        <UnitModel
          type={unit.type}
          color={color}
          exhausted={unit.moved && unit.attacked}
        />
      </group>
      {!cue.dying && (
        <Label
          text={`${unit.hp}`}
          color={unit.hp <= unit.maxHp * 0.4 ? "#914c3e" : "#243c42"}
          background="#f5f0e3f2"
          position={[0, unit.type === "giant" ? 1.14 : 0.84, 0]}
          scale={0.7}
        />
      )}
      {!cue.dying && unit.owner === 0 && !unit.moved && !unit.attacked && (
        <Piece
          shape="sphere"
          position={[0.24, 0.06, 0.12]}
          scale={[0.035, 0.035, 0.035]}
          color="#fff4c6"
        />
      )}
    </group>
  );
}

function AnimatedCity({
  city,
  color,
  reducedMotion,
}: {
  city: City;
  color: string;
  reducedMotion: boolean;
}) {
  const group = useRef<THREE.Group>(null);
  const previous = useRef({ level: city.level, owner: city.owner });
  const progress = useRef(1);
  useLayoutEffect(() => {
    if (
      previous.current.level !== city.level ||
      previous.current.owner !== city.owner
    )
      progress.current = 0;
    previous.current = { level: city.level, owner: city.owner };
  }, [city.level, city.owner]);
  useFrame((_, delta) => {
    progress.current = Math.min(1, progress.current + delta / 0.42);
    if (!group.current) return;
    const pulse = reducedMotion ? 0 : Math.sin(progress.current * Math.PI);
    group.current.scale.set(
      1 + pulse * 0.045,
      1 + pulse * 0.14,
      1 + pulse * 0.045,
    );
    group.current.position.y = pulse * 0.025;
  });
  return (
    <group ref={group}>
      <CityModel city={city} color={color} />
    </group>
  );
}

function WaterRipples({
  tiles,
  offset,
  explored,
  reducedMotion,
}: {
  tiles: Tile[];
  offset: number;
  explored: Set<number>;
  reducedMotion: boolean;
}) {
  const group = useRef<THREE.Group>(null);
  const waters = tiles.filter(
    (tile) =>
      explored.has(tile.id) &&
      (tile.terrain === "shallow" || tile.terrain === "deep") &&
      tile.id % 3 === 0,
  );
  useFrame(({ clock }) => {
    if (!group.current || reducedMotion) return;
    group.current.children.forEach((child, i) => {
      child.position.y = Math.sin(clock.elapsedTime * 0.8 + i * 0.7) * 0.012;
    });
  });
  return (
    <group ref={group}>
      {waters.map((tile) => (
        <group key={tile.id}>
          <Piece
            position={[
              tile.x - offset + 0.07,
              terrainHeight(tile) + 0.05,
              tile.y - offset + 0.22,
            ]}
            scale={[0.26, 0.008, 0.018]}
            color="#a2c6c2"
            opacity={0.5}
          />
          <Piece
            position={[
              tile.x - offset - 0.09,
              terrainHeight(tile) + 0.05,
              tile.y - offset - 0.16,
            ]}
            scale={[0.13, 0.008, 0.012]}
            color="#b7d0c7"
            opacity={0.4}
          />
        </group>
      ))}
    </group>
  );
}

type SceneEffect = GameEvent & {
  feedback?: "build" | "harvest" | "road" | "terrain";
};

function EventEffect({
  event,
  offset,
  height,
  onDone,
  reducedMotion,
}: {
  event: SceneEffect;
  offset: number;
  height: number;
  onDone: () => void;
  reducedMotion: boolean;
}) {
  const label = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);
  const start = useRef<number | null>(null);
  const done = useRef(false);
  const at = event.at!;
  const accent =
    event.type === "attack"
      ? "#914c3e"
      : event.type === "capture" || event.type === "upgrade"
        ? "#b59a55"
        : "#4d7162";
  const ringMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: accent,
        transparent: true,
        opacity: 0.65,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    [accent],
  );
  useEffect(() => () => ringMaterial.dispose(), [ringMaterial]);
  const duration = reducedMotion ? 0.65 : event.feedback ? 0.85 : 1.05;
  useFrame(({ clock }) => {
    if (start.current === null) start.current = clock.elapsedTime;
    const elapsed = clock.elapsedTime - start.current;
    const progress = Math.min(1, elapsed / duration);
    if (label.current) {
      label.current.position.y = reducedMotion
        ? 0.82
        : 0.65 + easeInOut(progress) * 0.5;
      label.current.scale.setScalar(
        reducedMotion
          ? 1
          : Math.min(1, elapsed * 10) * Math.min(1, (duration - elapsed) * 6),
      );
    }
    if (ring.current)
      ring.current.scale.setScalar(
        reducedMotion ? 1 : 0.8 + easeInOut(progress) * 1.4,
      );
    ringMaterial.opacity = (1 - progress) * (reducedMotion ? 0.4 : 0.7);
    if (progress === 1 && !done.current) {
      done.current = true;
      onDone();
    }
  });
  const text =
    event.type === "attack"
      ? `−${event.damage ?? ""}`
      : event.type === "upgrade"
        ? "城市升级 ↑"
        : event.type === "capture"
          ? "已占领"
          : event.feedback === "build"
            ? "建成"
            : event.feedback === "harvest"
              ? "已采集"
              : event.feedback === "road"
                ? "道路连通"
                : "地形改变";
  return (
    <group position={[at.x - offset, height + 0.04, at.y - offset]}>
      <mesh
        ref={ring}
        geometry={geometry.ring}
        material={ringMaterial}
        rotation={[-Math.PI / 2, 0, 0]}
        dispose={null}
      />
      <group ref={label} position={[0, 0.8, 0]}>
        <Label
          text={text}
          position={[0, 0, 0]}
          color={accent}
          background="#f5f0e3f2"
          scale={event.type === "attack" ? 1.2 : 1.05}
        />
      </group>
    </group>
  );
}

function FogReveal({
  game,
  explored,
  offset,
  reducedMotion,
}: {
  game: GameState;
  explored: Set<number>;
  offset: number;
  reducedMotion: boolean;
}) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const previous = useRef(explored);
  const opacity = useRef(0);
  const fogMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#9eada8",
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    [],
  );
  useEffect(() => () => fogMaterial.dispose(), [fogMaterial]);
  useLayoutEffect(() => {
    const newly = [...explored]
      .filter((id) => !previous.current.has(id))
      .slice(0, 256);
    previous.current = explored;
    if (!mesh.current || !newly.length || reducedMotion) return;
    const transform = new THREE.Object3D();
    newly.forEach((id, i) => {
      const tile = game.tiles[id];
      transform.position.set(tile.x - offset, 0.16, tile.y - offset);
      transform.scale.set(0.99, 0.3, 0.99);
      transform.updateMatrix();
      mesh.current!.setMatrixAt(i, transform.matrix);
    });
    mesh.current.count = newly.length;
    mesh.current.instanceMatrix.needsUpdate = true;
    mesh.current.computeBoundingSphere();
    opacity.current = 1;
    mesh.current.visible = true;
  }, [explored, game.tiles, offset, reducedMotion]);
  useFrame((_, delta) => {
    if (opacity.current <= 0 || !mesh.current) return;
    opacity.current = Math.max(0, opacity.current - delta * 2.5);
    fogMaterial.opacity = opacity.current;
    mesh.current.visible = opacity.current > 0;
  });
  return (
    <instancedMesh
      ref={mesh}
      args={[geometry.box, fogMaterial, 256]}
      visible={false}
      dispose={null}
    />
  );
}

function Effects({
  game,
  offset,
  visible,
  reducedMotion,
}: {
  game: GameState;
  offset: number;
  visible: Set<number>;
  reducedMotion: boolean;
}) {
  const previous = useRef(game);
  const [active, setActive] = useState<SceneEffect[]>([]);
  const visualId = useRef(-1);
  useEffect(() => {
    const before = previous.current;
    previous.current = game;
    if (before === game) return;
    if (
      before.options.seed !== game.options.seed ||
      before.options.size !== game.options.size ||
      game.round < before.round
    ) {
      setActive([]);
      return;
    }
    const fresh: SceneEffect[] = getFreshEvents(before, game).filter(
      (event) =>
        event.at &&
        visible.has(event.at.y * game.options.size + event.at.x) &&
        ["attack", "upgrade", "capture"].includes(event.type),
    );
    for (const tile of game.tiles) {
      if (!visible.has(tile.id)) continue;
      const old = before.tiles[tile.id];
      const feedback =
        old.building !== tile.building && tile.building
          ? "build"
          : !old.road && tile.road
            ? "road"
            : old.terrain !== tile.terrain
              ? "terrain"
              : old.resource && !tile.resource && !tile.building
                ? "harvest"
                : undefined;
      if (feedback)
        fresh.push({
          id: visualId.current--,
          type: "info",
          message: "",
          player: tile.owner ?? 0,
          at: { x: tile.x, y: tile.y },
          feedback,
        });
    }
    if (fresh.length) setActive((old) => [...old, ...fresh].slice(-12));
  }, [game, visible]);
  return (
    <>
      {active.map((event) => (
        <EventEffect
          key={event.id}
          event={event}
          offset={offset}
          height={terrainHeight(
            game.tiles[event.at!.y * game.options.size + event.at!.x],
          )}
          reducedMotion={reducedMotion}
          onDone={() =>
            setActive((old) => old.filter((e) => e.id !== event.id))
          }
        />
      ))}
    </>
  );
}

function World({
  game,
  selectedTile,
  selectedUnit,
  reachable,
  attackTargets,
  onTileClick,
  resetKey,
  reducedMotion = false,
  preview = false,
}: GameSceneProps) {
  const [hoveredTile, setHoveredTile] = useState<number | null>(null);
  const offset = (game.options.size - 1) / 2;
  const explored = useMemo(
    () =>
      new Set(preview ? game.tiles.map((t) => t.id) : game.players[0].explored),
    [game.tiles, game.players, preview],
  );
  const visible = useMemo(
    () =>
      new Set(preview ? game.tiles.map((t) => t.id) : game.players[0].visible),
    [game.tiles, game.players, preview],
  );
  const movable = useMemo(() => new Set(reachable), [reachable]);
  const targets = useMemo(() => new Set(attackTargets), [attackTargets]);
  const targetTiles = new Set(
    game.units
      .filter((u) => targets.has(u.id))
      .map((u) => u.y * game.options.size + u.x),
  );
  const cityById = useMemo(
    () => new Map(game.cities.map((city) => [city.id, city])),
    [game.cities],
  );
  const [view, setView] = useState<{ ids: number[]; simple: boolean }>({
    ids: [...explored].slice(0, 420),
    simple: false,
  });
  const scan = useRef({ time: -1, key: "", dirty: true });
  const scratch = useRef(new THREE.Vector3());
  useEffect(() => {
    scan.current.dirty = true;
  }, [game.tiles, explored]);
  useFrame(({ camera, clock, size }) => {
    if (clock.elapsedTime - scan.current.time < 0.12) return;
    scan.current.time = clock.elapsedTime;
    const key = `${camera.position.x.toFixed(2)}:${camera.position.y.toFixed(2)}:${camera.position.z.toFixed(2)}:${camera.zoom.toFixed(2)}:${size.width}:${size.height}`;
    if (key === scan.current.key && !scan.current.dirty) return;
    scan.current.key = key;
    scan.current.dirty = false;
    const candidates: { id: number; rank: number }[] = [];
    for (const id of explored) {
      const tile = game.tiles[id];
      if (!tile) continue;
      scratch.current
        .set(tile.x - offset, 0.25, tile.y - offset)
        .project(camera);
      const { x, y, z } = scratch.current;
      if (x > -1.18 && x < 1.18 && y > -1.2 && y < 1.2 && z > -1 && z < 1)
        candidates.push({
          id,
          rank: x * x + y * y - (tile.cityId?.length ? 0.3 : 0),
        });
    }
    const simple = camera.zoom < 28 || candidates.length > 420;
    const ids = candidates
      .sort((a, b) => a.rank - b.rank)
      .slice(0, simple ? 650 : 420)
      .map((t) => t.id);
    setView((old) =>
      old.simple === simple &&
      old.ids.length === ids.length &&
      old.ids.every((id, i) => id === ids[i])
        ? old
        : { ids, simple },
    );
  });
  const renderedIds = useMemo(
    () =>
      new Set([
        ...view.ids,
        ...reachable,
        ...targetTiles,
        ...(selectedTile === null ? [] : [selectedTile]),
        ...(hoveredTile === null ? [] : [hoveredTile]),
      ]),
    [view.ids, reachable, targetTiles, selectedTile, hoveredTile],
  );
  const displayTiles = useMemo(
    () =>
      [...renderedIds]
        .map((id) => game.tiles[id])
        .filter((t): t is Tile => !!t),
    [renderedIds, game.tiles],
  );
  // Stable unit keys are intentionally independent of the decoration viewport.
  // Three.js culls offscreen geometry; moving units no longer remount at endpoints.
  const { presented, finish } = usePresentedUnits(game, preview);
  const visibleUnits = presented.filter((record) => {
    const at = (point: { x: number; y: number }) =>
      renderedIds.has(point.y * game.options.size + point.x);
    if (at(record.unit)) return true;
    return (
      performance.now() - record.cue.issuedAt < 800 &&
      ((record.cue.from && at(record.cue.from)) || record.cue.path?.some(at))
    );
  });
  return (
    <>
      <CameraRig
        game={game}
        resetKey={resetKey}
        preview={preview}
        selectedTile={selectedTile}
        reducedMotion={reducedMotion}
      />
      <ambientLight intensity={0.65} color="#f5f0e3" />
      <hemisphereLight args={["#dbe6df", "#677c72", 0.9]} />
      <directionalLight
        position={[-7, 15, 8]}
        intensity={1.8}
        color="#fff4dd"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-16}
        shadow-camera-right={16}
        shadow-camera-top={16}
        shadow-camera-bottom={-16}
        shadow-camera-near={0.1}
        shadow-camera-far={60}
        shadow-bias={-0.0003}
        shadow-normalBias={0.03}
      />
      <directionalLight
        position={[8, 6, -10]}
        intensity={0.3}
        color="#d4e2df"
      />
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.36, 0]}
        receiveShadow
      >
        <planeGeometry args={[100, 100]} />
        {preview ? (
          <shadowMaterial transparent opacity={0.12} />
        ) : (
          <meshStandardMaterial color="#d5dcd6" roughness={1} />
        )}
      </mesh>
      <group>
        <BoardTiles
          game={game}
          explored={explored}
          offset={offset}
          onClick={onTileClick}
          onHover={setHoveredTile}
        />
        {displayTiles.map((tile) => (
          <TileView
            key={tile.id}
            tile={tile}
            game={game}
            explored={explored.has(tile.id)}
            visible={visible.has(tile.id)}
            selected={selectedTile === tile.id}
            reachable={movable.has(tile.id)}
            targeted={targetTiles.has(tile.id)}
            onClick={onTileClick}
            offset={offset}
            simple={view.simple}
            reducedMotion={reducedMotion}
            city={tile.cityId ? cityById.get(tile.cityId) : undefined}
            hovered={hoveredTile === tile.id}
            onHover={setHoveredTile}
          />
        ))}
        <WaterRipples
          tiles={view.simple ? [] : displayTiles}
          offset={offset}
          explored={explored}
          reducedMotion={reducedMotion}
        />
        {visibleUnits.map((record) => (
          <AnimatedUnit
            key={record.unit.id}
            record={record}
            game={game}
            offset={offset}
            selected={selectedUnit === record.unit.id}
            targeted={targets.has(record.unit.id)}
            onFinish={finish}
            onClick={onTileClick}
            reducedMotion={reducedMotion}
          />
        ))}
        {!preview &&
          game.cities
            .filter(
              (city) =>
                explored.has(city.y * game.options.size + city.x) &&
                renderedIds.has(city.y * game.options.size + city.x),
            )
            .map((city) => (
              <CityLabel
                key={city.id}
                city={city}
                game={game}
                offset={offset}
                visible={visible.has(city.y * game.options.size + city.x)}
                onClick={onTileClick}
              />
            ))}
        {!preview && (
          <FogReveal
            game={game}
            explored={explored}
            offset={offset}
            reducedMotion={reducedMotion}
          />
        )}
        {!preview && (
          <Effects
            game={game}
            offset={offset}
            visible={visible}
            reducedMotion={reducedMotion}
          />
        )}
      </group>
    </>
  );
}

class SceneBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <div className="scene-error" role="alert">
          三维场景暂时无法显示，请启用浏览器硬件加速后刷新。存档仍保留在本机。
        </div>
      );
    return this.props.children;
  }
}

export default function GameScene(props: GameSceneProps) {
  return (
    <div
      className={`game-scene${props.preview ? " game-scene-preview" : ""}`}
      style={{ width: "100%", height: "100%", touchAction: "none" }}
      aria-label={
        props.preview ? "文明地图" : "三维战略地图，拖动平移，滚轮缩放"
      }
    >
      <SceneBoundary>
        <Suspense fallback={<div className="scene-loading">加载地图…</div>}>
          <Canvas
            orthographic
            shadows
            dpr={[1, 1.6]}
            camera={{ position: [13, 17, 13], zoom: 60, near: 0.1, far: 240 }}
            gl={{
              antialias: true,
              alpha: true,
              powerPreference: "high-performance",
            }}
            onCreated={({ gl }) => {
              gl.shadowMap.type = THREE.PCFSoftShadowMap;
              gl.setClearColor("#d5dcd6", props.preview ? 0 : 1);
            }}
            fallback={
              <div className="scene-error">
                此浏览器未启用 WebGL，请开启硬件加速后刷新。
              </div>
            }
          >
            <World {...props} />
          </Canvas>
        </Suspense>
      </SceneBoundary>
    </div>
  );
}
