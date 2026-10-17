import { COLORS, STAGES, clone, createLevel, isAccessible, status, dispatch, solve } from './engine.mjs';
const $ = id => document.getElementById(id);
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let state = createLevel(0), history = [], busy = false, hintId = null, sound = false, audio;
let cleared = new Set();
try { const value = JSON.parse(localStorage.getItem('bus-buddies-cleared') || '[]'); if (Array.isArray(value)) cleared = new Set(value.filter(x => Number.isInteger(x) && x >= 0 && x < STAGES.length)); } catch {}
function colorStyle(color) { const c = COLORS[color]; return '--paint:' + c.paint + ';--dark:' + c.dark + ';--pale:' + c.pale; }
function busArt(bus) {
  return '<span class="bus-figure" aria-hidden="true"><span class="bus-arrow">↑</span><span class="bus-window"></span><span class="bus-roof"><span class="bus-symbol">' + COLORS[bus.color].symbol + '</span></span><span class="bus-lights"></span></span>';
}
function riderArt(color, first) {
  return '<div class="rider' + (first ? ' first' : '') + '" style="' + colorStyle(color) + '" role="img" aria-label="' + (first ? '先頭：' : '') + COLORS[color].name + 'の乗客"><span class="rider-body"></span><span class="rider-symbol">' + COLORS[color].symbol + '</span></div>';
}
function announce(text, notice = false) { $('message').textContent = text; $('message').classList.toggle('notice', notice); }
function render() {
  const spec = STAGES[state.stage];
  $('stage-pill').textContent = 'STAGE ' + String(state.stage + 1).padStart(2, '0');
  $('stage-title').textContent = spec.title;
  $('stage-note').textContent = spec.note;
  $('boarded').textContent = state.head;
  $('rider-total').textContent = ' / ' + state.queue.length + ' 人';
  $('progress').style.width = (100 * state.head / state.queue.length) + '%';
  const progress = document.querySelector('[role="progressbar"]');
  progress.setAttribute('aria-valuenow', state.head); progress.setAttribute('aria-valuemax', state.queue.length);
  const remaining = state.queue.slice(state.head);
  $('queue').innerHTML = remaining.length ? remaining.slice(0, 20).map((color, i) => riderArt(color, i === 0)).join('') : '<span class="queue-empty">✓ みんな乗れました！</span>';
  $('bay-count').textContent = '待機中 ' + state.bays.filter(Boolean).length + ' / 3 台';
  $('bays').innerHTML = state.bays.map((id, index) => {
    const bus = state.buses.find(b => b.id === id);
    if (!bus) return '<div class="bay"><span class="bay-number">0' + (index + 1) + '</span><span class="bay-empty" aria-hidden="true">+</span><small>あいています</small></div>';
    return '<div class="bay occupied" style="' + colorStyle(bus.color) + '" aria-label="' + COLORS[bus.color].name + 'のバス ' + bus.load + '人乗車"><span class="bay-number">0' + (index + 1) + '</span>' + busArt(bus) + '<div class="seats">' + [0, 1, 2].map(i => '<span class="seat ' + (i < bus.load ? 'filled' : '') + '" aria-hidden="true"></span>').join('') + '<span class="seat-count">' + bus.load + ' / 3</span></div></div>';
  }).join('');
  $('garage').style.setProperty('--cols', spec.cols);
  $('garage').innerHTML = state.buses.map(bus => {
    if (bus.location !== 'garage') return '<div class="parking-slot" aria-hidden="true"><span class="empty-parking">⌁</span></div>';
    const accessible = isAccessible(state, bus.id);
    const label = COLORS[bus.color].name + 'のバス（' + (bus.col + 1) + '列目・' + (bus.row + 1) + '台目）' + (!accessible ? '：手前のバスがふさいでいます' : '：のりばへ出す');
    return '<div class="parking-slot"><button class="bus-button' + (accessible ? '' : ' blocked') + (hintId === bus.id ? ' hinted' : '') + '" style="' + colorStyle(bus.color) + '" data-bus="' + bus.id + '" aria-label="' + label + '" title="' + label + '"' + (busy ? ' disabled' : '') + '>' + busArt(bus) + '</button></div>';
  }).join('');
  $('stages').innerHTML = STAGES.map((stage, i) => '<button class="stage-choice' + (state.stage === i ? ' active' : '') + '" data-stage="' + i + '" aria-label="ステージ' + (i + 1) + ' ' + stage.title + (cleared.has(i) ? ' クリア済み' : '') + '" aria-current="' + (state.stage === i ? 'step' : 'false') + '"' + (busy ? ' disabled' : '') + '><span class="stage-no">' + (i + 1) + '</span><span><span class="stage-name">' + stage.title + '</span><span class="stage-difficulty">' + ['EASY', 'EASY +', 'NORMAL', 'HARD', 'CHALLENGE'][i] + '</span></span><span class="stage-check" aria-hidden="true">' + (cleared.has(i) ? '✓' : state.stage === i ? '•' : '') + '</span></button>').join('');
  $('clear-count').textContent = 'クリアしたステージ ' + cleared.size + ' / 5';
  $('undo').disabled = busy || !history.length;
  $('hint').disabled = busy || status(state) !== 'playing';
  $('restart').disabled = busy;
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
    oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(type === 'depart' ? 740 : type === 'board' ? 510 : 350, audio.currentTime);
    gain.gain.setValueAtTime(.035, audio.currentTime); gain.gain.exponentialRampToValueAtTime(.001, audio.currentTime + .15);
    oscillator.connect(gain); gain.connect(audio.destination); oscillator.start(); oscillator.stop(audio.currentTime + .16);
  } catch {}
}
async function choose(id, keyboard = false) {
  if (busy) return;
  const result = dispatch(state, id);
  if (!result.ok) {
    if (result.reason === 'blocked') {
      announce('このバスの前に別のバスがいるよ。手前から出してみよう。', true);
      const el = document.querySelector('[data-bus="' + id + '"]'); el?.animate?.([{ transform: 'translateX(-3px)' }, { transform: 'translateX(3px)' }, { transform: 'translateX(0)' }], { duration: reduceMotion ? 0 : 160 });
    }
    return;
  }
  history.push(clone(state)); busy = true; hintId = null;
  $('garage').setAttribute('aria-busy', 'true');
  const originCol = state.buses.find(b => b.id === id).col;
  for (const event of result.events) {
    state = event.state; render();
    const bay = $('bays').children[event.bay];
    bay?.classList.add(event.type === 'move' ? 'arriving' : 'boarding');
    tone(event.type);
    if (event.type === 'move') announce(COLORS[state.buses.find(b => b.id === id).color].label + 'のバスが、のりばに到着。');
    if (event.type === 'depart') announce(COLORS[state.buses.find(b => b.id === event.id).color].label + 'のバスが出発！ いってらっしゃい。');
    await delay(event.type === 'move' ? 220 : event.type === 'depart' ? 200 : 120);
  }
  state = result.state; busy = false; render(); $('garage').removeAttribute('aria-busy');
  const currentStatus = status(state);
  if (currentStatus === 'won') {
    cleared.add(state.stage);
    try { localStorage.setItem('bus-buddies-cleared', JSON.stringify([...cleared])); } catch {}
    render(); showResult(true); celebrate();
  } else if (currentStatus === 'lost') {
    showResult(false);
  } else {
    const next = COLORS[state.queue[state.head]];
    announce('つぎは' + next.label + ' ' + next.symbol + ' の乗客。どのバスを出そう？');
    if (keyboard) {
      const target = state.buses.find(b => isAccessible(state, b.id) && b.col === originCol) || state.buses.find(b => isAccessible(state, b.id));
      if (target) document.querySelector('[data-bus="' + target.id + '"]')?.focus();
    }
  }
}
function start(index) {
  if (busy) return;
  if ($('result-dialog').open) $('result-dialog').close();
  state = createLevel(index); history = []; hintId = null; render();
  announce(index === 0 ? '先頭の乗客と同じ色のバスを出してみよう。' : STAGES[index].note);
}
function undo() {
  if (busy || !history.length) return;
  if ($('result-dialog').open) $('result-dialog').close();
  state = history.pop(); hintId = null; render(); announce('1手戻しました。別の順番を試してみよう。');
}
function hint() {
  if (busy) return;
  const result = solve(state);
  if (result.status === 'solved' && result.path.length) {
    hintId = result.path[0]; render();
    const c = COLORS[state.buses.find(b => b.id === hintId).color];
    announce('光っている' + c.label + ' ' + c.symbol + ' のバスを出すと、クリアにつながるよ。');
  } else if (result.status === 'unsolvable') {
    announce('この順番ではクリアが難しそう。「1手戻す」で考え直してみよう。', true);
    $('undo').focus();
  } else {
    announce('今はヒントを探しきれませんでした。先頭の色と奥のバスを見てみよう。');
  }
}
function showResult(won) {
  const last = state.stage === STAGES.length - 1;
  $('result-icon').textContent = won ? '🌼' : '🚌';
  $('result-kicker').textContent = won ? 'NICE JOURNEY!' : 'TAKE A LITTLE BREATH.';
  $('result-title').textContent = won ? last ? '5つの旅、ぜんぶクリア！' : 'みんな、いってらっしゃい！' : 'のりばがいっぱい！';
  $('result-text').textContent = won ? state.queue.length + '人全員が乗車しました。' + (last ? 'おつかれさま。もう一度、好きなステージへ。' : 'つぎの街も、のぞいてみよう。') : '先頭の乗客が乗れるバスがいないみたい。順番を少し変えてみよう。';
  $('result-primary').textContent = won ? last ? 'はじめから遊ぶ →' : '次のステージへ →' : '1手戻して続ける ↶';
  $('result-secondary').textContent = won ? 'このステージをもう一度' : 'このステージをやり直す';
  if (!$('result-dialog').open) $('result-dialog').showModal();
}
function celebrate() {
  if (reduceMotion) return;
  const colors = ['#efc858', '#71b999', '#ef776e', '#b598da', '#66a7f2'];
  for (let i = 0; i < 25; i++) {
    const el = document.createElement('span'); el.className = 'confetti'; el.style.left = (5 + Math.random() * 90) + '%'; el.style.background = colors[i % colors.length]; el.style.animationDelay = (Math.random() * .7) + 's'; document.body.append(el); setTimeout(() => el.remove(), 3400);
  }
}
$('garage').addEventListener('click', e => { const button = e.target.closest('[data-bus]'); if (button) choose(button.dataset.bus, e.detail === 0); });
$('stages').addEventListener('click', e => { const button = e.target.closest('[data-stage]'); if (button) start(Number(button.dataset.stage)); });
$('undo').addEventListener('click', undo);
$('hint').addEventListener('click', hint);
$('restart').addEventListener('click', () => start(state.stage));
$('sound').addEventListener('click', () => { sound = !sound; $('sound').setAttribute('aria-pressed', String(sound)); $('sound-label').textContent = sound ? '音 ON' : '音 OFF'; if (sound) tone('move'); });
$('help').addEventListener('click', () => { if (!$('help-dialog').open) $('help-dialog').showModal(); });
$('help-close').addEventListener('click', () => $('help-dialog').close());
$('help-play').addEventListener('click', () => $('help-dialog').close());
$('result-primary').addEventListener('click', () => { if (status(state) === 'won') start((state.stage + 1) % STAGES.length); else undo(); });
$('result-secondary').addEventListener('click', () => start(state.stage));
$('result-dialog').addEventListener('cancel', () => { announce(status(state) === 'won' ? 'クリア！ ステージを選んで、もう一度遊べます。' : '「1手戻す」か「やり直す」で続けよう。'); });
render();
