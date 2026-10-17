import { COLORS, DIRECTIONS, STAGES, clone, createLevel, isAccessible, status, dispatch, solve, addBay } from './engine.mjs?v=6';
import { GameSession } from './session.mjs?v=6';
import { parkingSVG, exitVector, carStyle, miniCar } from './renderer.mjs?v=6';
const $ = id => document.getElementById(id);
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let game = new GameSession(createLevel(0)), state = game.state, history = [], hintId = null, sound = false, audio;
let parkingKey = '';
const queueAnimations = new WeakMap();
let cleared = new Set();
try {
  const saved = JSON.parse(localStorage.getItem('bus-buddies-jam-cleared-v2') || '[]');
  if (Array.isArray(saved)) cleared = new Set(saved.filter(x => Number.isInteger(x) && x >= 0 && x < STAGES.length));
} catch {}
function announce(text, notice = false) { $('message').textContent = text; $('message').classList.toggle('notice', notice); }
function riderArt(color) {
  return '<div class="rider" style="' + carStyle(color) + '" role="img" aria-label="' + COLORS[color].name + 'の乗客"><span class="rider-body"></span><span class="rider-symbol">' + COLORS[color].symbol + '</span></div>';
}
function renderQueue() {
  const queue = $('queue');
  const old = new Map([...queue.querySelectorAll('[data-rider]')].map(rider => [Number(rider.dataset.rider), { element: rider, rect: rider.getBoundingClientRect() }]));
  for (const { element } of old.values()) queueAnimations.get(element)?.cancel();
  const visible = game.waiting.slice(0, 26);
  const wanted = new Set(visible.map(rider => rider.id));
  for (const child of [...queue.children]) if (!wanted.has(Number(child.dataset.rider)) || !child.hasAttribute('data-rider')) child.remove();
  const flying = new Set([...game.trips.values()].map(trip => trip.flyingRider));
  visible.forEach((rider, index) => {
    let element = old.get(rider.id)?.element;
    if (!element) {
      const holder = document.createElement('div'); holder.innerHTML = riderArt(rider.color);
      element = holder.firstElementChild; element.dataset.rider = rider.id;
    }
    if (queue.children[index] !== element) queue.insertBefore(element, queue.children[index] || null);
    element.style.visibility = flying.has(rider.id) ? 'hidden' : '';
  });
  if (!visible.length) queue.innerHTML = '<span class="queue-done">みんな乗れました！</span>';
  if (!reduceMotion && Element.prototype.animate) for (const element of queue.querySelectorAll('[data-rider]')) {
    const previous = old.get(Number(element.dataset.rider));
    if (!previous || element.style.visibility === 'hidden') continue;
    const dx = previous.rect.left - element.getBoundingClientRect().left;
    if (Math.abs(dx) > .5) queueAnimations.set(element, element.animate([{ transform: 'translateX(' + dx + 'px)' }, { transform: 'translateX(0)' }], { duration: 160, easing: 'ease-out' }));
  }
}
function renderBays() {
  const bays = $('bays');
  const current = status(state);
  for (let index = 0; index < 7; index++) {
    const trip = [...game.trips.values()].find(trip => trip.bay === index);
    const car = trip ? { ...trip.car, load: trip.load } : state.buses.find(bus => bus.id === state.bays[index]);
    const locked = index >= state.bays.length;
    const key = locked ? 'locked' : car ? car.id : 'empty';
    let bay = bays.children[index];
    if (!bay || bay.dataset.key !== key) {
      const holder = document.createElement('div');
      if (locked) holder.innerHTML = '<button class="bay locked" data-expand aria-label="待機枠を1つ増やす（無料）"><span class="plus" aria-hidden="true">＋</span><small>無料で追加</small></button>';
      else if (!car) holder.innerHTML = '<div class="bay empty"><span class="bay-number">0' + (index + 1) + '</span></div>';
      else holder.innerHTML = '<div class="bay occupied" style="' + carStyle(car.color) + '"><span class="bay-number">0' + (index + 1) + '</span><span class="bay-vehicle">' + miniCar(car) + '</span><span class="bay-load"></span></div>';
      const next = holder.firstElementChild; next.dataset.key = key; next.dataset.bay = index;
      if (bay) bay.replaceWith(next); else bays.append(next);
      bay = next;
    }
    if (locked) { bay.disabled = current === 'won'; continue; }
    const incoming = trip?.phase === 'exiting';
    bay.classList.toggle('incoming', !!incoming);
    bay.dataset.phase = trip?.phase || 'idle';
    bay.setAttribute('aria-label', 'のりば' + (index + 1) + (car ? ' ' + COLORS[car.color].name + 'の車 ' + (incoming ? '移動中' : car.load + '人 / 定員' + car.capacity + '人') : ' 空き'));
    if (car) bay.querySelector('.bay-load').textContent = incoming ? '移動中' : car.load + ' / ' + car.capacity;
  }
  const occupied = new Set([...state.bays.map((id, index) => id ? index : -1).filter(index => index >= 0), ...[...game.trips.values()].map(trip => trip.bay)]);
  $('bay-count').textContent = '空き ' + (state.bays.length - occupied.size) + ' / ' + state.bays.length;
}
function render() {
  const spec = STAGES[state.stage], current = status(state), active = game.active;
  $('level-label').textContent = 'LEVEL ' + String(state.stage + 1).padStart(2, '0');
  $('stage-title').textContent = spec.title;
  $('boarded').textContent = game.boarded;
  $('rider-total').textContent = '/ ' + state.queue.length;
  $('rider-total').parentElement.setAttribute('aria-label', state.queue.length + '人中' + game.boarded + '人が乗車');
  renderQueue(); renderBays();
  $('car-count').textContent = 'のこり' + state.buses.filter(bus => bus.location === 'garage').length + '台';
  const full = game.freeBay < 0;
  const nextKey = [state.stage, state.variant, hintId, full, state.buses.filter(bus => bus.location === 'garage').map(bus => bus.id).join(',')].join('/');
  if (parkingKey !== nextKey) {
    $('garage').innerHTML = parkingSVG(state, hintId, full);
    parkingKey = nextKey;
  }
  $('garage').dataset.activeTrips = game.trips.size;
  $('stages').innerHTML = STAGES.map((stage, i) => '<button class="stage-choice' + (i === state.stage ? ' active' : '') + '" data-stage="' + i + '" aria-label="ステージ' + (i + 1) + ' ' + stage.title + '"' + (active ? ' disabled' : '') + '><span class="stage-number">' + (i + 1) + '</span><span>' + stage.title + '<br><small>' + stage.count + '台 / ' + stage.colors + '色</small></span><span class="stage-tick" aria-hidden="true">' + (cleared.has(i) ? '✓' : '') + '</span></button>').join('');
  $('desktop-stages').innerHTML = STAGES.map((stage, i) => '<button class="desktop-stage' + (i === state.stage ? ' active' : '') + (cleared.has(i) ? ' cleared' : '') + '" data-stage="' + i + '" aria-label="ステージ' + (i + 1) + ' ' + stage.title + '" aria-current="' + (i === state.stage ? 'step' : 'false') + '"' + (active ? ' disabled' : '') + '>' + (i + 1) + '</button>').join('');
  $('clear-count').textContent = 'クリア ' + cleared.size + ' / ' + STAGES.length;
  $('undo').disabled = active || !history.length;
  $('hint').disabled = current !== 'playing';
  $('shuffle').disabled = active;
  $('expand').disabled = state.bays.length >= 7 || current === 'won';
  $('expand-note').textContent = state.bays.length < 7 ? 'あと' + (7 - state.bays.length) + '枠増やせる' : '7枠すべて使用中';
  $('restart').disabled = active;
  $('settings').disabled = active;
  $('help').disabled = false;
  $('level-menu').disabled = active;
}
const delay = ms => new Promise(resolve => setTimeout(resolve, reduceMotion ? 0 : ms));
function tone(type) {
  if (!sound) return;
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    audio ||= new AudioCtx();
    if (audio.state === 'suspended') audio.resume().catch(() => {});
    const oscillator = audio.createOscillator(), gain = audio.createGain();
    oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(type === 'depart' ? 740 : type === 'board' ? 520 : 350, audio.currentTime);
    gain.gain.setValueAtTime(.035, audio.currentTime); gain.gain.exponentialRampToValueAtTime(.001, audio.currentTime + .12);
    oscillator.connect(gain); gain.connect(audio.destination); oscillator.start(); oscillator.stop(audio.currentTime + .13);
  } catch {}
}
// Keep the travelling rider outside the clipped queue and parking panels.
function transientEffect(element, frames, options) {
  $('boarding-effects').append(element);
  element.animate(frames, options).finished.catch(() => {}).finally(() => element.remove());
}
async function animateRider(trip, rider) {
  if (reduceMotion || !Element.prototype.animate) return null;
  const car = trip.car;
  const source = $('queue').querySelector('[data-rider="' + rider.id + '"]');
  const sourceRect = source?.getBoundingClientRect();
  const strip = $('queue').parentElement.getBoundingClientRect();
  const vehicle = $('bays').querySelector('[data-bay="' + trip.bay + '"] .mini-car');
  if (!vehicle) return false;
  trip.flyingRider = rider.id;
  const target = vehicle.getBoundingClientRect();
  const startX = Math.max(strip.left, Math.min(sourceRect?.left ?? strip.right - 24, strip.right - 24));
  const startY = sourceRect?.top ?? strip.bottom - 35;
  const dx = target.right - 7 - startX;
  const dy = target.top + target.height * .55 - 24 - startY;
  const holder = document.createElement('div');
  holder.innerHTML = riderArt(car.color);
  const traveller = holder.firstElementChild;
  traveller.classList.add('boarding-rider');
  traveller.removeAttribute('role'); traveller.removeAttribute('aria-label');
  traveller.style.left = startX + 'px'; traveller.style.top = startY + 'px';
  const visibleSource = !!source;
  const visibility = source?.style.visibility || '';
  if (visibleSource) source.style.visibility = 'hidden';
  $('boarding-effects').append(traveller);
  const lean = dx < 0 ? -9 : 9;
  try {
    await traveller.animate([
      { transform: 'translate(0,0) scale(1)', opacity: 1, offset: 0 },
      { transform: 'translate(' + dx * .18 + 'px,' + (dy * .12 - 12) + 'px) rotate(' + lean + 'deg) scale(1.18)', opacity: 1, offset: .25 },
      { transform: 'translate(' + dx * .8 + 'px,' + (dy * .65 - 9) + 'px) rotate(' + -lean + 'deg) scale(1.08)', opacity: 1, offset: .7 },
      { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(.3)', opacity: 0, offset: 1 }
    ], { duration: 320, easing: 'ease-in-out', fill: 'forwards' }).finished;
  } catch {} finally {
    traveller.remove();
    trip.flyingRider = null;
    if (source?.isConnected) source.style.visibility = visibility;
  }
  return true;
}
function boardingFeedback(trip) {
  if (reduceMotion || !Element.prototype.animate) return;
  const bay = $('bays').querySelector('[data-bay="' + trip.bay + '"]');
  const vehicle = bay?.querySelector('.mini-car');
  if (!vehicle) return;
  vehicle.animate([
    { transform: 'translateY(0) scale(1)' },
    { transform: 'translateY(2px) scale(1.14,.9)', offset: .35 },
    { transform: 'translateY(-2px) scale(.96,1.07)', offset: .7 },
    { transform: 'translateY(0) scale(1)' }
  ], { duration: 210, easing: 'ease-out' });
  $('boarded').animate([{ transform: 'scale(1)' }, { transform: 'scale(1.3)', color: '#ffe18a', offset: .4 }, { transform: 'scale(1)' }], { duration: 230 });
  const car = trip.car;
  const full = trip.load === car.capacity;
  const target = vehicle.getBoundingClientRect();
  const centerX = target.left + target.width / 2, centerY = target.top + 6;
  const badge = document.createElement('span');
  badge.className = 'boarding-badge' + (full ? ' boarding-full' : '');
  badge.style.cssText = carStyle(car.color) + ';left:' + centerX + 'px;top:' + centerY + 'px';
  badge.textContent = full ? '満員！' : '+1';
  transientEffect(badge, [
    { transform: 'translate(-50%,0) scale(.6)', opacity: 0 },
    { transform: 'translate(-50%,-15px) scale(1.12)', opacity: 1, offset: .3 },
    { transform: 'translate(-50%,-25px) scale(1)', opacity: 0 }
  ], { duration: full ? 650 : 430, easing: 'ease-out' });
  if (full) for (let i = 0; i < 5; i++) {
    const spark = document.createElement('span');
    spark.className = 'boarding-spark'; spark.textContent = '✦';
    spark.style.left = centerX + 'px'; spark.style.top = (target.top + 12) + 'px';
    const angle = -Math.PI + i * Math.PI / 4;
    transientEffect(spark, [
      { transform: 'translate(-50%,-50%) scale(.3)', opacity: 1 },
      { transform: 'translate(' + (Math.cos(angle) * 34 - 6) + 'px,' + (Math.sin(angle) * 30 - 6) + 'px) rotate(70deg) scale(1)', opacity: 0 }
    ], { duration: 480, easing: 'ease-out' });
  }
}
function exitArtwork(id) {
  const source = $('garage').querySelector('[data-bus="' + id + '"]');
  if (!source || reduceMotion || !source.animate) return null;
  const rect = source.ownerSVGElement.getBoundingClientRect();
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 600 600'); svg.classList.add('exiting-car');
  svg.style.cssText = 'left:' + rect.left + 'px;top:' + rect.top + 'px;width:' + rect.width + 'px;height:' + rect.height + 'px';
  const car = source.cloneNode(true);
  for (const attr of ['data-bus', 'tabindex', 'role', 'aria-disabled', 'aria-label']) car.removeAttribute(attr);
  svg.append(car);
  return { svg, car };
}
function finishRound(keyboard) {
  if (game.active) return;
  if (status(state) === 'won') {
    cleared.add(state.stage);
    try { localStorage.setItem('bus-buddies-jam-cleared-v2', JSON.stringify([...cleared])); } catch {}
    render(); showResult(true); celebrate();
  } else if (status(state) === 'lost') showResult(false);
  else {
    announce('同じ色なら、列のどこからでも乗れるよ！ 進路の空いた車を探そう。');
    if (keyboard && document.activeElement === document.body) {
      const target = state.buses.find(bus => isAccessible(state, bus.id));
      if (target) $('garage').querySelector('[data-bus="' + target.id + '"]')?.focus();
    }
  }
}
async function playTrip(trip, artwork, keyboard) {
  const round = game;
  try {
    if (artwork) {
      $('boarding-effects').append(artwork.svg);
      const vector = exitVector(trip.car, state.size);
      await artwork.car.animate([{ transform: 'translate(0px,0px)' }, { transform: 'translate(' + vector.x + 'px,' + vector.y + 'px)' }], { duration: 370, easing: 'cubic-bezier(.4,0,.6,1)', fill: 'forwards' }).finished.catch(() => {});
      artwork.svg.remove();
    }
    trip.phase = 'boarding'; render();
    $('bays').querySelector('[data-bay="' + trip.bay + '"] .bay-vehicle')?.classList.add('arriving');
    await delay(150);
    for (const rider of trip.riders) {
      const animated = await animateRider(trip, rider);
      round.board(trip, rider.id); render(); tone('board');
      if (animated) boardingFeedback(trip);
      await delay(trip.load === trip.car.capacity ? 160 : 45);
    }
    trip.phase = 'departing'; render();
    const vehicle = $('bays').querySelector('[data-bay="' + trip.bay + '"] .bay-vehicle');
    if (!reduceMotion && vehicle?.animate) await vehicle.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-70px)' }], { duration: 190, easing: 'ease-in', fill: 'forwards' }).finished.catch(() => {});
    tone('depart');
  } catch (error) {
    console.error('Could not animate boarding:', error);
  } finally {
    artwork?.svg.remove();
    round.finish(trip);
    if (game === round) {
      render();
      if (game.active) announce('乗り込み中も、ほかの車を続けて出せるよ！');
      else finishRound(keyboard);
    }
  }
}
function choose(id, keyboard = false) {
  const before = clone(state);
  const artwork = exitArtwork(id);
  const result = game.begin(id);
  if (!result.ok) {
    if (result.reason === 'blocked') {
      const car = state.buses.find(bus => bus.id === id);
      announce(DIRECTIONS[car.dir].name + 'の進路に別の車がいるよ。先にその車を動かそう。', true);
      const selected = $('garage').querySelector('[data-bus="' + id + '"]');
      selected?.classList.add('blocked-feedback');
      for (const blocker of result.blockers) $('garage').querySelector('[data-bus="' + blocker + '"]')?.classList.add('blocked-feedback');
      setTimeout(() => $('garage').querySelectorAll('.blocked-feedback').forEach(el => el.classList.remove('blocked-feedback')), 400);
    } else if (result.reason === 'full') announce('のりばがいっぱい！ 乗り込みが終わると、次の車を出せるよ。', true);
    return;
  }
  state = game.state; history.push(before); hintId = null; render();
  const car = result.trip.car;
  tone('move'); announce(COLORS[car.color].label + 'の車が、' + DIRECTIONS[car.dir].name + 'へ脱出！ ほかの車も続けて出せるよ。');
  if (keyboard) {
    const next = state.buses.find(bus => isAccessible(state, bus.id));
    if (next) $('garage').querySelector('[data-bus="' + next.id + '"]')?.focus();
  }
  playTrip(result.trip, artwork, keyboard);
}
function resetSession(next) { game = new GameSession(next); state = game.state; parkingKey = ''; $('boarding-effects').replaceChildren(); }
function closeDialogs() { for (const id of ['result-dialog', 'settings-dialog']) if ($(id).open) $(id).close(); }
function start(index, variant = 0) {
  if (game.active) return;
  closeDialogs(); resetSession(createLevel(index, variant)); history = []; hintId = null; render();
  announce('矢印の先が空いている車をタップ！ 同じ色の乗客がどこからでも乗ります。');
}
function undo() {
  if (game.active || !history.length) return;
  closeDialogs(); resetSession(history.pop()); hintId = null; render(); announce('1手戻しました。別の順番を試してみよう。');
}
function expand() {
  const next = addBay(state);
  if (!next) return;
  closeDialogs(); history.push(clone(state)); game.state = next; state = next; hintId = null; render();
  announce('待機枠を1つ増やしました！ のりばに余裕ができたよ。');
}
function shuffle() {
  if (game.active) return;
  history.push(clone(state)); resetSession(createLevel(state.stage, state.variant + 1)); hintId = null; render();
  announce('新しい配置にシャッフル！「1手戻す」で前の配置に戻せます。');
}
function hint() {
  const result = solve(state);
  if (result.status === 'solved' && result.path.length) {
    hintId = result.path[0]; render();
    const car = state.buses.find(b => b.id === hintId), color = COLORS[car.color];
    announce('光っている' + color.label + 'の車を' + DIRECTIONS[car.dir].name + 'へ出そう！');
  } else if (result.status === 'unsolvable') {
    announce('この順番では行き詰まりそう。「1手戻す」か「待機枠 +1」を使ってみよう。', true);
  } else announce('ヒントを探しきれませんでした。1手戻すか、待機枠を増やしてみよう。', true);
}
function showResult(won) {
  const last = state.stage === STAGES.length - 1;
  $('result-icon').textContent = won ? '🏁' : '🚧';
  $('result-kicker').textContent = won ? 'ALL ABOARD!' : 'A LITTLE TRAFFIC JAM.';
  $('result-title').textContent = won ? last ? 'すべての駐車場をクリア！' : 'みんな、出発！' : 'のりばがいっぱい！';
  $('result-text').textContent = won ? state.queue.length + '人全員が乗車しました。' + (last ? '好きなステージをシャッフルして、もう一度遊べます。' : 'つぎの駐車場にも挑戦してみよう。') : '車を出せなくなったみたい。1手戻して、進路を確かめてみよう。';
  $('result-primary').textContent = won ? last ? 'はじめから遊ぶ' : '次のステージへ' : '1手戻して続ける';
  $('result-secondary').textContent = won ? 'このステージをもう一度' : state.bays.length < 7 ? '待機枠を1つ増やして続ける' : 'このステージをやり直す';
  if (!$('result-dialog').open) $('result-dialog').showModal();
}
function celebrate() {
  if (reduceMotion) return;
  const colors = Object.values(COLORS);
  for (let i = 0; i < 24; i++) {
    const el = document.createElement('span'); el.className = 'confetti'; el.style.left = (5 + Math.random() * 90) + '%'; el.style.background = colors[i % colors.length].paint; el.style.animationDelay = (Math.random() * .6) + 's'; document.body.append(el); setTimeout(() => el.remove(), 3200);
  }
}
$('garage').addEventListener('click', event => { const car = event.target.closest('[data-bus]'); if (car) choose(car.dataset.bus, event.detail === 0); });
$('garage').addEventListener('keydown', event => { if (!['Enter', ' '].includes(event.key)) return; const car = event.target.closest('[data-bus]'); if (car) { event.preventDefault(); choose(car.dataset.bus, true); } });
document.addEventListener('click', event => { const stage = event.target.closest('[data-stage]'); if (stage) start(Number(stage.dataset.stage)); });
$('bays').addEventListener('click', event => { if (event.target.closest('[data-expand]')) expand(); });
$('undo').addEventListener('click', undo);
$('hint').addEventListener('click', hint);
$('shuffle').addEventListener('click', shuffle);
$('expand').addEventListener('click', expand);
$('restart').addEventListener('click', () => start(state.stage, state.variant));
$('sound').addEventListener('click', () => { sound = !sound; $('sound').setAttribute('aria-pressed', String(sound)); $('sound').setAttribute('aria-label', sound ? '音をオフにする' : '音をオンにする'); $('sound').textContent = sound ? '♪ ON' : '♪ OFF'; if (sound) tone('move'); });
for (const id of ['settings', 'level-menu']) $(id).addEventListener('click', () => { if (!$('settings-dialog').open) $('settings-dialog').showModal(); });
$('settings-close').addEventListener('click', () => $('settings-dialog').close());
$('help').addEventListener('click', () => { if (!$('help-dialog').open) $('help-dialog').showModal(); });
$('help-close').addEventListener('click', () => $('help-dialog').close());
$('help-play').addEventListener('click', () => $('help-dialog').close());
$('result-primary').addEventListener('click', () => { if (status(state) === 'won') start((state.stage + 1) % STAGES.length); else undo(); });
$('result-secondary').addEventListener('click', () => { if (status(state) === 'lost' && state.bays.length < 7) expand(); else start(state.stage, state.variant); });
$('result-dialog').addEventListener('cancel', () => announce(status(state) === 'won' ? 'クリア！ ステージを選んで、もう一度遊べます。' : '「1手戻す」か「待機枠 +1」で続けよう。'));
render();
