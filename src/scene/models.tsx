import { memo } from "react";
import * as THREE from "three";
import type { BuildingId, City, Tile, UnitType } from "../game/types";

// Original geometric assets. Shared GPU resources live for the application lifetime.
export const geometry = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cone: new THREE.ConeGeometry(1, 1, 5),
  pyramid: new THREE.ConeGeometry(1, 1, 4),
  triangle: new THREE.ConeGeometry(1, 1, 3),
  octa: new THREE.IcosahedronGeometry(1, 0),
  cylinder: new THREE.CylinderGeometry(1, 1, 1, 8),
  disc: new THREE.CylinderGeometry(1, 1, 1, 24),
  sphere: new THREE.SphereGeometry(1, 8, 6),
  ring: new THREE.RingGeometry(0.35, 0.39, 32),
  bow: new THREE.TorusGeometry(0.5, 0.06, 4, 12, Math.PI),
};
const materials = new Map<string, THREE.MeshStandardMaterial>();
export function material(color: string, opacity = 1, emissive = false) {
  const key = `${color}:${opacity}:${emissive}`;
  if (!materials.has(key))
    materials.set(
      key,
      new THREE.MeshStandardMaterial({
        color,
        roughness: 0.86,
        metalness: 0.03,
        flatShading: true,
        transparent: opacity < 1,
        opacity,
        depthWrite: opacity === 1,
        emissive: emissive ? color : "#000000",
        emissiveIntensity: emissive ? 0.25 : 0,
      }),
    );
  return materials.get(key)!;
}
type PieceProps = {
  position?: [number, number, number];
  scale?: [number, number, number];
  rotation?: [number, number, number];
  color?: string;
  shape?: keyof typeof geometry;
  opacity?: number;
  shadow?: boolean;
};
export function Piece({
  position,
  scale,
  rotation,
  color = "#eee9d9",
  shape = "box",
  opacity = 1,
  shadow = false,
}: PieceProps) {
  return (
    <mesh
      geometry={geometry[shape]}
      material={material(color, opacity)}
      position={position}
      scale={scale}
      rotation={rotation}
      castShadow={shadow}
      receiveShadow
      dispose={null}
    />
  );
}
export function terrainHeight(tile: Tile) {
  return tile.terrain === "deep"
    ? -0.12
    : tile.terrain === "shallow"
      ? -0.07
      : tile.terrain === "mountain"
        ? 0.09
        : 0.015;
}
const foliage = [
  "#4d7162",
  "#68806a",
  "#426d5e",
  "#7f916d",
  "#6b724b",
  "#577c70",
];
export const Tree = memo(function Tree({
  seed = 0,
  scale = 1,
}: {
  seed?: number;
  scale?: number;
}) {
  return (
    <group scale={scale}>
      <Piece
        position={[0, 0.17, 0]}
        scale={[0.055, 0.34, 0.055]}
        color="#80664d"
      />
      <Piece
        position={[0, 0.43, 0]}
        scale={[0.26, 0.47, 0.24]}
        shape="cone"
        rotation={[0, seed, 0]}
        color={foliage[Math.abs(seed) % 6]}
        shadow
      />
      <Piece
        position={[0, 0.61, 0]}
        scale={[0.18, 0.33, 0.17]}
        shape="cone"
        rotation={[0, seed, 0]}
        color={foliage[(Math.abs(seed) + 1) % 6]}
        shadow
      />
    </group>
  );
});
export const TerrainDetails = memo(function TerrainDetails({
  tile,
  simple = false,
}: {
  tile: Tile;
  simple?: boolean;
}) {
  if (tile.cityId || tile.building) return null;
  const variant = (tile.x * 7 + tile.y * 13) % 6;
  if (tile.terrain === "forest")
    return simple ? (
      <Piece
        position={[0, 0.27, 0]}
        scale={[0.29, 0.52, 0.29]}
        shape="cone"
        color={foliage[variant]}
      />
    ) : (
      <group>
        <group position={[-0.2, 0, -0.17]}>
          <Tree seed={variant} scale={0.85} />
        </group>
        <group position={[0.2, 0, 0.08]}>
          <Tree seed={variant + 1} scale={1} />
        </group>
      </group>
    );
  if (tile.terrain === "mountain")
    return (
      <group>
        <Piece
          position={[-0.06, 0.3, 0]}
          scale={[0.46, 0.8, 0.43]}
          shape="pyramid"
          rotation={[0, 0.2, 0]}
          color="#8e9a94"
          shadow
        />
        {!simple && (
          <>
            <Piece
              position={[0.24, 0.16, 0.16]}
              scale={[0.25, 0.46, 0.28]}
              shape="pyramid"
              color="#b7bcb0"
              shadow
            />
            <Piece
              position={[-0.06, 0.58, 0]}
              scale={[0.15, 0.25, 0.14]}
              shape="pyramid"
              rotation={[0, 0.2, 0]}
              color="#e6e5d8"
            />
          </>
        )}
      </group>
    );
  return null;
});
export const Resources = memo(function Resources({ tile }: { tile: Tile }) {
  if (tile.cityId || tile.building || !tile.resource) return null;
  if (tile.resource === "crop")
    return (
      <group position={[0, 0.03, 0]}>
        <Piece scale={[0.48, 0.025, 0.42]} color="#b99b62" />
        {[-1, 0, 1].map((x) => (
          <group key={x} position={[x * 0.14, 0.1, 0]}>
            <Piece scale={[0.025, 0.2, 0.025]} color="#81764d" />
            <Piece
              scale={[0.07, 0.12, 0.07]}
              shape="octa"
              position={[0, 0.12, 0]}
              color="#d6c17a"
            />
          </group>
        ))}
      </group>
    );
  if (tile.resource === "fruit")
    return (
      <group>
        <Piece
          shape="octa"
          position={[0, 0.14, 0]}
          scale={[0.24, 0.16, 0.23]}
          color="#68815d"
        />
        {[-1, 0, 1].map((x) => (
          <Piece
            key={x}
            shape="sphere"
            position={[x * 0.13, 0.25, x === 0 ? 0.1 : 0]}
            scale={[0.06, 0.06, 0.06]}
            color="#a45a43"
          />
        ))}
      </group>
    );
  if (tile.resource === "animal")
    return (
      <group position={[0.12, 0.03, 0.2]}>
        <Piece
          position={[0, 0.17, 0]}
          scale={[0.24, 0.14, 0.12]}
          color="#b6956b"
        />
        <Piece
          shape="octa"
          position={[-0.13, 0.27, 0]}
          scale={[0.075, 0.12, 0.065]}
          color="#bd9b72"
        />
        {[-0.08, 0.08].flatMap((x) =>
          [-0.04, 0.04].map((z) => (
            <Piece
              key={`${x}:${z}`}
              position={[x, 0.07, z]}
              scale={[0.025, 0.16, 0.025]}
              color="#776548"
            />
          )),
        )}
        <Piece
          position={[-0.17, 0.36, -0.025]}
          scale={[0.025, 0.13, 0.025]}
          color="#6e6147"
          rotation={[0, 0, 0.3]}
        />
      </group>
    );
  if (tile.resource === "ore")
    return (
      <group position={[0.27, 0.1, 0.22]}>
        <Piece shape="octa" scale={[0.13, 0.18, 0.12]} color="#c2a974" />
        <Piece
          shape="octa"
          scale={[0.1, 0.13, 0.12]}
          position={[-0.15, -0.02, 0.06]}
          color="#dec78c"
        />
      </group>
    );
  if (tile.resource === "fish")
    return (
      <group position={[0, 0.06, 0]} rotation={[0, 0.3, 0]}>
        <Piece
          shape="octa"
          scale={[0.18, 0.035, 0.07]}
          color="#d8e1d9"
          position={[-0.08, 0, -0.1]}
        />
        <Piece
          shape="triangle"
          scale={[0.065, 0.09, 0.04]}
          rotation={[0, 0, Math.PI / 2]}
          color="#c6d9cb"
          position={[-0.26, 0, -0.1]}
        />
        <Piece
          shape="octa"
          scale={[0.13, 0.025, 0.05]}
          color="#d2ddcf"
          position={[0.13, 0, 0.1]}
        />
      </group>
    );
  return (
    <group position={[0, 0.06, 0]}>
      {Array.from({ length: 5 }, (_, i) => (
        <Piece
          key={i}
          position={[
            Math.sin(i * Math.PI * 0.4) * 0.07,
            0,
            Math.cos(i * Math.PI * 0.4) * 0.07,
          ]}
          scale={[0.065, 0.04, 0.27]}
          rotation={[0, i * Math.PI * 0.4, 0]}
          color="#d6c17a"
        />
      ))}
    </group>
  );
});
export const CityModel = memo(function CityModel({
  city,
  color,
}: {
  city: City;
  color: string;
}) {
  const neutral = city.owner === null;
  const height = neutral ? 0.28 : 0.35 + Math.min(city.level, 5) * 0.06;
  return (
    <group>
      <Piece
        position={[0, 0.035, 0]}
        scale={[0.76, 0.07, 0.76]}
        color="#c6c4af"
      />
      <Piece
        position={[-0.14, height / 2 + 0.07, -0.12]}
        scale={[0.28, height, 0.28]}
        color="#e1dfd0"
        shadow
      />
      <Piece
        shape="pyramid"
        position={[-0.14, height + 0.16, -0.12]}
        scale={[0.25, 0.2, 0.25]}
        rotation={[0, Math.PI / 4, 0]}
        color={color}
        shadow
      />
      <Piece
        position={[0.21, 0.2, 0.1]}
        scale={[0.24, 0.26, 0.23]}
        color="#d8d0be"
        shadow
      />
      <Piece
        shape="pyramid"
        position={[0.21, 0.39, 0.1]}
        scale={[0.22, 0.16, 0.21]}
        rotation={[0, Math.PI / 4, 0]}
        color={color}
      />
      <Piece
        position={[-0.14, 0.16, 0.24]}
        scale={[0.28, 0.17, 0.17]}
        color="#e0d8c6"
      />
      {!neutral && (
        <>
          <Piece
            position={[0.3, 0.49, -0.24]}
            scale={[0.018, 0.8, 0.018]}
            color="#78664a"
          />
          <Piece
            position={[0.38, 0.83, -0.24]}
            scale={[0.18, 0.12, 0.018]}
            color={color}
          />
        </>
      )}
      {city.capitalOf !== null && !neutral && (
        <Piece
          shape="octa"
          position={[-0.14, height + 0.3, -0.12]}
          scale={[0.065, 0.08, 0.065]}
          color="#d4b267"
        />
      )}
      {city.defenseBonus > 0 &&
        [-0.4, 0.4].map((x) => (
          <Piece
            key={x}
            position={[x, 0.15, 0]}
            scale={[0.06, 0.24, 0.85]}
            color="#909886"
          />
        ))}
    </group>
  );
});
export const BuildingModel = memo(function BuildingModel({
  type,
  color,
}: {
  type: BuildingId;
  color: string;
}) {
  if (type === "farm")
    return (
      <group>
        <Piece
          position={[0, 0.035, 0]}
          scale={[0.74, 0.06, 0.7]}
          color="#a89055"
        />
        {[-2, -1, 0, 1, 2].map((x) => (
          <Piece
            key={x}
            position={[x * 0.13, 0.1, 0]}
            scale={[0.055, 0.1, 0.63]}
            color="#d8b868"
          />
        ))}
      </group>
    );
  if (type === "bridge")
    return (
      <group>
        <Piece position={[0, 0.14, 0]} scale={[0.3, 0.09, 1]} color="#ab9468" />
        {[-0.19, 0.19].map((x) => (
          <Piece
            key={x}
            position={[x, 0.25, 0]}
            scale={[0.025, 0.07, 1]}
            color="#c1aa7c"
          />
        ))}
      </group>
    );
  if (type === "port")
    return (
      <group>
        <Piece
          position={[0, 0.09, 0]}
          scale={[0.8, 0.1, 0.23]}
          color="#b09c77"
        />
        <Piece
          position={[-0.27, 0.07, 0.16]}
          scale={[0.21, 0.1, 0.5]}
          color="#b09c77"
        />
        <Piece
          position={[0.16, 0.23, -0.09]}
          scale={[0.27, 0.26, 0.27]}
          color="#dedbc9"
          shadow
        />
        <Piece
          shape="pyramid"
          position={[0.16, 0.42, -0.09]}
          scale={[0.25, 0.16, 0.25]}
          color={color}
        />
      </group>
    );
  if (type === "windmill")
    return (
      <group>
        <Piece
          shape="cone"
          position={[0, 0.27, 0]}
          scale={[0.23, 0.55, 0.23]}
          color="#e2dbc5"
          shadow
        />
        <Piece
          position={[0, 0.43, -0.2]}
          scale={[0.06, 0.65, 0.025]}
          rotation={[0, 0, 0.6]}
          color="#c0a76b"
        />
        <Piece
          position={[0, 0.43, -0.2]}
          scale={[0.65, 0.06, 0.025]}
          rotation={[0, 0, 0.6]}
          color="#c0a76b"
        />
      </group>
    );
  if (type === "mine")
    return (
      <group>
        <Piece
          shape="pyramid"
          position={[0, 0.2, 0]}
          scale={[0.39, 0.5, 0.38]}
          color="#8a9184"
        />
        <Piece
          position={[0, 0.15, 0.26]}
          scale={[0.25, 0.25, 0.13]}
          color="#c2ae82"
        />
        <Piece
          position={[0, 0.13, 0.335]}
          scale={[0.13, 0.2, 0.02]}
          color="#58625a"
        />
      </group>
    );
  if (
    type.toLowerCase().includes("temple") ||
    [
      "altarOfPeace",
      "emperorTomb",
      "eyeOfGod",
      "gateOfPower",
      "grandBazaar",
      "parkOfFortune",
      "towerOfWisdom",
    ].includes(type)
  )
    return (
      <group>
        <Piece
          position={[0, 0.06, 0]}
          scale={[0.62, 0.1, 0.58]}
          color="#d4ceb8"
        />
        {[-0.2, 0.2].map((x) => (
          <Piece
            key={x}
            position={[x, 0.28, 0]}
            scale={[0.08, 0.42, 0.3]}
            color="#e3dfd0"
            shadow
          />
        ))}
        <Piece
          shape="pyramid"
          position={[0, 0.55, 0]}
          scale={[0.48, 0.18, 0.4]}
          rotation={[0, Math.PI / 4, 0]}
          color={color}
        />
        <Piece
          shape="octa"
          position={[0, 0.3, 0]}
          scale={[0.09, 0.19, 0.09]}
          color="#cfb16e"
        />
      </group>
    );
  return (
    <group>
      <Piece
        position={[0, 0.2, 0]}
        scale={[0.6, 0.34, 0.46]}
        color="#ddd6bd"
        shadow
      />
      <Piece
        shape="pyramid"
        position={[0, 0.45, 0]}
        scale={[0.48, 0.22, 0.36]}
        rotation={[0, Math.PI / 4, 0]}
        color={color}
      />
      <Piece
        position={[0, 0.15, 0.24]}
        scale={[0.12, 0.22, 0.02]}
        color="#8f805b"
      />
      {type === "forge" && (
        <Piece
          position={[-0.2, 0.45, -0.1]}
          scale={[0.1, 0.65, 0.1]}
          color="#8e9283"
        />
      )}
      {(type === "sawmill" || type === "lumberHut") && (
        <Piece
          shape="cylinder"
          rotation={[0, 0, Math.PI / 2]}
          position={[0.1, 0.1, 0.33]}
          scale={[0.08, 0.4, 0.08]}
          color="#8e7450"
        />
      )}
      {type === "market" && (
        <Piece
          position={[0, 0.26, 0.35]}
          scale={[0.55, 0.035, 0.25]}
          color="#e3c084"
        />
      )}
    </group>
  );
});
export const RuinModel = memo(function RuinModel() {
  return (
    <group>
      <Piece position={[0, 0.03, 0]} scale={[0.5, 0.06, 0.5]} color="#aeaa92" />
      <Piece
        position={[-0.14, 0.2, 0.02]}
        scale={[0.13, 0.34, 0.15]}
        color="#c8c5b1"
        rotation={[0, 0, 0.1]}
      />
      <Piece
        position={[0.16, 0.14, -0.1]}
        scale={[0.14, 0.22, 0.15]}
        color="#afad98"
      />
      <Piece
        shape="octa"
        position={[0, 0.3, 0]}
        scale={[0.07, 0.12, 0.07]}
        color="#dfc888"
      />
    </group>
  );
});
const NAVAL = new Set<UnitType>([
  "raft",
  "scout",
  "rammer",
  "bomber",
  "juggernaut",
  "dinghy",
  "pirate",
]);
function Person({ color, type }: { color: string; type: UnitType }) {
  const dark = "#535d50";
  return (
    <group>
      <Piece
        position={[-0.065, 0.12, 0]}
        scale={[0.075, 0.2, 0.1]}
        color={dark}
      />
      <Piece
        position={[0.065, 0.12, 0]}
        scale={[0.075, 0.2, 0.1]}
        color={dark}
      />
      <Piece
        position={[0, 0.3, 0]}
        scale={[0.23, 0.25, 0.16]}
        color={color}
        shadow
      />
      <Piece
        shape="sphere"
        position={[0, 0.48, 0]}
        scale={[0.105, 0.11, 0.1]}
        color="#d3bd93"
      />
      {type === "cloak" || type === "mindBender" ? (
        <Piece
          shape="cone"
          position={[0, 0.54, 0]}
          scale={[0.14, 0.25, 0.14]}
          color={color}
        />
      ) : (
        <Piece
          shape="sphere"
          position={[0, 0.54, 0]}
          scale={[0.12, 0.065, 0.11]}
          color={color}
        />
      )}
      <Piece
        position={[-0.15, 0.3, 0]}
        scale={[0.07, 0.19, 0.08]}
        rotation={[0, 0, -0.2]}
        color={color}
      />
      <Piece
        position={[0.15, 0.3, 0]}
        scale={[0.07, 0.19, 0.08]}
        color={color}
      />
      {(type === "warrior" ||
        type === "swordsman" ||
        type === "dagger" ||
        type === "knight") && (
        <>
          <Piece
            position={[0.18, 0.39, -0.1]}
            scale={[0.035, type === "dagger" ? 0.17 : 0.34, 0.035]}
            color="#d9e0d7"
          />
          <Piece
            position={[0.18, 0.24, -0.1]}
            scale={[0.12, 0.025, 0.035]}
            color="#857446"
          />
        </>
      )}
      {type === "defender" && (
        <Piece
          shape="disc"
          position={[-0.18, 0.29, -0.09]}
          rotation={[Math.PI / 2, 0, 0]}
          scale={[0.17, 0.035, 0.23]}
          color="#c7cbb7"
        />
      )}
      {type === "archer" && (
        <Piece
          shape="bow"
          position={[0.2, 0.34, -0.06]}
          scale={[0.33, 0.42, 0.33]}
          rotation={[0, Math.PI / 2, 0]}
          color="#9d7945"
        />
      )}
      {type === "mindBender" && (
        <>
          <Piece
            position={[0.18, 0.35, -0.05]}
            scale={[0.025, 0.65, 0.025]}
            color="#947447"
          />
          <Piece
            shape="octa"
            position={[0.18, 0.68, -0.05]}
            scale={[0.075, 0.075, 0.075]}
            color="#d4cc91"
          />
        </>
      )}
    </group>
  );
}
export const UnitModel = memo(function UnitModel({
  type,
  color,
  exhausted = false,
}: {
  type: UnitType;
  color: string;
  exhausted?: boolean;
}) {
  const uniform = exhausted ? "#94a08e" : color;
  if (NAVAL.has(type))
    return (
      <group>
        <Piece
          shape="octa"
          position={[0, 0.13, 0]}
          scale={[0.28, 0.17, type === "juggernaut" ? 0.48 : 0.4]}
          color="#9b8057"
          shadow
        />
        <Piece
          position={[0, 0.21, 0]}
          scale={[0.35, 0.07, 0.5]}
          color={uniform}
        />
        {type !== "raft" && type !== "rammer" && type !== "dinghy" && (
          <>
            <Piece
              position={[0, 0.49, 0.08]}
              scale={[0.025, 0.63, 0.025]}
              color="#7c674c"
            />
            <Piece
              shape="triangle"
              position={[0.02, 0.56, 0.08]}
              scale={[0.2, 0.42, 0.025]}
              rotation={[0, 0, 0.1]}
              color="#eee6c9"
            />
          </>
        )}
        {type === "raft" &&
          [-1, 0, 1].map((x) => (
            <Piece
              key={x}
              shape="cylinder"
              position={[x * 0.13, 0.08, 0]}
              rotation={[Math.PI / 2, 0, 0]}
              scale={[0.07, 0.6, 0.07]}
              color="#ae9365"
            />
          ))}
        {type === "rammer" && (
          <Piece
            shape="pyramid"
            position={[0, 0.19, -0.42]}
            rotation={[Math.PI / 2, 0, 0]}
            scale={[0.12, 0.3, 0.12]}
            color="#d1bc88"
          />
        )}
        {(type === "bomber" || type === "juggernaut") && (
          <Piece
            position={[0, 0.3, -0.18]}
            scale={[0.18, 0.16, 0.3]}
            color="#626e63"
          />
        )}
        {type === "dinghy" && (
          <group position={[0, 0.2, 0]} scale={0.55}>
            <Person color={uniform} type="cloak" />
          </group>
        )}
      </group>
    );
  if (type === "catapult")
    return (
      <group>
        <Piece
          position={[0, 0.15, 0]}
          scale={[0.44, 0.12, 0.45]}
          color="#9c8054"
        />
        {[-0.23, 0.23].flatMap((x) =>
          [-0.17, 0.17].map((z) => (
            <Piece
              key={`${x}:${z}`}
              shape="cylinder"
              position={[x, 0.1, z]}
              rotation={[0, 0, Math.PI / 2]}
              scale={[0.1, 0.055, 0.1]}
              color="#655f4b"
            />
          )),
        )}
        <Piece
          position={[0, 0.32, 0]}
          scale={[0.07, 0.57, 0.07]}
          rotation={[-0.5, 0, 0]}
          color="#b59c69"
        />
        <Piece
          shape="octa"
          position={[0, 0.56, -0.13]}
          scale={[0.13, 0.1, 0.13]}
          color="#a2aaa0"
        />
        <Piece
          position={[0.2, 0.3, 0]}
          scale={[0.025, 0.38, 0.025]}
          color={uniform}
        />
      </group>
    );
  if (type === "rider" || type === "knight")
    return (
      <group>
        <Piece
          position={[0, 0.25, 0]}
          scale={[0.25, 0.2, 0.45]}
          color="#ad8e65"
        />
        <Piece
          shape="octa"
          position={[0, 0.41, -0.25]}
          scale={[0.13, 0.21, 0.11]}
          color="#ad8e65"
        />
        {[-0.1, 0.1].flatMap((x) =>
          [-0.14, 0.14].map((z) => (
            <Piece
              key={`${x}:${z}`}
              position={[x, 0.1, z]}
              scale={[0.045, 0.22, 0.045]}
              color="#77674c"
            />
          )),
        )}
        <group position={[0, 0.26, 0.02]} scale={0.75}>
          <Person
            type={type === "knight" ? "knight" : "warrior"}
            color={uniform}
          />
        </group>
      </group>
    );
  return (
    <group scale={type === "giant" ? 1.45 : 1}>
      <Piece
        shape="disc"
        position={[0, 0.025, 0]}
        scale={[0.25, 0.045, 0.25]}
        color="#e5dfc9"
      />
      <Person type={type} color={uniform} />
    </group>
  );
});
