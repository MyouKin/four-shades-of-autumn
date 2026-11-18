/** Run with `npm run bench:ai` after npm ci.
 * Uses Vite's existing TypeScript loader; adds no runtime dependency.
 * Reports real wall time. The stress case is explicitly a constructed midgame fixture.
 */
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { cpus } from 'node:os';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('../../', import.meta.url));
const aiSource = new URL('../../src/game/ai/', import.meta.url);
const server = await createServer({ root, configFile: false, optimizeDeps: { noDiscovery: true, entries: [] }, server: { middlewareMode: true, ws: false }, appType: 'custom' });
try {
  console.log(JSON.stringify({ measuredAt: new Date().toISOString(), node: process.version, platform: process.platform, architecture: process.arch, cpu: cpus()[0]?.model, aiSourceSha256: createHash('sha256').update(readdirSync(aiSource).filter(name => name.endsWith('.ts')).sort().map(name => name + '\n' + readFileSync(new URL(name, aiSource), 'utf8')).join('\n')).digest('hex') }));
  const game = await server.ssrLoadModule('/src/game/index.ts');
  const options = (extra = {}) => ({ ...structuredClone(game.DEFAULT_OPTIONS), seed: 'ai-benchmark-2026', scenario: 'fair', mapType: 'dryland', size: 12, aiCount: 1, startingProfiles: Array(11).fill('organization'), ...extra });
  const sampleTurn = (state) => {
    const before = performance.now();
    const result = game.runAiTurnDetailed(state);
    return { ...result, elapsedMs: performance.now() - before };
  };
  const summarize = (label, records, state) => {
    const times = records.map(record => record.elapsedMs).sort((a,b) => a-b);
    console.log(JSON.stringify({
      label, map: `${state.options.size}x${state.options.size}`, players: state.players.length,
      turnsMeasured: records.length, round: state.round, totalUnits: state.units.length,
      controlledCitiesByPlayer: state.players.map(player => state.cities.filter(city => city.owner === player.id).length),
      unitsByPlayer: state.players.map(player => state.units.filter(unit => unit.owner === player.id).length),
      totalMs: Math.round(times.reduce((sum, ms) => sum + ms, 0)),
      medianMs: Math.round(times[Math.floor(times.length / 2)] ?? 0),
      p95Ms: Math.round(times[Math.min(times.length - 1, Math.floor(times.length * .95))] ?? 0),
      maxMs: Math.round(times.at(-1) ?? 0), actions: records.reduce((sum, record) => sum + record.actions.length, 0),
      trainingActions: records.flatMap(record => record.actions).filter(action => action.type === 'TRAIN').length,
      captures: records.flatMap(record => record.actions).filter(action => action.type === 'CAPTURE').length,
      truncatedTurns: records.filter(record => record.diagnostics.truncated).length,
      totalSimulations: records.reduce((sum, record) => sum + record.diagnostics.simulations, 0),
      status: state.status, winner: state.winner, diagnostics: records.at(-1)?.diagnostics,
    }, null, 2));
  };

  let small = game.createGame(options());
  const conquest = [];
  while (small.status === 'playing' && small.round <= 150) {
    const record = sampleTurn(small); conquest.push(record); small = record.state;
  }
  summarize('Actual deterministic conquest from a fresh game; 150-round safety limit', conquest, small);

  let large = game.createGame(options({ size: 64, aiCount: 10 }));
  const opening = [];
  for (let i = 0; i < 11 && large.status === 'playing'; i++) {
    const record = sampleTurn(large); opening.push(record); large = record.state;
  }
  summarize('Actual 64x64 opening round, eleven players', opening, large);

  const stress = game.createGame(options({ size: 64, aiCount: 10 }));
  stress.round = 20;
  stress.units = [];
  for (const player of stress.players) {
    player.resources = 90;
    player.technologies = game.TECHNOLOGIES.map(technology => technology.id);
    player.explored = stress.tiles.map(tile => tile.id);
    player.visible = [...player.explored];
    player.metPlayers = stress.players.filter(other => other.id !== player.id).map(other => other.id);
    player.stats.explored = player.explored.length;
  }
  const occupied = new Set();
  for (const player of stress.players) {
    const capital = stress.cities.find(city => city.capitalOf === player.id);
    capital.level = 40;
    const tiles = stress.tiles.filter(tile => !game.isWater(tile) && tile.terrain !== 'mountain' && !occupied.has(tile.id))
      .sort((a,b) => game.distance(a, capital) - game.distance(b, capital) || a.id - b.id);
    const count = player.id === 0 ? 36 : 12;
    for (let n = 0; n < count; n++) {
      const tile = tiles[n], type = ['warrior','rider','archer','swordsman'][n % 4], definition = game.UNITS[type];
      occupied.add(tile.id);
      stress.units.push({ id: `unit-${stress.nextId++}`, owner: player.id, type, x: tile.x, y: tile.y,
        hp: definition.hp, maxHp: definition.hp, kills: 0, veteran: false, moved: false, attacked: false,
        homeCityId: capital.id, capturedTurn: null, escapeUsed: false, hidden: false, hiddenAtTurnStart: false });
    }
  }
  const stressBefore = stress.units.length;
  let midgame = stress;
  const midgameTurns = [];
  for (let i = 0; i < 11 && midgame.status === 'playing'; i++) {
    const record = sampleTurn(midgame); midgameTurns.push(record); midgame = record.state;
  }
  summarize(`Constructed round-20 stress fixture; ${stressBefore} initial units (36 for player zero, 12 each opponent), all tiles explored`, midgameTurns, midgame);
  for (let i = 0; i < 44 && midgame.status === 'playing'; i++) {
    const record = sampleTurn(midgame); midgameTurns.push(record); midgame = record.state;
  }
  summarize('Same constructed midgame after five complete rounds; no extra stars or units injected during simulation', midgameTurns, midgame);
  if (small.status !== 'finished') process.exitCode = 1;
} finally {
  await server.close();
}
