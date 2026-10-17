import { COLORS, DIRECTIONS, STAGES, clone, createLevel, isAccessible, status, dispatch, solve, addBay } from './engine.mjs?v=5';
import { parkingSVG, exitVector, carStyle, miniCar } from './renderer.mjs?v=5';
const $ = id => document.getElementById(id);
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let state = createLevel(0), history = [], busy = false, hintId = null, sound = false, audio;
let cleared = new Set();
try {
  const saved = JSON.parse(localStorage.getItem('bus-buddies-jam-cleared-v2') || '[]');
  if (Array.isArray(saved)) cleared = new Set(saved.filter(x => Number.isInteger(x) && x >= 0 && x < STAGES.length));
} catch {}
function announce(text, notice = false) { $('message').textContent = text; $('message').classList.toggle('notice', notice); }
function riderArt(color) {
  return '<div class="rider" style="' + carStyle(color) + '" role="img" aria-label="' + COLORS[color].name + 'の乗客"><span class="rider-body"></span><span class="rider-symbol">' + COLORS[color].symbol + '</span></div>';
}
function render() {
  const spec = STAGES[state.stage], current = status(state);
  $('level-label').textContent = 'LEVEL ' + String(state.stage + 1).padStart(2, '0');
  $('stage-title').textContent = spec.title;
  $('boarded').textContent = state.head;
  $('rider-total').textContent = '/ ' + state.queue.length;
  $('rider-total').parentElement.setAttribute('aria-label', state.queue.length + '人中' + state.head + '人が乗車');
  const remaining = state.waiting;
  $('queue').innerHTML = remaining.length ? remaining.slice(0, 26).map(color => riderArt(color)).join('') : '<span class="queue-done">みんな乗れました！</span>';
  $('bay-count').textContent = '空き ' + state.bays.filter(id => !id).length + ' / ' + state.bays.length;
  $('bays').innerHTML = Array.from({ length: 7 }, (_, i) => {
    if (i >= state.bays.length) return '<button class="bay locked" data-expand aria-label="待機枠を1つ増やす（無料）"' + (busy || current === 'won' ? ' disabled' : '') + '><span class="plus" aria-hidden="true">＋</span><small>無料で追加</small></button>';
    const id = state.bays[i], car = state.buses.find(b => b.id === id);
    if (!car) return '<div class="bay empty" data-bay="' + i + '" aria-label="のりば' + (i + 1) + ' 空き"><span class="bay-number">0' + (i + 1) + '</span></div>';
    return '<div class="bay occupied" data-bay="' + i + '" style="' + carStyle(car.color) + '" aria-label="のりば' + (i + 1) + ' ' + COLORS[car.color].name + 'の車 ' + car.load + '人 / 定員' + car.capacity + '人"><span class="bay-number">0' + (i + 1) + '</span><span class="bay-vehicle">' + miniCar(car) + '</span><span class="bay-load">' + car.load + ' / ' + car.capacity + '</span></div>';
  }).join('');
  $('car-count').textContent = 'のこり' + state.buses.filter(b => b.location === 'garage').length + '台';
  $('garage').innerHTML = parkingSVG(state, hintId, busy);
  if (busy) $('garage').setAttribute('aria-busy', 'true'); else $('garage').removeAttribute('aria-busy');
  $('stages').innerHTML = STAGES.map((stage, i) => '<button class="stage-choice' + (i === state.stage ? ' active' : '') + '" data-stage="' + i + '" aria-label="ステージ' + (i + 1) + ' ' + stage.title + '"' + (busy ? ' disabled' : '') + '><span class="stage-number">' + (i + 1) + '</span><span>' + stage.title + '<br><small>' + stage.count + '台 / ' + stage.colors + '色</small></span><span class="stage-tick" aria-hidden="true">' + (cleared.has(i) ? '✓' : '') + '</span></button>').join('');
  $('desktop-stages').innerHTML = STAGES.map((stage, i) => '<button class="desktop-stage' + (i === state.stage ? ' active' : '') + (cleared.has(i) ? ' cleared' : '') + '" data-stage="' + i + '" aria-label="ステージ' + (i + 1) + ' ' + stage.title + '" aria-current="' + (i === state.stage ? 'step' : 'false') + '"' + (busy ? ' disabled' : '') + '>' + (i + 1) + '</button>').join('');
  $('clear-count').textContent = 'クリア ' + cleared.size + ' / ' + STAGES.length;
  $('undo').disabled = busy || !history.length;
  $('hint').disabled = busy || current !== 'playing';
  $('shuffle').disabled = busy;
  $('expand').disabled = busy || state.bays.length >= 7 || current === 'won';
  $('expand-note').textContent = state.bays.length < 7 ? 'あと' + (7 - state.bays.length) + '枠増やせる' : '7枠すべて使用中';
  $('restart').disabled = busy;
  $('settings').disabled = busy;
  $('help').disabled = busy;
  $('level-menu').disabled = busy;
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
async function animateRider(event) {
  if (reduceMotion || !Element.prototype.animate) return null;
  const car = event.state.buses.find(bus => bus.id === event.id);
  const index = state.waiting.indexOf(car.color);
  const riders = [...$('queue').children];
  const positions = riders.map(rider => rider.getBoundingClientRect());
  const source = riders[index];
  const sourceRect = positions[index];
  const strip = $('queue').parentElement.getBoundingClientRect();
  const vehicle = $('bays').querySelector('[data-bay="' + event.bay + '"] .mini-car');
  if (!vehicle || index < 0) return null;
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
  const visibleSource = sourceRect && sourceRect.left >= strip.left && sourceRect.right < strip.right - 8;
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
    if (source?.isConnected) source.style.visibility = visibility;
  }
  return { index, positions };
}
function boardingFeedback(event, previous) {
  if (!previous || reduceMotion) return;
  // Close only the gap left by the boarding passenger; everyone else keeps their order.
  [...$('queue').children].forEach((rider, index) => {
    const old = previous.positions[index >= previous.index ? index + 1 : index];
    if (!old) return;
    const dx = old.left - rider.getBoundingClientRect().left;
    if (dx) rider.animate([{ transform: 'translateX(' + dx + 'px)' }, { transform: 'translateX(0)' }], { duration: 160, easing: 'ease-out' });
  });
  const bay = $('bays').querySelector('[data-bay="' + event.bay + '"]');
  const vehicle = bay?.querySelector('.mini-car');
  if (!vehicle) return;
  vehicle.animate([
    { transform: 'translateY(0) scale(1)' },
    { transform: 'translateY(2px) scale(1.14,.9)', offset: .35 },
    { transform: 'translateY(-2px) scale(.96,1.07)', offset: .7 },
    { transform: 'translateY(0) scale(1)' }
  ], { duration: 210, easing: 'ease-out' });
  $('boarded').animate([{ transform: 'scale(1)' }, { transform: 'scale(1.3)', color: '#ffe18a', offset: .4 }, { transform: 'scale(1)' }], { duration: 230 });
  const car = event.state.buses.find(bus => bus.id === event.id);
  const full = car.load === car.capacity;
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
async function choose(id, keyboard = false) {
  if (busy) return;
  const result = dispatch(state, id);
  if (!result.ok) {
    if (result.reason === 'blocked') {
      const car = state.buses.find(b => b.id === id);
      announce(DIRECTIONS[car.dir].name + 'の進路に別の車がいるよ。先にその車を動かそう。', true);
      const selected = document.querySelector('[data-bus="' + id + '"]');
      selected?.classList.add('blocked-feedback');
      for (const blocker of result.blockers) document.querySelector('[data-bus="' + blocker + '"]')?.classList.add('blocked-feedback');
      setTimeout(() => document.querySelectorAll('.blocked-feedback').forEach(el => el.classList.remove('blocked-feedback')), 400);
    }
    return;
  }
  history.push(clone(state)); hintId = null; busy = true; render();
  const selected = document.querySelector('[data-bus="' + id + '"]'), car = state.buses.find(b => b.id === id);
  const vector = exitVector(car, state.size);
  tone('move');
  announce(COLORS[car.color].label + 'の車が、' + DIRECTIONS[car.dir].name + 'へ脱出！');
  if (selected?.animate && !reduceMotion) {
    await selected.animate([{ transform: 'translate(0px,0px)' }, { transform: 'translate(' + vector.x + 'px,' + vector.y + 'px)' }], { duration: 370, fill: 'forwards', easing: 'cubic-bezier(.4,0,.6,1)' }).finished.catch(() => {});
  }
  for (const event of result.events) {
    const boarding = event.type === 'board' ? await animateRider(event) : null;
    if (event.type === 'depart' && !reduceMotion) {
      const vehicle = $('bays').querySelector('[data-bay="' + event.bay + '"] .bay-vehicle');
      if (vehicle?.animate) await vehicle.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-70px)' }], { duration: 190, fill: 'forwards', easing: 'ease-in' }).finished.catch(() => {});
    }
    state = event.state; render();
    if (event.type === 'move') {
      $('bays').querySelector('[data-bay="' + event.bay + '"] .bay-vehicle')?.classList.add('arriving');
      await delay(180);
    }
    if (event.type === 'board') {
      tone('board'); boardingFeedback(event, boarding);
      const boarded = event.state.buses.find(bus => bus.id === event.id);
      await delay(boarded.load === boarded.capacity ? 160 : 45);
    }
    if (event.type === 'depart') {
      tone('depart'); announce(COLORS[state.buses.find(b => b.id === event.id).color].label + 'の車が満員で出発！'); await delay(100);
    }
  }
  state = result.state; busy = false; render();
  if (status(state) === 'won') {
    cleared.add(state.stage);
    try { localStorage.setItem('bus-buddies-jam-cleared-v2', JSON.stringify([...cleared])); } catch {}
    render(); showResult(true); celebrate();
  } else if (status(state) === 'lost') showResult(false);
  else {
    announce('同じ色なら、列のどこからでも乗れるよ！ 進路の空いた車を探そう。');
    if (keyboard) {
      const target = state.buses.find(b => isAccessible(state, b.id));
      if (target) document.querySelector('[data-bus="' + target.id + '"]')?.focus();
    }
  }
}
function closeDialogs() { for (const id of ['result-dialog', 'settings-dialog']) if ($(id).open) $(id).close(); }
function start(index, variant = 0) {
  if (busy) return;
  closeDialogs(); state = createLevel(index, variant); history = []; hintId = null; render();
  announce('矢印の先が空いている車をタップ！ 同じ色の乗客がどこからでも乗ります。');
}
function undo() {
  if (busy || !history.length) return;
  closeDialogs(); state = history.pop(); hintId = null; render(); announce('1手戻しました。別の順番を試してみよう。');
}
function expand() {
  if (busy) return;
  const next = addBay(state);
  if (!next) return;
  closeDialogs(); history.push(clone(state)); state = next; hintId = null; render();
  announce('待機枠を1つ増やしました！ のりばに余裕ができたよ。');
}
function shuffle() {
  if (busy) return;
  history.push(clone(state)); state = createLevel(state.stage, state.variant + 1); hintId = null; render();
  announce('新しい配置にシャッフル！「1手戻す」で前の配置に戻せます。');
}
function hint() {
  if (busy) return;
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
