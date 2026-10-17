import test from 'node:test';
import assert from 'node:assert/strict';
import { createLevel, clone, status, STAGES, addBay } from '../public/engine.mjs';
import { GameSession } from '../public/session.mjs';

function consistent(game) {
  const trips = [...game.trips.values()];
  assert.equal(new Set(trips.map(trip => trip.bay)).size, trips.length);
  const pending = trips.flatMap(trip => trip.riders.slice(trip.boarded));
  assert.equal(new Set(pending.map(rider => rider.id)).size, pending.length);
  assert.deepEqual(game.waiting.filter(rider => rider.trip === null).map(rider => rider.color), game.state.waiting);
  assert.deepEqual(game.waiting.filter(rider => rider.trip !== null).map(rider => rider.id).sort((a, b) => a - b), pending.map(rider => rider.id).sort((a, b) => a - b));
  assert.equal(game.boarded, game.state.head - pending.length);
  assert.equal(game.boarded + game.waiting.length, game.state.queue.length);
  for (const trip of trips) assert.ok(trip.load <= trip.car.capacity);
}
function begin(game, id) {
  const result = game.begin(id);
  assert.equal(result.ok, true, id);
  consistent(game);
  return result.trip;
}
test('accepts another bus while the first bus is boarding, without rewinding later moves', () => {
  const game = new GameSession(createLevel(0));
  const [firstId, secondId] = game.state.solution;
  const first = begin(game, firstId);
  assert.equal(game.board(first, first.riders[0].id), true);
  const second = begin(game, secondId);
  assert.equal(game.trips.size, 2);
  assert.notEqual(first.bay, second.bay);
  assert.equal(game.boarded, 1);
  const latest = clone(game.state);
  game.finish(second); consistent(game);
  game.finish(first); consistent(game);
  assert.deepEqual(game.state, latest, 'older animation completion preserves the latest logical state');
  assert.equal(game.boarded, game.state.head);
  assert.equal(game.active, false);
});
test('two simultaneous buses of the same color reserve different passengers', () => {
  const initial = createLevel(0);
  const ids = ['bus-18', 'bus-17'];
  assert.equal(initial.buses.find(bus => bus.id === ids[0]).color, initial.buses.find(bus => bus.id === ids[1]).color);
  const game = new GameSession(initial);
  const first = begin(game, ids[0]), second = begin(game, ids[1]);
  assert.equal(new Set([...first.riders, ...second.riders].map(rider => rider.id)).size, first.riders.length + second.riders.length);
  for (let i = 0; i < first.riders.length; i++) {
    assert.equal(game.board(first, first.riders[i].id), true);
    assert.equal(game.board(second, second.riders[i].id), true);
    consistent(game);
  }
  game.finish(second); game.finish(first); consistent(game);
  assert.equal(game.boarded, 8);
});
test('uses one bay per active bus and immediately reuses a bay after departure', () => {
  const game = new GameSession(createLevel(0));
  const route = [...game.state.solution];
  const trips = route.slice(0, 5).map(id => begin(game, id));
  assert.equal(game.freeBay, -1);
  const before = clone(game.state);
  assert.deepEqual(game.begin(route[5]), { ok: false, reason: 'full' });
  assert.deepEqual(game.state, before);
  const freed = trips[2].bay;
  game.finish(trips[2]);
  assert.equal(begin(game, route[5]).bay, freed);
  game.state = addBay(game.state);
  assert.equal(begin(game, route[6]).bay, 5);
  consistent(game);
});
test('duplicate taps and duplicate boarding callbacks do not consume passengers twice', () => {
  const game = new GameSession(createLevel(0));
  const trip = begin(game, game.state.solution[0]);
  const before = clone(game.state), waiting = game.waiting.length;
  assert.equal(game.begin(trip.id).ok, false);
  assert.deepEqual(game.state, before);
  assert.equal(game.waiting.length, waiting);
  const riderId = trip.riders[0].id;
  assert.equal(game.board(trip, riderId), true);
  assert.equal(game.board(trip, riderId), false);
  game.finish(trip);
  assert.equal(game.finish(trip), false);
  assert.equal(game.board(trip, riderId), false);
  consistent(game);
});
test('all stages and shuffled stages clear in concurrent batches with reordered arrivals', () => {
  for (let stage = 0; stage < STAGES.length; stage++) for (const variant of [0, 2]) {
    const initial = createLevel(stage, variant), game = new GameSession(initial);
    for (let i = 0; i < initial.solution.length; i += 5) {
      const trips = initial.solution.slice(i, i + 5).map(id => begin(game, id));
      while (trips.some(trip => trip.boarded < trip.riders.length)) {
        for (const trip of [...trips].reverse()) {
          const rider = trip.riders[trip.boarded];
          if (rider) assert.equal(game.board(trip, rider.id), true);
          consistent(game);
        }
      }
      for (const trip of [...trips].reverse()) game.finish(trip);
      consistent(game);
    }
    assert.equal(status(game.state), 'won');
    assert.equal(game.active, false);
    assert.equal(game.boarded, game.state.queue.length);
    assert.deepEqual(game.waiting, []);
  }
});
test('restoring an undo snapshot rebuilds the remaining queue after simultaneous trips', () => {
  const game = new GameSession(createLevel(0));
  const first = begin(game, game.state.solution[0]);
  const undoSnapshot = clone(game.state);
  const second = begin(game, game.state.solution[1]);
  game.finish(second); game.finish(first);
  const restored = new GameSession(undoSnapshot);
  consistent(restored);
  assert.equal(restored.active, false);
  assert.equal(restored.boarded, undoSnapshot.head);
  assert.deepEqual(restored.waiting.map(rider => rider.color), undoSnapshot.waiting);
});
