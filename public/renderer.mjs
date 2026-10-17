import { COLORS, DIRECTIONS, exitPath, isAccessible } from './engine.mjs?v=3';

const VIEW_SIZE = 600;
const PADDING = 20;
const SPAN = VIEW_SIZE - PADDING * 2;
const round = value => Math.round(value * 100) / 100;

export function project(x, y, size = 8) {
  const cell = SPAN / size;
  return { x: PADDING + x * cell, y: PADDING + y * cell };
}

function vehicleSVG(car, size, hinted, busy) {
  const cell = SPAN / size;
  const direction = DIRECTIONS[car.dir];
  const horizontal = direction.dx !== 0;
  const center = project(car.x + (horizontal ? car.length : 1) / 2, car.y + (horizontal ? 1 : car.length) / 2, size);
  const angle = { N: 0, E: 90, S: 180, W: 270 }[car.dir];
  const width = cell * .79;
  const length = cell * (car.length - .16);
  const left = -width / 2, top = -length / 2;
  const color = COLORS[car.color];
  const type = car.length === 3 ? 'バス' : '車';
  const label = color.name + 'の' + type + ' ' + car.capacity + '人乗り・' + direction.name + '向き（車' + (Number(car.id.slice(4)) + 1) + '）：' + (car.accessible ? '出せます' : '前に別の車がいます');
  const point = value => round(value);
  const wheelWidth = cell * .075, wheelHeight = cell * .22;
  const windowWidth = width * .72, windowHeight = cell * .16;
  const arrowScale = cell / 65;
  const badgeY = length / 2 - cell * .24;
  const radius = cell * .13;
  let svg = '<g class="vehicle' + (hinted ? ' hinted' : '') + '" role="button" tabindex="' + (busy ? '-1' : '0') + '" aria-label="' + label + '" aria-disabled="' + busy + '" data-bus="' + car.id + '" data-direction="' + car.dir + '"><title>' + label + '</title>';

  const hit = project(car.x + .015, car.y + .015, size);
  svg += '<rect class="vehicle-hit" x="' + point(hit.x) + '" y="' + point(hit.y) + '" width="' + point(cell * ((horizontal ? car.length : 1) - .03)) + '" height="' + point(cell * ((horizontal ? 1 : car.length) - .03)) + '" fill="transparent"/>';
  svg += '<g transform="translate(' + point(center.x) + ',' + point(center.y) + ') rotate(' + angle + ')" pointer-events="none">';
  svg += '<rect x="' + point(left + 1) + '" y="' + point(top + 4) + '" width="' + point(width) + '" height="' + point(length) + '" rx="' + point(cell * .13) + '" fill="#14283c" opacity=".12"/>';
  for (const y of [-length * .32, length * .32]) {
    for (const x of [-width / 2 - wheelWidth * .6, width / 2 - wheelWidth * .4]) {
      svg += '<rect x="' + point(x) + '" y="' + point(y - wheelHeight / 2) + '" width="' + point(wheelWidth) + '" height="' + point(wheelHeight) + '" rx="2.5" fill="#33445b"/>';
    }
  }
  svg += '<rect class="vehicle-body" x="' + point(left) + '" y="' + point(top) + '" width="' + point(width) + '" height="' + point(length) + '" rx="' + point(cell * .12) + '" fill="' + color.paint + '" stroke="' + color.dark + '" stroke-width="1.7"/>';
  svg += '<rect x="' + point(left + 3) + '" y="' + point(top + 3) + '" width="' + point(width - 6) + '" height="' + point(length - 6) + '" rx="' + point(cell * .09) + '" fill="none" stroke="#fff" stroke-opacity=".42" stroke-width="1.4"/>';
  svg += '<rect x="' + point(-windowWidth / 2) + '" y="' + point(top + cell * .13) + '" width="' + point(windowWidth) + '" height="' + point(windowHeight) + '" rx="' + point(cell * .035) + '" fill="#24466e" stroke="#e3f5ff" stroke-width="1.8"/>';
  svg += '<path d="M' + point(-windowWidth / 2 + 4) + ' ' + point(top + cell * .16) + 'H' + point(windowWidth / 2 - 4) + '" stroke="#8fd9f0" stroke-width="2" stroke-linecap="round" opacity=".8"/>';
  const rearY = length / 2 - cell * .12;
  for (const x of [-width * .34, width * .34]) {
    svg += '<rect x="' + point(x - cell * .055) + '" y="' + point(top + cell * .035) + '" width="' + point(cell * .11) + '" height="' + point(cell * .045) + '" rx="1.5" fill="#fff8c9"/>';
    svg += '<rect x="' + point(x - cell * .055) + '" y="' + point(rearY) + '" width="' + point(cell * .11) + '" height="' + point(cell * .045) + '" rx="1.5" fill="#9e3751"/>';
  }
  const roofY = -length / 2 + cell * .42;
  const roofH = length - cell * .86;
  svg += '<rect x="' + point(-width * .34) + '" y="' + point(roofY) + '" width="' + point(width * .68) + '" height="' + point(roofH) + '" rx="' + point(cell * .065) + '" fill="' + color.dark + '" opacity=".13"/>';
  svg += '<g transform="translate(0,-' + point(cell * .015) + ') scale(' + point(arrowScale) + ')"><path d="M0 15V-14M-10-4L0-15L10-4" fill="none" stroke="' + color.dark + '" stroke-opacity=".3" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/><path d="M0 15V-14M-10-4L0-15L10-4" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></g>';
  svg += '<g transform="translate(0,' + point(badgeY) + ') rotate(' + (-angle) + ')"><rect x="' + point(-cell * .23) + '" y="' + point(-radius) + '" width="' + point(cell * .46) + '" height="' + point(radius * 2) + '" rx="' + point(radius) + '" fill="#fff" fill-opacity=".94"/><text x="0" y="' + point(cell * .048) + '" text-anchor="middle" fill="#233555" font-size="' + point(cell * .145) + '" font-weight="800" font-family="sans-serif">' + color.symbol + ' ' + car.capacity + '</text></g>';
  svg += '<rect class="vehicle-outline' + (hinted ? ' hint-ring' : '') + '" x="' + point(left - 3) + '" y="' + point(top - 3) + '" width="' + point(width + 6) + '" height="' + point(length + 6) + '" rx="' + point(cell * .15) + '" fill="none" stroke="' + (hinted ? '#315dca' : 'transparent') + '" stroke-width="4"/>';
  return svg + '</g></g>';
}

