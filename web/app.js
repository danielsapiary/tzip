import {limitText, MAX_CHARACTERS} from './core.js';

const $ = id => document.getElementById(id);
const beeMovieText = $('demo-text').defaultValue;
const state = {steps: [], tokens: [], pieces: [], index: 0, busy: false, timer: null};
const worker = new Worker(new URL('./model-worker.js', import.meta.url), {type: 'module'});

function stopPlayback() {
  clearInterval(state.timer);
  state.timer = null;
  $('play-demo').textContent = 'Play';
}

function error(message) {
  $('demo-error').textContent = message;
  $('demo-error').hidden = !message;
}

function lock(busy) {
  state.busy = busy;
  $('run-demo').disabled = busy;
  $('demo-text').disabled = busy;
  for (const chip of document.querySelectorAll('.preset-chip')) chip.disabled = busy;
  $('cancel-demo').hidden = !busy;
  $('run-demo').textContent = busy ? 'Tracing…' : 'Explore the steps →';
}

function updateText() {
  $('demo-text').value = limitText($('demo-text').value);
  $('character-count').textContent = `${Array.from($('demo-text').value).length} / ${MAX_CHARACTERS} characters`;
  stopPlayback();
  state.steps = [];
  $('trace-view').hidden = true;
  $('demo-placeholder').hidden = false;
  $('trace-progress').hidden = true;
  error('');
}

function progress(value) {
  $('trace-progress').hidden = false;
  $('trace-stage').textContent = value.stage;
  $('trace-detail').textContent = value.detail;
  $('trace-count').textContent = value.total ? `${value.completed || 0} / ${value.total} tokens` : '';
  $('trace-meter').value = value.percent || 0;
}

function stepBy(delta) {
  if (!state.steps.length) return;
  stopPlayback();
  state.index = Math.max(0, Math.min(state.steps.length - 1, state.index + delta));
  renderStep();
}

function alignDistribution() {
  const diagram = document.querySelector('.bound-diagram');
  const table = document.querySelector('.distribution-table-wrap');
  if ($('trace-view').hidden) return;
  table.style.height = `${diagram.getBoundingClientRect().height}px`;
  const chosen = table.querySelector('.chosen-row');
  if (chosen) {
    const offset = chosen.getBoundingClientRect().top - table.getBoundingClientRect().top;
    table.scrollTop += offset - (table.clientHeight - chosen.clientHeight) / 2;
  }
}
const distributionObserver = new ResizeObserver(alignDistribution);
distributionObserver.observe(document.querySelector('.bound-diagram'));

function renderStep() {
  const step = state.steps[state.index];
  if (!step) return;
  $('trace-view').hidden = false;
  $('demo-placeholder').hidden = true;
  $('step-title').textContent = `Token ${state.index + 1} of ${state.tokens.length} · ${step.label}`;
  $('previous-step').disabled = state.index === 0;
  $('next-step').disabled = state.index === state.steps.length - 1;
  const ourBits = step.precedingBits;
  const unicodeBits = step.precedingBytes * 8;
  const scale = Math.max(ourBits, unicodeBits, 1);
  $('our-bits').textContent = `${ourBits.toFixed(2)} bits`;
  $('unicode-bits').textContent = `${unicodeBits} bits`;
  const huffmanBits = step.precedingHuffmanBits;
  $('huffman-bits').textContent = `${huffmanBits} bits`;
  const improvement = huffmanBits > 0 ? 100 * (huffmanBits - ourBits) / huffmanBits : null;
  $('huffman-improvement').textContent = improvement === null ? '—' : `${improvement.toFixed(1)}%`;
  $('huffman-improvement').title = improvement === null
    ? 'No preceding tokens to compare yet.'
    : '100 × (Huffman bits − GPT-2 bits) / Huffman bits. Negative means GPT-2 uses more bits.';
  $('our-bar').style.width = `${100 * ourBits / scale}%`;
  const extraBits = Math.max(0, unicodeBits - ourBits);
  $('extra-bits').textContent = `${extraBits.toFixed(2)} bits`;
  $('encoding-cost-bar').setAttribute('aria-label', `${ourBits.toFixed(2)} bits in our encoding, ${extraBits.toFixed(2)} extra UTF-8 bits. UTF-8 total: ${unicodeBits} bits.`);
  $('unicode-extra').style.width = `${100 * Math.max(0, unicodeBits - ourBits) / scale}%`;
  $('unicode-extra').title = `${Math.max(0, unicodeBits - ourBits).toFixed(2)} extra bits`;
  const context = state.pieces.slice(step.blockStart, state.index).flat();
  $('context-bytes').textContent = context.length ? context.map(byte => byte.toString(16).padStart(2, '0')).join(' ') : 'empty context';
  $('context-note').textContent = `GPT-2 context: BOS + ${state.index - step.blockStart} preceding tokens. Context resets every 1,024 tokens; the information comparison covers all preceding bytes.`;
  $('current-symbol').textContent = step.label;
  $('selected-probability').textContent = `${(step.probability * 100).toFixed(4)}% illustrated · ${(step.modelProbability * 100).toFixed(4)}% model`;
  $('before-label').textContent = step.beforeBounds;
  $('selected-label').textContent = step.newBounds;
  // Format via logarithms so tiny cumulative widths never underflow to zero.
  const logWidth = -step.cumulativeBits / Math.log2(10);
  const exponent = Math.floor(logWidth);
  const mantissa = 10 ** (logWidth - exponent);
  const power = document.createElement('sup');
  power.textContent = exponent;
  $('interval-width').replaceChildren(`≈ ${mantissa.toFixed(3)} × 10`, power);
  $('interval-bits').textContent = `Equivalent to ${step.cumulativeBits.toFixed(2)} bits`;
  const x = 10 + 380 * step.selectionStart;
  const selectionWidth = 380 * step.probability;
  $('interval-selection').setAttribute('x', x);
  $('interval-selection').setAttribute('width', selectionWidth);
  $('interval-pointer').setAttribute('d', `M${x + selectionWidth / 2} 20V80`);
  $('interval-diagram').setAttribute('aria-label', `Selected token takes ${(100*step.probability).toFixed(4)} percent of the preceding interval. Cumulative width is 2 to the power minus ${step.cumulativeBits.toFixed(2)}.`);
  const rows = step.rows.map(item => {
    const row = document.createElement('tr');
    row.classList.toggle('chosen-row', item.id === step.symbol);
    row.dataset.symbol = item.id;
    for (const value of [`${item.label} · ${item.id}`, `${(item.probability * 100).toFixed(4)}%`]) {
      const cell = document.createElement('td');
      cell.textContent = value;
      row.append(cell);
    }
    return row;
  });
  $('distribution-rows').replaceChildren(...rows);
  alignDistribution();
  $('table-explanation').textContent = `Tokens ${step.rows[0].id}–${step.rows.at(-1).id} of all 50,257, ordered by token ID. Every vocabulary logit participates; this table is only a display slice. Probabilities use the integer counts shown in the diagram.`;
  for (const [index, chip] of Array.from($('token-strip').children).entries()) {
    chip.disabled = index >= state.steps.length;
    chip.classList.toggle('active', index === state.index);
    chip.classList.toggle('seen', index < state.index);
    chip.setAttribute('aria-pressed', String(index === state.index));
  }
}

