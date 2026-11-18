import { createGame, DEFAULT_OPTIONS, TECHNOLOGIES, UNITS } from "../../src/game";
import type {
  GameOptions,
  GameState,
  Unit,
  UnitType,
  City,
} from "../../src/game/types";

export function newGame(options: Partial<GameOptions> = {}): GameState {
  return createGame({
    ...structuredClone(DEFAULT_OPTIONS),
    scenario: "fair",
    civilization: "neutral",
    size: 12,
    aiCount: 1,
    seed: "autumn-regression",
    startingProfiles: Array(11).fill("organization"),
    ...options,
  });
}

/** Open surveyed battlefield with two living capitals; rule tests alter only their setup. */
export function battlefield(): GameState {
  const game = newGame({ mapType: "dryland" });
  game.tiles.forEach((tile) =>
    Object.assign(tile, {
      terrain: "plain",
      resource: null,
      owner: null,
      cityId: null,
      building: null,
      road: false,
      ruin: false,
      lighthouse: false,
    }),
  );
  game.cities = game.cities.filter((city) => city.capitalOf !== null);
  game.cities.forEach((city, index) => {
    Object.assign(city, {
      x: index ? 10 : 1,
      y: index ? 10 : 1,
      level: 1,
      population: 0,
      pendingRewards: 0,
      pendingRewardLevels: [],
      incomeBonus: 0,
      defenseBonus: 0,
      connected: false,
      connectionRewarded: false,
      borderExpanded: false,
      parks: 0,
      infiltratedRound: null,
    });
    city.territory = game.tiles
      .filter(
        (tile) =>
          Math.max(Math.abs(tile.x - city.x), Math.abs(tile.y - city.y)) <= 1,
      )
      .map((tile) => tile.id);
    city.territory.forEach((id) => {
      game.tiles[id].owner = city.owner;
    });
    game.tiles[city.y * 12 + city.x].cityId = city.id;
  });
  game.units = [];
  game.players.forEach((player) => {
    player.resources = 100;
    player.technologies = TECHNOLOGIES.map((tech) => tech.id);
    player.explored = game.tiles.map((tile) => tile.id);
    player.visible = [...player.explored];
    player.eliminated = false;
    player.peaceWith = [];
    player.peaceOffers = [];
    player.embassies = [];
    player.metPlayers = game.players
      .filter((other) => other.id !== player.id)
      .map((other) => other.id);
    player.builtMonuments = [];
    player.bonusScore = 0;
    player.lastAttackRound = 0;
    player.stats.explored = player.explored.length;
  });
  game.currentPlayer = 0;
  game.events = [];
  game.status = "playing";
  game.winner = null;
  return game;
}

export function addUnit(
  game: GameState,
  owner: number,
  type: UnitType,
  x: number,
  y: number,
): Unit {
  const unit: Unit = {
    id: `unit-${game.nextId++}`,
    owner,
    type,
    x,
    y,
    hp: UNITS[type].hp,
    maxHp: UNITS[type].hp,
    moved: false,
    attacked: false,
    homeCityId: game.cities.find((city) => city.owner === owner)!.id,
    capturedTurn: null,
    kills: 0,
    veteran: false,
    escapeUsed: false,
    hidden: false,
    hiddenAtTurnStart: false,
  };
  game.units.push(unit);
  return unit;
}

export function addCity(
  game: GameState,
  x: number,
  y: number,
  owner: number | null = null,
): City {
  const city: City = {
    ...structuredClone(game.cities[0]),
    id: `test-city-${game.nextId++}`,
    name: "测试聚落",
    x,
    y,
    owner,
    capitalOf: null,
    territory: [],
    pendingRewards: 0,
    pendingRewardLevels: [],
    level: 1,
    population: 0,
    parks: 0,
    incomeBonus: 0,
    defenseBonus: 0,
    connected: false,
    connectionRewarded: false,
    borderExpanded: false,
    infiltratedRound: null,
  };
  game.cities.push(city);
  game.tiles[y * game.options.size + x].cityId = city.id;
  if (owner !== null) {
    city.territory = game.tiles
      .filter(
        (tile) =>
          tile.owner === null &&
          Math.max(Math.abs(tile.x - x), Math.abs(tile.y - y)) <= 1,
      )
      .map((tile) => tile.id);
    city.territory.forEach((id) => {
      game.tiles[id].owner = owner;
    });
  }
  return city;
}