export function parkingSVG(state, hintId, busy = false) {
  const cell = SPAN / state.size;
  let grid = '';
  for (let i = 0; i <= state.size; i++) {
    const position = round(PADDING + i * cell);
    grid += '<path d="M' + position + ' ' + PADDING + 'V' + (VIEW_SIZE - PADDING) + 'M' + PADDING + ' ' + position + 'H' + (VIEW_SIZE - PADDING) + '" fill="none" stroke="#cbd6e2" stroke-width="1.2"/>';
  }
  let guide = '';
  const hint = state.buses.find(car => car.id === hintId && car.location === 'garage');
  if (hint) {
    for (const position of exitPath(hint, state.size)) {
      const p = project(position.x, position.y, state.size);
      guide += '<rect x="' + round(p.x + 2) + '" y="' + round(p.y + 2) + '" width="' + round(cell - 4) + '" height="' + round(cell - 4) + '" rx="5" fill="#bbd3ff" opacity=".8"/>';
    }
  }
  const vehicles = state.buses.filter(car => car.location === 'garage').map(car => ({ ...car, accessible: isAccessible(state, car.id) }));
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" class="parking-svg" aria-label="真上から見た駐車場。車は上下左右の矢印へ進みます">' +
    '<rect x="4" y="4" width="592" height="592" rx="20" fill="#f4f7fb" stroke="#c0cddd" stroke-width="3"/>' +
    '<rect x="' + PADDING + '" y="' + PADDING + '" width="' + SPAN + '" height="' + SPAN + '" rx="3" fill="#e8eef5"/>' +
    grid + guide + vehicles.map(car => vehicleSVG(car, state.size, car.id === hintId, busy)).join('') + '</svg>';
}

export function exitVector(car, size) {
  const direction = DIRECTIONS[car.dir];
  const distance = (size + 3) * SPAN / size;
  return { x: direction.dx * distance, y: direction.dy * distance };
}

export function carStyle(color) {
  const c = COLORS[color];
  return '--paint:' + c.paint + ';--dark:' + c.dark + ';--pale:' + c.pale;
}

export function miniCar(car) {
  const c = COLORS[car.color];
  return '<span class="mini-car" aria-hidden="true"><i class="mini-window"></i><i class="mini-roof">' + c.symbol + '</i><i class="mini-lights"></i></span>';
}
