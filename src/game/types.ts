export type CivilizationId =
  | "imperia"
  | "determia"
  | "nosta"
  | "ida"
  | "rina"
  | "neutral";
export type Terrain = "plain" | "forest" | "mountain" | "shallow" | "deep";
export type Resource =
  | "fruit"
  | "animal"
  | "crop"
  | "ore"
  | "fish"
  | "starfish";
export type UnitType =
  | "warrior"
  | "rider"
  | "defender"
  | "archer"
  | "swordsman"
  | "catapult"
  | "knight"
  | "mindBender"
  | "cloak"
  | "dagger"
  | "giant"
  | "raft"
  | "scout"
  | "rammer"
  | "bomber"
  | "juggernaut"
  | "dinghy"
  | "pirate";
export type MonumentId =
  | "altarOfPeace"
  | "emperorTomb"
  | "eyeOfGod"
  | "gateOfPower"
  | "grandBazaar"
  | "parkOfFortune"
  | "towerOfWisdom";
export type BuildingId =
  | "farm"
  | "lumberHut"
  | "mine"
  | "windmill"
  | "sawmill"
  | "forge"
  | "market"
  | "port"
  | "temple"
  | "forestTemple"
  | "mountainTemple"
  | "waterTemple"
  | "bridge"
  | MonumentId;
export type Reward =
  | "income"
  | "explore"
  | "resources"
  | "defense"
  | "population"
  | "territory"
  | "park"
  | "giant";
export type UnitSkill =
  | "dash"
  | "escape"
  | "fortify"
  | "persist"
  | "stiff"
  | "static"
  | "heal"
  | "convert"
  | "hide"
  | "infiltrate"
  | "scout"
  | "creep"
  | "surprise"
  | "independent"
  | "water"
  | "carry"
  | "splash"
  | "stomp";
export interface Position {
  x: number;
  y: number;
}
export interface MapSettings {
  landRatio: number;
  forestRatio: number;
  mountainRatio: number;
  resourceDensity: number;
  villageDensity: number;
  noiseScale: number;
  spawnMode: "random" | "balanced" | "custom";
  customSpawns: Position[];
}
export interface GameOptions {
  scenario: "story" | "free" | "fair";
  civilization: CivilizationId;
  size: number;
  aiCount: number;
  difficulty: "easy" | "normal";
  mapType: "dryland" | "lakes" | "continents" | "archipelago" | "waterworld";
  seed: string;
  mode: "conquest" | "score";
  maxRounds: number;
  factionNames: string[];
  startingProfiles: string[];
  mapSettings: MapSettings;
}
export interface Tile extends Position {
  id: number;
  terrain: Terrain;
  resource: Resource | null;
  owner: number | null;
  cityId: string | null;
  building: BuildingId | null;
  road: boolean;
  ruin: boolean;
  builtTurn?: number;
  buildingLevel?: number;
  lighthouse?: boolean;
}
export interface Player {
  id: number;
  civilization: CivilizationId;
  name: string;
  color: string;
  isAI: boolean;
  resources: number;
  technologies: string[];
  explored: number[];
  visible: number[];
  eliminated: boolean;
  score: number;
  peaceWith: number[];
  peaceOffers: number[];
  embassies: number[];
  metPlayers: number[];
  lastAttackRound: number;
  builtMonuments: MonumentId[];
  unlockedMonuments?: MonumentId[];
  bonusScore: number;
  stats: {
    kills: number;
    citiesCaptured: number;
    explored: number;
    resourcesEarned: number;
  };
}
export interface City extends Position {
  id: string;
  name: string;
  owner: number | null;
  capitalOf: number | null;
  level: number;
  population: number;
  incomeBonus: number;
  defenseBonus: number;
  territory: number[];
  pendingRewards: number;
  pendingRewardLevels: number[];
  connected: boolean;
  connectionRewarded: boolean;
  borderExpanded: boolean;
  parks: number;
  infiltratedRound: number | null;
}
export interface Unit extends Position {
  id: string;
  owner: number;
  type: UnitType;
  hp: number;
  maxHp: number;
  kills: number;
  veteran: boolean;
  moved: boolean;
  attacked: boolean;
  homeCityId: string;
  capturedTurn: number | null;
  escapeUsed: boolean;
  independent?: boolean;
  hidden: boolean;
  hiddenAtTurnStart: boolean;
  carried?: { type: UnitType; maxHp: number; veteran: boolean; kills: number };
}
export interface GameEvent {
  id: number;
  type:
    | "move"
    | "attack"
    | "death"
    | "capture"
    | "upgrade"
    | "research"
    | "turn"
    | "info";
  message: string;
  player: number;
  at?: Position;
  from?: Position;
  unitId?: string;
  damage?: number;
}
export interface GameState {
  version: 2;
  options: GameOptions;
  tiles: Tile[];
  cities: City[];
  units: Unit[];
  players: Player[];
  round: number;
  currentPlayer: number;
  status: "playing" | "finished";
  winner: number | null;
  events: GameEvent[];
  nextId: number;
}
export type Action =
  | { type: "MOVE"; unitId: string; to: number }
  | { type: "ATTACK"; unitId: string; targetId: string }
  | {
      type:
        | "HEAL"
        | "CAPTURE"
        | "PROMOTE"
        | "DISBAND"
        | "HEAL_OTHERS"
        | "EXAMINE";
      unitId: string;
    }
  | { type: "CONVERT"; unitId: string; targetId: string }
  | { type: "INFILTRATE"; unitId: string; cityId: string }
  | {
      type: "UPGRADE_NAVAL";
      unitId: string;
      unitType: "scout" | "rammer" | "bomber";
    }
  | { type: "TRAIN"; cityId: string; unitType: UnitType }
  | { type: "RESEARCH"; techId: string }
  | { type: "BUILD"; tileId: number; building: BuildingId }
  | {
      type:
        | "ROAD"
        | "HARVEST"
        | "CLEAR_FOREST"
        | "BURN_FOREST"
        | "GROW_FOREST"
        | "DESTROY";
      tileId: number;
    }
  | { type: "CITY_REWARD"; cityId: string; reward: Reward }
  | { type: "PEACE" | "BREAK_PEACE" | "EMBASSY"; targetPlayer: number }
  | { type: "END_TURN" | "RESIGN" };
export interface ActionResult {
  state: GameState;
  ok: boolean;
  error?: string;
}
export interface Civilization {
  id: CivilizationId;
  name: string;
  english: string;
  color: string;
  lightColor: string;
  symbol: string;
  description: string;
  bonus: string;
  capital: string;
  startingTech: string;
}
export interface UnitDefinition {
  id: UnitType;
  name: string;
  cost: number;
  hp: number;
  attack: number;
  defense: number;
  movement: number;
  range: number;
  vision: number;
  tech: string | null;
  description: string;
  skills: UnitSkill[];
  trainable: boolean;
}
export interface TechDefinition {
  id: string;
  name: string;
  description: string;
  tier: number;
  branch: string;
  prerequisites: string[];
  unlocks: string;
}
export interface BuildingDefinition {
  id: BuildingId;
  name: string;
  cost: number;
  population: number;
  income: number;
  tech: string;
  terrain: Terrain[];
  resource?: Resource;
  description: string;
  unique?: boolean;
  monument?: boolean;
}
export interface CombatPreview {
  damage: number;
  retaliation: number;
  canAttack: boolean;
}
