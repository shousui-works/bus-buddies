import { clone, dispatch } from './engine.mjs?v=6';

// Commit moves immediately; each trip owns its presentation and reserved passengers.
// Finishing an older animation must never restore an older game snapshot.
export class GameSession {
  constructor(initial) {
    this.state = clone(initial);
    this.trips = new Map();
    const boarded = new Map();
    for (const car of initial.buses) boarded.set(car.color, (boarded.get(car.color) || 0) + car.load);
    this.waiting = initial.queue.flatMap((color, id) => {
      const count = boarded.get(color) || 0;
      if (count) { boarded.set(color, count - 1); return []; }
      return [{ id, color, trip: null }];
    });
  }
  get active() { return this.trips.size > 0; }
  get boarded() { return this.state.queue.length - this.waiting.length; }
  get freeBay() {
    return this.state.bays.findIndex((id, index) => !id && ![...this.trips.values()].some(trip => trip.bay === index));
  }
  begin(id) {
    const car = this.state.buses.find(bus => bus.id === id);
    const result = dispatch(this.state, id, false);
    if (!result.ok) return result;
    const bay = this.freeBay;
    if (bay < 0) return { ok: false, reason: 'full' };
    const after = result.state.buses.find(bus => bus.id === id);
    const riders = this.waiting.filter(rider => rider.trip === null && rider.color === car.color).slice(0, after.load - car.load);
    if (riders.length !== after.load - car.load) throw new Error('Missing passengers for trip');
    const trip = { id, bay, car: clone(car), riders, boarded: 0, load: car.load, phase: 'exiting', flyingRider: null };
    for (const rider of riders) rider.trip = id;
    this.trips.set(id, trip);
    this.state = result.state;
    return { ok: true, trip };
  }
  board(trip, riderId) {
    if (this.trips.get(trip.id) !== trip || trip.riders[trip.boarded]?.id !== riderId) return false;
    const index = this.waiting.findIndex(rider => rider.id === riderId && rider.trip === trip.id);
    if (index < 0) return false;
    this.waiting.splice(index, 1);
    trip.boarded++; trip.load++;
    return true;
  }
  finish(trip) {
    if (this.trips.get(trip.id) !== trip) return false;
    while (trip.boarded < trip.riders.length) this.board(trip, trip.riders[trip.boarded].id);
    this.trips.delete(trip.id);
    return true;
  }
}
