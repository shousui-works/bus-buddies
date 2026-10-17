import test from 'node:test';
import assert from 'node:assert/strict';
import { COLORS, DIRECTIONS, STAGES, clone, createLevel, cellsFor, exitPath, getBlockers, isAccessible, dispatch, status, solve, addBay } from '../public/engine.mjs';

function conservation(state) {
  assert.equal(state.head, state.buses.reduce((n, b) => n + b.load, 0));
  assert.equal(state.waiting.length + state.head, state.queue.length);
  assert.equal(state.queue.length, state.buses.reduce((n, b) => n + b.capacity, 0));
  for (const color of Object.keys(COLORS)) {
    const cars = state.buses.filter(b => b.color === color);
    const total = state.queue.filter(c => c === color).length;
    assert.equal(total, cars.reduce((n, b) => n + b.capacity, 0));
    assert.equal(total, state.waiting.filter(c => c === color).length + cars.reduce((n, b) => n + b.load, 0));
  }
  const bays = state.bays.filter(Boolean);
  assert.equal(new Set(bays).size, bays.length);
  for (const car of state.buses) {
    assert.ok(car.load >= 0 && car.load <= car.capacity);
    if (car.location === 'garage') assert.equal(car.load, 0);
    if (car.location === 'departed') assert.equal(car.load, car.capacity);
    if (car.location === 'bay') assert.ok(bays.includes(car.id));
  }
}
function validParking(state) {
  const occupied = new Set();
  for (const car of state.buses.filter(b => b.location === 'garage')) {
    for (const c of cellsFor(car)) {
      assert.ok(c.x >= 0 && c.y >= 0 && c.x < state.size && c.y < state.size);
      const cell = c.x + ',' + c.y;
      assert.ok(!occupied.has(cell), 'overlap at ' + cell); occupied.add(cell);
    }
  }
}
function finish(state, route) {
  for (const id of route) {
    const before = JSON.stringify(state), result = dispatch(state, id, false);
    assert.equal(result.ok, true, 'stage ' + (state.stage + 1) + ', ' + id);
    assert.equal(JSON.stringify(state), before, 'the original state is immutable');
    state = result.state; conservation(state);
  }
  assert.equal(status(state), 'won');
  return state;
}
function fixture(buses, queue) {
  return { stage: 0, variant: 0, size: 8, buses: buses.map(b => ({ load: 0, location: 'garage', capacity: 4, color: 'coral', ...b })), queue, waiting: [...queue], head: 0, bays: [null, null, null, null, null], moves: 0, solution: buses.map(b => b.id) };
}
test('all five crowded parking lots are reproducible, nonoverlapping, colorful and solvable', () => {
  for (let stage = 0; stage < STAGES.length; stage++) {
    const state = createLevel(stage), spec = STAGES[stage];
    assert.deepEqual(state, createLevel(stage));
    assert.equal(state.buses.length, spec.count);
    assert.equal(new Set(state.buses.map(b => b.color)).size, spec.colors);
    assert.equal(new Set(state.buses.map(b => b.dir)).size, 4);
    assert.ok(state.buses.some(b => !isAccessible(state, b.id)), 'a crowded lot has blocked cars');
    assert.ok(state.buses.some(b => b.capacity === 6), 'both vehicle capacities are represented');
    validParking(state); conservation(state); finish(state, state.solution);
  }
});
test('new shuffled layouts remain solvable and do not overlap', () => {
  for (let stage = 0; stage < STAGES.length; stage++) for (const variant of [1, 2, 5, 12]) {
    const state = createLevel(stage, variant);
    assert.notDeepEqual(state.buses, createLevel(stage).buses);
    validParking(state); finish(state, state.solution);
  }
});
test('perpendicular cars block the complete forward path in every direction', () => {
  const cases = [
    [{ x: 3, y: 5, dir: 'N' }, { x: 2, y: 2, dir: 'E' }],
    [{ x: 1, y: 3, dir: 'E' }, { x: 6, y: 2, dir: 'N' }],
    [{ x: 3, y: 1, dir: 'S' }, { x: 2, y: 6, dir: 'W' }],
    [{ x: 5, y: 3, dir: 'W' }, { x: 1, y: 2, dir: 'S' }]
  ];
  for (const [car, obstacle] of cases) {
    const state = fixture([{ id: 'bus-0', length: 2, ...car }, { id: 'bus-1', length: 2, ...obstacle }], Array(8).fill('coral'));
    assert.deepEqual(getBlockers(state, 'bus-0'), ['bus-1']);
    assert.equal(isAccessible(state, 'bus-0'), false);
    const result = dispatch(state, 'bus-0');
    assert.equal(result.ok, false); assert.equal(result.reason, 'blocked');
    const cleared = clone(state); cleared.buses[1].location = 'bay'; cleared.bays[0] = 'bus-1';
    assert.equal(isAccessible(cleared, 'bus-0'), true);
  }
});
test('exit rays start beyond the entire vehicle, including long buses and board edges', () => {
  assert.deepEqual(exitPath({ x: 1, y: 2, dir: 'E', length: 3 }, 6), [{ x: 4, y: 2 }, { x: 5, y: 2 }]);
  assert.deepEqual(exitPath({ x: 0, y: 3, dir: 'W', length: 2 }, 6), []);
  assert.deepEqual(exitPath({ x: 4, y: 0, dir: 'N', length: 3 }, 6), []);
  assert.deepEqual(exitPath({ x: 2, y: 3, dir: 'S', length: 3 }, 6), []);
});
test('cars travel only in their facing direction, even if the opposite end is clear', () => {
  const state = fixture([{ id: 'bus-0', x: 2, y: 2, dir: 'E', length: 2 }, { id: 'bus-1', x: 5, y: 2, dir: 'E', length: 2 }], Array(8).fill('coral'));
  assert.equal(isAccessible(state, 'bus-0'), false);
  assert.equal(isAccessible(state, 'bus-1'), true);
  const moved = dispatch(state, 'bus-1');
  assert.equal(moved.ok, true);
  assert.equal(isAccessible(moved.state, 'bus-0'), true);
});
test('riders board from the middle of the queue while the others keep their order', () => {
  const colors = ['blue', 'coral', 'green', 'yellow'];
  const cars = colors.map((color, y) => ({ id: 'bus-' + y, x: 0, y, dir: 'E', length: 2, color }));
  const queue = ['coral', 'blue', 'green', 'blue', 'coral', 'yellow', 'blue', 'green', 'yellow', 'coral', 'blue', 'green', 'yellow', 'coral', 'green', 'yellow'];
  const initial = fixture(cars, queue), before = clone(initial);
  const result = dispatch(initial, 'bus-0');
  assert.equal(result.ok, true);
  assert.deepEqual(initial, before, 'boarding does not change the undo snapshot');
  assert.deepEqual(result.state.waiting, queue.filter(color => color !== 'blue'));
  assert.deepEqual(result.state.queue, queue, 'the original roster is retained');
  assert.equal(result.state.head, 4);
  assert.equal(result.state.buses[0].location, 'departed');
  assert.ok(result.state.bays.every(id => id === null));
  let expected = [...queue];
  for (const frame of result.events) {
    if (frame.type === 'board') expected.splice(expected.indexOf('blue'), 1);
    assert.deepEqual(frame.state.waiting, expected);
    conservation(frame.state);
  }
  finish(result.state, ['bus-2', 'bus-3', 'bus-1']);
});
test('passengers beyond the visible strip can fill a six-seat bus', () => {
  const cars = Array.from({ length: 8 }, (_, y) => ({ id: 'bus-' + y, x: 0, y, dir: 'E', length: y === 7 ? 3 : 2, capacity: y === 7 ? 6 : 4, color: y === 7 ? 'blue' : 'coral' }));
  const queue = [...Array(28).fill('coral'), ...Array(6).fill('blue')];
  const result = dispatch(fixture(cars, queue), 'bus-7');
  assert.equal(result.ok, true);
  assert.deepEqual(result.state.waiting, Array(28).fill('coral'));
  assert.equal(result.state.head, 6);
  assert.equal(result.state.buses[7].load, 6);
  assert.equal(result.state.buses[7].location, 'departed');
  assert.equal(result.events.filter(frame => frame.type === 'board').length, 6);
  conservation(result.state);
});
test('same-color vehicles board only up to their own capacities', () => {
  const cars = [
    { id: 'short', x: 0, y: 0, dir: 'E', length: 2, color: 'blue' },
    { id: 'long', x: 0, y: 1, dir: 'E', length: 3, capacity: 6, color: 'blue' },
    { id: 'red', x: 0, y: 2, dir: 'E', length: 2, color: 'coral' }
  ];
  const queue = ['coral', 'blue', 'blue', 'coral', 'blue', 'blue', 'coral', 'blue', 'blue', 'coral', 'blue', 'blue', 'blue', 'blue'];
  let state = fixture(cars, queue);
  state = dispatch(state, 'short').state;
  assert.equal(state.buses[0].load, 4);
  assert.equal(state.waiting.filter(color => color === 'blue').length, 6);
  conservation(state);
  state = dispatch(state, 'long').state;
  assert.equal(state.buses[1].load, 6);
  assert.deepEqual(state.waiting, Array(4).fill('coral'));
  conservation(state);
  finish(state, ['red']);
});
test('all stages clear when choosing available cars without following queue order', () => {
  for (let stage = 0; stage < STAGES.length; stage++) {
    let state = createLevel(stage);
    for (let move = 0; move < STAGES[stage].count; move++) {
      const available = state.buses.filter(car => isAccessible(state, car.id));
      assert.ok(available.length);
      const car = available.find(car => car.color !== state.waiting[0]) || available[0];
      const result = dispatch(state, car.id, false);
      assert.equal(result.ok, true);
      state = result.state;
      assert.equal(state.buses.find(bus => bus.id === car.id).location, 'departed');
      assert.ok(state.bays.every(id => id === null));
      conservation(state);
    }
    assert.equal(status(state), 'won');
    assert.deepEqual(state.waiting, []);
  }
});
test('no more than two extra waiting bays can be added', () => {
  const initial = createLevel(0), six = addBay(initial), seven = addBay(six);
  assert.equal(initial.bays.length, 5); assert.equal(six.bays.length, 6); assert.equal(seven.bays.length, 7);
  assert.equal(addBay(seven), null);
});
test('hint routes clear all stages and work after a partial route and an extra bay', () => {
  for (let stage = 0; stage < STAGES.length; stage++) {
    let state = createLevel(stage);
    for (const id of state.solution.slice(0, 3)) state = dispatch(state, id, false).state;
    state = addBay(state);
    const result = solve(state);
    assert.equal(result.status, 'solved'); finish(state, result.path);
  }
});
test('boarding animation frames conserve riders and depart at the actual vehicle capacity', () => {
  let state = createLevel(1), seenLong = false;
  for (const id of state.solution) {
    const result = dispatch(state, id);
    for (const frame of result.events) {
      conservation(frame.state);
      if (frame.type === 'depart') {
        const car = frame.state.buses.find(b => b.id === frame.id);
        assert.equal(car.load, car.capacity);
        if (car.capacity === 6) seenLong = true;
      }
    }
    state = result.state;
  }
  assert.equal(seenLong, true); assert.equal(status(state), 'won');
});
test('unknown cars and invalid stages fail without mutating the position', () => {
  const state = createLevel(0), before = JSON.stringify(state);
  assert.deepEqual(dispatch(state, 'missing'), { ok: false, reason: 'missing' });
  assert.equal(JSON.stringify(state), before);
  assert.throws(() => createLevel(-1), RangeError); assert.throws(() => createLevel(5), RangeError);
});
