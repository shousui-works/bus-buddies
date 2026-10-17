export const COLORS = {
  coral: { name: 'あか', label: '赤', paint: '#ff5071', dark: '#c62c52', pale: '#ffe3e9', symbol: '●' },
  blue: { name: 'あお', label: '青', paint: '#428fff', dark: '#245acb', pale: '#e0ebff', symbol: '▲' },
  yellow: { name: 'きいろ', label: '黄', paint: '#ffcc38', dark: '#d08d16', pale: '#fff2c3', symbol: '★' },
  green: { name: 'みどり', label: '緑', paint: '#24d590', dark: '#119561', pale: '#d6f8e8', symbol: '◆' },
  purple: { name: 'むらさき', label: '紫', paint: '#a872ff', dark: '#7642c8', pale: '#eee1ff', symbol: '■' },
  orange: { name: 'オレンジ', label: '橙', paint: '#ff9948', dark: '#d06627', pale: '#ffead6', symbol: '✚' },
  cyan: { name: 'みずいろ', label: '水', paint: '#2cd8e6', dark: '#1595b3', pale: '#daf8ff', symbol: '✦' },
  pink: { name: 'ピンク', label: '桃', paint: '#f97bda', dark: '#bd459e', pale: '#ffe0f7', symbol: '♥' }
};
export const DIRECTIONS = {
  N: { dx: 0, dy: -1, name: '上', arrow: '↑' },
  E: { dx: 1, dy: 0, name: '右', arrow: '→' },
  S: { dx: 0, dy: 1, name: '下', arrow: '↓' },
  W: { dx: -1, dy: 0, name: '左', arrow: '←' }
};
export const STAGES = [
  { title: 'ぎゅうぎゅう駐車場', size: 8, count: 20, colors: 4, seed: 9321, group: 2 },
  { title: '交差する行き先', size: 8, count: 24, colors: 5, seed: 4172, group: 3 },
  { title: 'お昼の大渋滞', size: 9, count: 28, colors: 6, seed: 18279, group: 3 },
  { title: 'カラフル交差点', size: 9, count: 32, colors: 7, seed: 6218, group: 3 },
  { title: '街いちばんのターミナル', size: 10, count: 36, colors: 8, seed: 8934, group: 3 }
];
export const clone = value => JSON.parse(JSON.stringify(value));
function random(seed) { return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }; }
export function cellsFor(car) {
  const horizontal = car.dir === 'E' || car.dir === 'W';
  return Array.from({ length: car.length }, (_, i) => ({ x: car.x + (horizontal ? i : 0), y: car.y + (horizontal ? 0 : i) }));
}
export function exitPath(car, size) {
  const d = DIRECTIONS[car.dir], cells = cellsFor(car);
  const front = cells.reduce((best, cell) => cell.x * d.dx + cell.y * d.dy > best.x * d.dx + best.y * d.dy ? cell : best);
  const path = [];
  for (let x = front.x + d.dx, y = front.y + d.dy; x >= 0 && y >= 0 && x < size && y < size; x += d.dx, y += d.dy) path.push({ x, y });
  return path;
}
function key(x, y) { return x + ',' + y; }
export function getBlockers(state, id) {
  const car = state.buses.find(b => b.id === id);
  if (!car || car.location !== 'garage') return [];
  const occupied = new Map();
  for (const other of state.buses) if (other.location === 'garage' && other.id !== id) for (const c of cellsFor(other)) occupied.set(key(c.x, c.y), other.id);
  return [...new Set(exitPath(car, state.size).map(c => occupied.get(key(c.x, c.y))).filter(Boolean))];
}
export function isAccessible(state, id) {
  const car = state.buses.find(b => b.id === id);
  return !!car && car.location === 'garage' && getBlockers(state, id).length === 0;
}
function buildLayout(spec, seed) {
  const rng = random(seed), cars = [], occupied = new Set();
  for (let i = 0; i < spec.count; i++) {
    let candidates = [];
    for (const length of (i % 7 === 5 ? [3, 2] : [2])) {
      for (const dir of Object.keys(DIRECTIONS)) for (let y = 0; y < spec.size; y++) for (let x = 0; x < spec.size; x++) {
        const car = { id: 'bus-' + i, x, y, dir, length, load: 0, location: 'garage' };
        const cells = cellsFor(car);
        if (cells.some(c => c.x >= spec.size || c.y >= spec.size || occupied.has(key(c.x, c.y)))) continue;
        if (exitPath(car, spec.size).some(c => occupied.has(key(c.x, c.y)))) continue;
        const placed = new Set(cells.map(c => key(c.x, c.y)));
        let blocked = 0, adjacent = 0;
        for (const existing of cars) if (exitPath(existing, spec.size).some(c => placed.has(key(c.x, c.y)))) blocked++;
        for (const c of cells) for (const d of Object.values(DIRECTIONS)) if (occupied.has(key(c.x + d.dx, c.y + d.dy))) adjacent++;
        const middle = Math.abs(x + .5 - spec.size / 2) + Math.abs(y + .5 - spec.size / 2);
        candidates.push({ car, score: blocked * 7 + adjacent * 1.1 - middle * .3 + rng() * 8 });
      }
      if (candidates.length) break;
    }
    if (!candidates.length) return null;
    candidates.sort((a, b) => b.score - a.score);
    const car = candidates[Math.floor(rng() * Math.min(5, candidates.length))].car;
    cars.push(car);
    for (const cell of cellsFor(car)) occupied.add(key(cell.x, cell.y));
  }
  return cars;
}
export function createLevel(index = 0, variant = 0) {
  if (!Number.isInteger(index) || index < 0 || index >= STAGES.length) throw new RangeError('Unknown stage');
  const spec = STAGES[index], rng = random(spec.seed + variant * 101), palette = Object.keys(COLORS).slice(0, spec.colors);
  let buses;
  for (let attempt = 0; attempt < 24 && !buses; attempt++) buses = buildLayout(spec, spec.seed + variant * 101 + attempt * 7919);
  if (!buses) throw new Error('Could not construct a solvable parking lot');
  const paints = Array.from({ length: buses.length }, (_, i) => palette[i % palette.length]);
  for (let i = paints.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [paints[i], paints[j]] = [paints[j], paints[i]]; }
  buses.forEach((car, i) => { car.color = paints[i]; car.capacity = car.length === 3 ? 6 : 4; });
  const solution = buses.map(b => b.id).reverse(), queue = [];
  for (let i = 0; i < solution.length; i += spec.group) {
    const group = solution.slice(i, i + spec.group).map(id => buses.find(b => b.id === id));
    const counts = group.map(car => car.capacity);
    while (counts.some(n => n > 0)) for (let j = 0; j < group.length; j++) if (counts[j] > 0) {
      const amount = Math.min(counts[j], j === 0 && counts[j] === group[j].capacity ? 2 : 1);
      for (let n = 0; n < amount; n++) queue.push(group[j].color);
      counts[j] -= amount;
    }
  }
  return { stage: index, variant, size: spec.size, buses, queue, head: 0, bays: [null, null, null, null, null], moves: 0, solution };
}
export function status(state) {
  if (state.head === state.queue.length && state.buses.every(b => b.location === 'departed')) return 'won';
  if (state.bays.every(Boolean)) return 'lost';
  if (!state.buses.some(b => isAccessible(state, b.id))) return 'lost';
  return 'playing';
}
export function dispatch(original, id, recordFrames = true) {
  if (status(original) !== 'playing') return { ok: false, reason: 'finished' };
  const car = original.buses.find(b => b.id === id);
  if (!car || car.location !== 'garage') return { ok: false, reason: 'missing' };
  const blockers = getBlockers(original, id);
  if (blockers.length) return { ok: false, reason: 'blocked', blockers };
  const bay = original.bays.indexOf(null);
  if (bay < 0) return { ok: false, reason: 'full' };
  const state = clone(original), events = [];
  const record = (type, busId, bayIndex) => { if (recordFrames) events.push({ type, id: busId, bay: bayIndex, state: clone(state) }); };
  const selected = state.buses.find(b => b.id === id);
  selected.location = 'bay'; state.bays[bay] = id; state.moves++;
  record('move', id, bay);
  while (state.head < state.queue.length) {
    const color = state.queue[state.head];
    const slot = state.bays.findIndex(busId => busId && state.buses.find(b => b.id === busId).color === color);
    if (slot < 0) break;
    const boarding = state.buses.find(b => b.id === state.bays[slot]);
    boarding.load++; state.head++;
    record('board', boarding.id, slot);
    if (boarding.load === boarding.capacity) {
      boarding.location = 'departed'; state.bays[slot] = null;
      record('depart', boarding.id, slot);
    }
  }
  return { ok: true, state, events };
}
export function addBay(original) {
  if (original.bays.length >= 7 || status(original) === 'won') return null;
  const state = clone(original); state.bays.push(null); return state;
}
export function solve(initial, maxNodes = 18000, timeBudgetMs = 500) {
  const deadline = Date.now() + timeBudgetMs;
  let trial = clone(initial), direct = [];
  for (const id of initial.solution || []) {
    if (trial.buses.find(b => b.id === id)?.location !== 'garage') continue;
    const move = dispatch(trial, id, false);
    if (!move.ok) break;
    trial = move.state; direct.push(id);
  }
  if (status(trial) === 'won') return { status: 'solved', path: direct, nodes: direct.length };
  const seen = new Set(); let nodes = 0, limited = false;
  function visit(state) {
    if (status(state) === 'won') return [];
    if (status(state) === 'lost') return null;
    if (++nodes > maxNodes || (nodes % 32 === 0 && Date.now() > deadline)) { limited = true; return null; }
    const signature = state.buses.filter(b => b.location === 'garage').map(b => b.id).join(',') + '/' +
      state.bays.filter(Boolean).map(id => { const b = state.buses.find(x => x.id === id); return b.color + ':' + b.capacity + ':' + b.load; }).sort().join(',') + '/' + state.head;
    if (seen.has(signature)) return null;
    seen.add(signature);
    const candidates = state.buses.filter(b => isAccessible(state, b.id));
    candidates.sort((a, b) => Number(b.color === state.queue[state.head]) - Number(a.color === state.queue[state.head]) || (state.solution || []).indexOf(a.id) - (state.solution || []).indexOf(b.id));
    for (const car of candidates) {
      if (limited) break;
      const move = dispatch(state, car.id, false);
      if (!move.ok) continue;
      const rest = visit(move.state);
      if (rest !== null) return [car.id, ...rest];
    }
    return null;
  }
  const path = visit(initial);
  return { status: path ? 'solved' : limited ? 'limit' : 'unsolvable', path, nodes };
}
