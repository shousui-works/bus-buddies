import test from 'node:test';
import assert from 'node:assert/strict';
import { createLevel, dispatch, status, solve, isAccessible, STAGES } from '../public/engine.mjs';
function assertConservation(state) {
  const boarded = state.buses.reduce((sum, b) => sum + b.load, 0);
  assert.equal(boarded, state.head);
  assert.equal(state.queue.length, state.buses.length * 3);
  for (const color of new Set(state.queue)) {
    assert.equal(state.queue.filter(c => c === color).length, state.buses.filter(b => b.color === color).length * 3);
  }
  assert.equal(new Set(state.bays.filter(Boolean)).size, state.bays.filter(Boolean).length);
  for (const bus of state.buses) {
    assert.ok(bus.load >= 0 && bus.load <= 3);
    if (bus.location === 'departed') assert.equal(bus.load, 3);
    if (bus.location === 'bay') assert.ok(state.bays.includes(bus.id));
  }
}
test('every stage has a playable, reproducible route with conserved passengers', () => {
  for (let level = 0; level < STAGES.length; level++) {
    let state = createLevel(level);
    assert.deepEqual(state, createLevel(level));
    assertConservation(state);
    for (const id of state.solution) {
      const before = JSON.stringify(state), result = dispatch(state, id);
      assert.equal(result.ok, true, 'stage ' + level + ', ' + id);
      assert.equal(JSON.stringify(state), before, 'transition must not mutate its input');
      state = result.state;
      assertConservation(state);
    }
    assert.equal(status(state), 'won');
    assert.equal(state.bays.filter(Boolean).length, 0);
  }
});
test('hint solver returns a complete valid route for all five stages', () => {
  for (let level = 0; level < STAGES.length; level++) {
    let state = createLevel(level);
    const result = solve(state);
    assert.equal(result.status, 'solved', 'stage ' + level + ', nodes ' + result.nodes);
    for (const id of result.path) {
      const moved = dispatch(state, id, false); assert.equal(moved.ok, true); state = moved.state;
    }
    assert.equal(status(state), 'won');
  }
});
test('buses behind another bus cannot move; invalid actions leave state intact', () => {
  const state = createLevel(0), before = JSON.stringify(state);
  assert.equal(isAccessible(state, 'bus-3'), false);
  assert.deepEqual(dispatch(state, 'bus-3'), { ok: false, reason: 'blocked' });
  assert.deepEqual(dispatch(state, 'does-not-exist'), { ok: false, reason: 'missing' });
  assert.equal(JSON.stringify(state), before);
});
test('full bays that cannot accept the next passenger cause failure and solver detects it', () => {
  const buses = ['blue', 'yellow', 'green', 'coral'].map((color, col) => ({ id: 'bus-' + col, color, col, row: 0, load: 0, location: 'garage' }));
  let state = { stage: 0, buses, queue: ['coral', 'coral', 'coral', 'blue', 'blue', 'blue', 'yellow', 'yellow', 'yellow', 'green', 'green', 'green'], head: 0, bays: [null, null, null], moves: 0 };
  for (const id of ['bus-0', 'bus-1', 'bus-2']) state = dispatch(state, id).state;
  assert.equal(status(state), 'lost'); assert.equal(solve(state).status, 'unsolvable'); assert.equal(state.head, 0);
});
test('animation snapshots describe real partial boarding and departure', () => {
  let state = createLevel(1);
  let result = dispatch(state, state.solution[0]);
  assert.equal(result.ok, true); assert.ok(result.events.some(e => e.type === 'board'));
  for (const frame of result.events) assertConservation(frame.state);
  state = result.state;
  for (const id of state.solution.slice(1)) state = dispatch(state, id).state;
  assert.equal(status(state), 'won');
});