worker.addEventListener('message', ({data}) => {
  if (data.type === 'progress') progress(data);
  if (data.type === 'tokens') {
    state.tokens = data.tokens;
    state.pieces = data.pieces;
    $('token-strip').replaceChildren(...data.labels.map((label, index) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'byte-chip';
      chip.textContent = label;
      chip.disabled = true;
      chip.setAttribute('aria-label', `Token ${index + 1}: ${label}`);
      chip.addEventListener('click', () => {stopPlayback(); state.index = index; renderStep();});
      return chip;
    }));
  }
  if (data.type === 'step') {
    state.steps.push(data.step);
    renderStep();
  }
  if (data.type === 'done') {
    lock(false);
    $('trace-progress').hidden = true;
    if (!state.steps.length) {
      $('demo-placeholder').hidden = false;
      $('demo-placeholder').querySelector('h2').textContent = data.cancelled ? 'Tracing stopped.' : 'Empty input · no token steps.';
    }
  }
  if (data.type === 'error') {lock(false); error(data.message); progress({stage:'Could not trace', detail: 'Check your connection and available browser memory, then try again.'});}
});
worker.addEventListener('error', event => {lock(false); error(`Browser worker failed: ${event.message}`);});

$('run-demo').addEventListener('click', () => {
  if (state.busy) return;
  stopPlayback(); error(''); state.steps = []; state.index = 0;
  $('trace-view').hidden = true;
  lock(true);
  progress({stage:'Loading GPT-2', detail:'Downloading or reading cached model files. Inference will run here in your browser.'});
  worker.postMessage({type:'trace', text: $('demo-text').value});
});
$('cancel-demo').addEventListener('click', () => {worker.postMessage({type:'cancel'}); $('cancel-demo').disabled = true; $('trace-detail').textContent = 'Stopping after the current download or inference call…';});
$('run-demo').addEventListener('click', () => {$('cancel-demo').disabled = false;});
$('demo-text').addEventListener('input', () => {
  for (const chip of document.querySelectorAll('.preset-chip')) chip.setAttribute('aria-pressed','false');
  updateText();
});
for (const chip of document.querySelectorAll('.preset-chip')) chip.addEventListener('click', () => {
  const preset = chip.dataset.preset;
  for (const option of document.querySelectorAll('.preset-chip')) option.setAttribute('aria-pressed', String(option === chip));
  if (preset === 'bee') $('demo-text').value = beeMovieText;
  if (preset === 'random') {
    // Uniform printable ASCII: reject the remainder before mapping to 95 symbols.
    let text = '';
    while (text.length < 300) {
      const samples = crypto.getRandomValues(new Uint8Array(512));
      for (const byte of samples) {
        if (byte < 190) text += String.fromCharCode(32 + byte % 95);
        if (text.length === 300) break;
      }
    }
    $('demo-text').value = text;
  }
  updateText();
});
$('previous-step').addEventListener('click', () => stepBy(-1));
$('next-step').addEventListener('click', () => stepBy(1));
$('restart-demo').addEventListener('click', () => {stopPlayback(); state.index = 0; renderStep();});
$('play-demo').addEventListener('click', () => {
  if (state.timer) {stopPlayback(); return;}
  if (!state.steps.length) return;
  if (state.index === state.steps.length - 1) state.index = 0;
  renderStep(); $('play-demo').textContent = 'Pause';
  state.timer = setInterval(() => {
    if (state.index === state.steps.length - 1) {stopPlayback(); return;}
    state.index++; renderStep();
  }, 900);
});
document.addEventListener('keydown', event => {
  if (!state.steps.length || event.altKey || event.ctrlKey || event.metaKey || ['INPUT','TEXTAREA','SELECT'].includes(event.target.tagName) || event.target.isContentEditable) return;
  if (!['ArrowLeft','ArrowRight'].includes(event.key)) return;
  event.preventDefault(); stepBy(event.key === 'ArrowLeft' ? -1 : 1);
});
updateText();
