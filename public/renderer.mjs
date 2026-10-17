import { COLORS, DIRECTIONS, cellsFor, isAccessible } from './engine.mjs?v=2';
const round = n => Math.round(n * 100) / 100;
export function project(x, y, z = 0, size = 8) {
  return { x: 300 + (x - y) * 258 / size, y: 48 + (x + y) * 146 / size - z };
}
function points(vertices) { return vertices.map(v => round(v.x) + ',' + round(v.y)).join(' '); }
function polygon(vertices, fill, extra = '') { return '<polygon points="' + points(vertices) + '" fill="' + fill + '" ' + extra + '/>'; }
function rect3d(x, y, w, h, bottom, top, color, side, size) {
  const p = (a, b, z) => project(a, b, z, size);
  return polygon([p(x + w, y, bottom), p(x + w, y + h, bottom), p(x + w, y + h, top), p(x + w, y, top)], side) +
    polygon([p(x, y + h, bottom), p(x + w, y + h, bottom), p(x + w, y + h, top), p(x, y + h, top)], side) +
    polygon([p(x, y, top), p(x + w, y, top), p(x + w, y + h, top), p(x, y + h, top)], color, 'stroke="#fff" stroke-opacity=".25" stroke-width=".8"');
}
function localPoint(car, u, v, z, size) {
  const d = DIRECTIONS[car.dir], horizontal = d.dx !== 0;
  const cx = car.x + (horizontal ? car.length : 1) / 2, cy = car.y + (horizontal ? 1 : car.length) / 2;
  return project(cx + d.dx * u - d.dy * v, cy + d.dy * u + d.dx * v, z, size);
}
function carSVG(car, size, hint, busy) {
  const c = COLORS[car.color], d = DIRECTIONS[car.dir], horizontal = d.dx !== 0;
  const box = { x: car.x + .09, y: car.y + .09, w: horizontal ? car.length - .18 : .82, h: horizontal ? .82 : car.length - .18 };
  const len = car.length - .18, p = (u, v, z) => localPoint(car, u, v, z, size);
  const center = p(0, 0, 25);
  const accessibleText = car.accessible ? '出せます' : '前に別の車がいます';
  const label = c.name + 'の' + (car.length === 3 ? 'バス' : '車') + ' ' + car.capacity + '人乗り・' + d.name + '向き（車' + (Number(car.id.slice(4)) + 1) + '）：' + accessibleText;
  let body = '<g class="vehicle' + (hint ? ' hinted' : '') + '" role="button" tabindex="' + (busy ? '-1' : '0') + '" aria-label="' + label + '" aria-disabled="' + busy + '" data-bus="' + car.id + '"><title>' + label + '</title>';
  body += polygon([p(-len / 2, -.42, 0), p(len / 2, -.42, 0), p(len / 2, .42, 0), p(-len / 2, .42, 0)], '#394357', 'opacity=".2" transform="translate(0,5)"');
  for (const u of [-len * .32, len * .32]) for (const v of [-.43, .43]) {
    const wheel = p(u, v, 4);
    body += '<ellipse cx="' + round(wheel.x) + '" cy="' + round(wheel.y) + '" rx="4.5" ry="5.4" fill="#25334c"/><ellipse cx="' + round(wheel.x) + '" cy="' + round(wheel.y) + '" rx="2" ry="2.6" fill="#8d9caf"/>';
  }
  body += rect3d(box.x, box.y, box.w, box.h, 5, 16, c.paint, c.dark, size);
  const roofLength = car.length === 3 ? 1.65 : .88;
  const roofCenter = -.15;
  const roofRect = horizontal
    ? { x: car.x + car.length / 2 + d.dx * roofCenter - roofLength / 2, y: car.y + .2, w: roofLength, h: .6 }
    : { x: car.x + .2, y: car.y + car.length / 2 + d.dy * roofCenter - roofLength / 2, w: .6, h: roofLength };
  body += rect3d(roofRect.x, roofRect.y, roofRect.w, roofRect.h, 16, 28, '#ffffff', c.paint, size);
  const front = roofCenter + roofLength / 2, rear = roofCenter - roofLength / 2;
  body += polygon([p(front, -.29, 28), p(front, .29, 28), p(front + .25, .34, 16.5), p(front + .25, -.34, 16.5)], '#294e83', 'stroke="#eaf6ff" stroke-width="1.4"');
  body += polygon([p(rear, -.29, 28), p(rear, .29, 28), p(rear - .15, .34, 16.5), p(rear - .15, -.34, 16.5)], '#88d8f5', 'stroke="#eaf6ff" stroke-width="1"');
  body += polygon([p(rear + .08, -.26, 28.6), p(front - .08, -.26, 28.6), p(front - .08, .26, 28.6), p(rear + .08, .26, 28.6)], c.paint);
  for (const side of [-.24, .24]) {
    const light = p(len / 2 + .01, side, 11);
    body += '<ellipse cx="' + round(light.x) + '" cy="' + round(light.y) + '" rx="2.5" ry="1.8" fill="#fff9ce"/>';
  }
  const arrowCenter = p(-.1, 0, 29);
  body += '<text class="direction-arrow" x="' + round(arrowCenter.x) + '" y="' + round(arrowCenter.y + 4) + '" text-anchor="middle" fill="#fff" font-size="15" font-weight="900" aria-hidden="true">' + d.arrow + '</text>';
  const badge = p(-len * .31, 0, 29);
  body += '<circle cx="' + round(badge.x) + '" cy="' + round(badge.y) + '" r="6.2" fill="' + c.dark + '"/><text x="' + round(badge.x) + '" y="' + round(badge.y + 2.7) + '" text-anchor="middle" fill="#fff" font-size="7.5" font-family="sans-serif" aria-hidden="true">' + car.capacity + '</text>';
  if (hint) body += '<ellipse class="hint-ring" cx="' + round(center.x) + '" cy="' + round(center.y + 7) + '" rx="' + (horizontal ? 38 : 33) + '" ry="26" fill="none" stroke="#fff174" stroke-width="4" pointer-events="none"/>';
  body += '</g>';
  return body;
}
export function parkingSVG(state, hintId, busy = false) {
  const size = state.size;
  let grid = '';
  for (let i = 0; i <= size; i++) {
    for (const ends of [[[i, 0], [i, size]], [[0, i], [size, i]]]) {
      const a = project(...ends[0], 0, size), b = project(...ends[1], 0, size);
      grid += '<path d="M' + round(a.x) + ' ' + round(a.y) + 'L' + round(b.x) + ' ' + round(b.y) + '" stroke="#c6ced9" stroke-width="1" opacity=".7"/>';
    }
  }
  const vehicles = state.buses.filter(b => b.location === 'garage').map(b => ({ ...b, accessible: isAccessible(state, b.id) }));
  vehicles.sort((a, b) => (a.x + a.y + a.length / 2) - (b.x + b.y + b.length / 2));
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 390" class="parking-svg" aria-label="いろいろな向きの車が詰まった駐車場">' +
    '<defs><linearGradient id="lot-ground" x2="0" y2="1"><stop stop-color="#e6eaf0"/><stop offset="1" stop-color="#d4dce6"/></linearGradient></defs>' +
    '<rect x="9" y="8" width="582" height="373" rx="29" fill="#b7c2d0"/><rect x="7" y="3" width="586" height="371" rx="29" fill="url(#lot-ground)" stroke="#f8fbff" stroke-width="4"/>' +
    '<path d="M28 363H572" stroke="#b8c5d4" stroke-width="4" stroke-linecap="round"/>' +
    '<text x="38" y="43" fill="#b5c1d0" font-family="sans-serif" font-size="21" font-weight="900" aria-hidden="true">P</text>' +
    '<text x="551" y="339" fill="#b5c1d0" font-family="sans-serif" font-size="21" font-weight="900" aria-hidden="true">P</text>' +
    grid + vehicles.map(car => carSVG(car, size, car.id === hintId, busy)).join('') + '</svg>';
}
export function exitVector(car, size) {
  const d = DIRECTIONS[car.dir], distance = size + 3;
  return { x: (d.dx - d.dy) * 258 / size * distance, y: (d.dx + d.dy) * 146 / size * distance };
}
export function carStyle(color) {
  const c = COLORS[color];
  return '--paint:' + c.paint + ';--dark:' + c.dark + ';--pale:' + c.pale;
}
export function miniCar(car) {
  const c = COLORS[car.color];
  return '<span class="mini-car" aria-hidden="true"><i class="mini-window"></i><i class="mini-roof">' + c.symbol + '</i><i class="mini-lights"></i></span>';
}
