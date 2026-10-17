export const COLORS = {
  coral: { name: 'あか', label: '赤', paint: '#ef776e', dark: '#cc4c48', pale: '#ffe4de', symbol: '●' },
  blue: { name: 'あお', label: '青', paint: '#66a7f2', dark: '#3e78c0', pale: '#dcecff', symbol: '▲' },
  yellow: { name: 'きいろ', label: '黄', paint: '#efc858', dark: '#b7952e', pale: '#fff2bd', symbol: '★' },
  green: { name: 'みどり', label: '緑', paint: '#71b999', dark: '#438b6d', pale: '#ddf2e6', symbol: '◆' },
  purple: { name: 'むらさき', label: '紫', paint: '#b598da', dark: '#8565ad', pale: '#efe3ff', symbol: '■' }
};
export const STAGES = [
  { title: 'はじめての出発', cols: 3, rows: 2, colors: 3, seed: 97, group: 1, note: 'まずは、先頭の乗客と同じ色のバスを探そう。' },
  { title: 'ちょっと寄り道', cols: 4, rows: 2, colors: 4, seed: 417, group: 2, note: '途中まで乗ったバスは、待機場所でひと休み。' },
  { title: 'にぎやかな朝', cols: 4, rows: 3, colors: 4, seed: 1827, group: 2, note: '奥のバスを出すには、手前のバスを先に出そう。' },
  { title: '街はおおいそがし', cols: 5, rows: 3, colors: 5, seed: 621, group: 3, note: '乗客の少し先まで見て、3つの枠をやりくりしよう。' },
  { title: '最後のバスターミナル', cols: 5, rows: 4, colors: 5, seed: 893, group: 3, note: 'みんなを乗せられるかな？ ゆっくり考えて大丈夫。' }
];
export const clone = value => JSON.parse(JSON.stringify(value));
function random(seed) {
  return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
}
export function createLevel(index = 0) {
  if (!Number.isInteger(index) || index < 0 || index >= STAGES.length) throw new RangeError('Unknown stage');
  const spec = STAGES[index], rng = random(spec.seed), palette = Object.keys(COLORS).slice(0, spec.colors);
  const paints = Array.from({ length: spec.cols * spec.rows }, (_, i) => palette[i % palette.length]);
  for (let i = paints.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [paints[i], paints[j]] = [paints[j], paints[i]];
  }
  const buses = [];
  for (let row = 0; row < spec.rows; row++) for (let col = 0; col < spec.cols; col++) {
    buses.push({ id: 'bus-' + (row * spec.cols + col), color: paints[row * spec.cols + col], row, col, load: 0, location: 'garage' });
  }
  const laneRows = Array(spec.cols).fill(0), solution = [];
  while (solution.length < buses.length) {
    const available = laneRows.map((r, c) => ({ r, c })).filter(x => x.r < spec.rows);
    const choice = available[Math.floor(rng() * available.length)];
    solution.push(buses.find(b => b.col === choice.c && b.row === choice.r).id);
    laneRows[choice.c]++;
  }
  const queue = [];
  for (let i = 0; i < solution.length; i += spec.group) {
    const group = solution.slice(i, i + spec.group).map(id => buses.find(b => b.id === id).color);
    if (group.length === 3) {
      const [a, b, c] = group; queue.push(a, b, a, c, b, a, c, b, c);
    } else if (group.length === 2) {
      const [a, b] = group; queue.push(a, a, b, a, b, b);
    } else { queue.push(group[0], group[0], group[0]); }
  }
  return { stage: index, buses, queue, head: 0, bays: [null, null, null], moves: 0, solution };
}
export function isAccessible(state, id) {
  const bus = state.buses.find(b => b.id === id);
  return !!bus && bus.location === 'garage' && !state.buses.some(b => b.location === 'garage' && b.col === bus.col && b.row < bus.row);
}
export function status(state) {
  if (state.head === state.queue.length && state.buses.every(b => b.location === 'departed')) return 'won';
  if (state.bays.every(Boolean)) return 'lost';
  return 'playing';
}
export function dispatch(original, id, recordFrames = true) {
  if (status(original) !== 'playing') return { ok: false, reason: 'finished' };
  const bus = original.buses.find(b => b.id === id);
  if (!bus || bus.location !== 'garage') return { ok: false, reason: 'missing' };
  if (!isAccessible(original, id)) return { ok: false, reason: 'blocked' };
  const bay = original.bays.indexOf(null);
  if (bay === -1) return { ok: false, reason: 'full' };
  const state = clone(original), events = [];
  const record = (type, busId, bayIndex) => {
    if (recordFrames) events.push({ type, id: busId, bay: bayIndex, state: clone(state) });
  };
  const selected = state.buses.find(b => b.id === id);
  selected.location = 'bay'; state.bays[bay] = id; state.moves++;
  record('move', id, bay);
  while (state.head < state.queue.length) {
    const rider = state.queue[state.head];
    const matchingBay = state.bays.findIndex(busId => busId && state.buses.find(b => b.id === busId).color === rider);
    if (matchingBay < 0) break;
    const boarding = state.buses.find(b => b.id === state.bays[matchingBay]);
    boarding.load++; state.head++;
    record('board', boarding.id, matchingBay);
    if (boarding.load === 3) {
      boarding.location = 'departed'; state.bays[matchingBay] = null;
      record('depart', boarding.id, matchingBay);
    }
  }
  return { ok: true, state, events };
}
export function solve(initial, maxNodes = 60000) {
  const seen = new Set(); let nodes = 0, limited = false;
  function visit(state) {
    if (status(state) === 'won') return [];
    if (status(state) === 'lost') return null;
    if (++nodes > maxNodes) { limited = true; return null; }
    const key = state.buses.filter(b => b.location === 'garage').map(b => b.id).join(',') + '/' +
      state.bays.filter(Boolean).map(id => { const b = state.buses.find(x => x.id === id); return b.color + ':' + b.load; }).sort().join(',') + '/' + state.head;
    if (seen.has(key)) return null;
    seen.add(key);
    const candidates = state.buses.filter(b => isAccessible(state, b.id));
    candidates.sort((a, b) => Number(b.color === state.queue[state.head]) - Number(a.color === state.queue[state.head]));
    for (const bus of candidates) {
      if (limited) break;
      const result = dispatch(state, bus.id, false);
      if (!result.ok) continue;
      const rest = visit(result.state);
      if (rest !== null) return [bus.id, ...rest];
    }
    return null;
  }
  const path = visit(initial);
  return { status: path ? 'solved' : limited ? 'limit' : 'unsolvable', path, nodes };
}
