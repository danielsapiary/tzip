import {limitText, MAX_CHARACTERS} from './core.js';
import {IntervalDiagram, INTERVAL_PLAYBACK_MS} from './interval-diagram.js';

const $ = id => document.getElementById(id);
const beeMovieText = $('demo-text').defaultValue;
const state = {steps: [], tokens: [], pieces: [], labels: [], index: 0, busy: false, timer: null, mode: 'encode', stepsMode: null, sourceText: beeMovieText, codeText: '', fullCode: '', tokenCount: 0, decodeComplete: false};
const intervalDiagram = new IntervalDiagram($('interval-diagram'), (phase, description) => {
  state.diagramPhase = phase;
  updateDecodedStep();
  $('interval-stage').textContent = {start:'Start of sequence', previous:'Previous interval', select:'Select token interval', partition:'Partition token intervals', locate:'Decode token', outside:'Point outside interval', move:'Extend binary fraction', inside:'Point inside interval', zoom:'Selected interval', complete:'Selected interval'}[phase];
  $('point-status').textContent = description;
  const unknown = state.mode === 'decode' && ['previous', 'partition'].includes(phase);
  const displayedStep = unknown ? null : state.steps[state.index - (phase === 'previous' ? 1 : 0)];
  $('current-symbol').textContent = displayedStep?.label ?? (unknown ? '?' : '▶');
  $('selected-probability').textContent = displayedStep ? `${(displayedStep.probability * 100).toFixed(4)}% probability` : (state.mode === 'decode' ? 'Finding new interval overlapping point' : '');
  $('selected-probability').title = 'The probability used by this arithmetic coding illustration, quantized to integer counts.';
}, updateFraction);
const worker = new Worker(new URL('./model-worker.js', import.meta.url), {type: 'module'});

function updateFraction(progress) {
  const fraction = state.fractionAnimation;
  if (!fraction) return;
  const {bits, previousBits, highlightedFrom, changing} = fraction;
  if (!changing) {
    $('fraction-fixed').textContent = bits;
    $('fraction-added').textContent = '';
  } else if (progress === 0) {
    $('fraction-fixed').textContent = previousBits;
    $('fraction-added').textContent = '';
  } else {
    $('fraction-fixed').textContent = bits.slice(0, highlightedFrom);
    const addedCount = Math.ceil((bits.length - highlightedFrom) * progress);
    const typing = progress < 1 && addedCount > 0;
    if (fraction.renderedCount === addedCount && fraction.typing === typing) return;
    fraction.renderedCount = addedCount;
    fraction.typing = typing;
    const addedBits = bits.slice(highlightedFrom, highlightedFrom + addedCount);
    if (typing) {
      const newestBit = document.createElement('span');
      newestBit.className = 'fraction-typing-bit';
      newestBit.textContent = addedBits.at(-1);
      $('fraction-added').replaceChildren(addedBits.slice(0, -1), newestBit);
    } else {
      $('fraction-added').textContent = addedBits;
    }
  }
}

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
  $('run-demo').disabled = busy || (state.mode === 'decode' && !state.codeText.trim());
  $('demo-text').disabled = busy;
  $('code-text').disabled = busy;
  $('code-text').readOnly = state.mode !== 'decode';
  for (const chip of document.querySelectorAll('.preset-chip')) chip.disabled = busy;
  $('cancel-demo').hidden = !busy;
  $('run-demo').textContent = busy ? (state.mode === 'decode' ? 'Decoding…' : 'Encoding…') : (state.mode === 'decode' ? 'Decode' : 'Encode');
  $('encode-mode').disabled = busy;
  $('decode-mode').disabled = busy;
}

function formatInput() {
  const decoding = state.mode === 'decode';
  $('live-fraction').parentElement.hidden = decoding;
  $('fraction-label').hidden = decoding;
  $('fraction-label').textContent = 'CURRENT BINARY FRACTION';
  $('live-fraction').setAttribute('aria-label', decoding ? 'Fixed binary fraction' : 'Current binary fraction; newly added digits are highlighted');
  $('demo-text').hidden = decoding;
  $('code-panel').hidden = !decoding && !state.codeText;
  if (!decoding) $('demo-text').value = state.sourceText;
  $('code-text').value = state.codeText;
  $('input-label').textContent = decoding ? 'Arithmetic code to decode' : 'Your text';
  $('input-label').htmlFor = decoding ? 'code-text' : 'demo-text';
  $('code-label').hidden = decoding;
  $('code-help').textContent = decoding
    ? 'The count gives the number of tokens to recover. The remaining bits specify one fixed point in the interval.'
    : 'The count comes first; the remaining bits are the binary fraction.';
  $('character-count').textContent = decoding ? `${state.codeText.length.toLocaleString()} code characters` : `${Array.from(state.sourceText).length} / ${MAX_CHARACTERS} characters`;
  $('text-help').textContent = decoding
    ? 'Paste the count-prefixed arithmetic code here. Decode uses this code, not the original text.'
    : 'Up to 2,048 Unicode code points. Your text stays in this browser.';
}

function showModePlaceholder(title, description) {
  intervalDiagram.cancel();
  $('trace-view').hidden=true;
  $('decode-output').hidden=true;
  $('demo-placeholder').hidden=false;
  $('demo-placeholder').querySelector('h2').textContent=title;
  $('demo-placeholder').querySelector('p').textContent=description;
  $('trace-progress').hidden=true;
}

function updateText() {
  intervalDiagram.cancel();
  state.sourceText = limitText($('demo-text').value);
  $('language-entropy').hidden = true;
  stopPlayback();
  state.steps = [];
  state.codeText = ''; state.fullCode = ''; state.decodeComplete = false;
  $('code-text').value = '';
  formatInput();
  $('encode-mode').setAttribute('aria-pressed',String(state.mode === 'encode'));
  $('decode-mode').setAttribute('aria-pressed',String(state.mode === 'decode'));
  $('decode-output').hidden = true;
  $('mode-help').textContent = state.mode === 'decode' ? 'Paste arithmetic code in the code field to begin.' : 'Encode your text to produce arithmetic code.';
  lock(false);
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
  const nextIndex = Math.max(-1, Math.min(state.steps.length - 1, state.index + delta));
  const animate = nextIndex > state.index;
  state.index = nextIndex;
  renderStep({animate});
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

function renderStep({animate = true} = {}) {
  const isStart = state.index === -1;
  const step = isStart ? {
    label:'▶', symbol:null, blockStart:0, precedingBytes:0, precedingBits:0,
    precedingHuffmanBits:0, cumulativeBits:0, beforeBounds:'[0, 1)', newBounds:'[0, 1)',
    rows:state.steps[0]?.rows ?? [], pointMoved:false,
  } : state.steps[state.index];
  if (!step) return;
  if (isStart && state.mode === 'encode') {
    state.codeText = state.fullCode;
    $('code-text').value = state.fullCode;
    $('code-panel').hidden = !state.fullCode;
    $('code-help').textContent = 'The count comes first; the remaining bits are the binary fraction. Complete arithmetic code.';
    $('mode-help').textContent = 'Before the first token: the walkthrough has not written any bits. The complete code remains above.';
  }
  if (state.mode === 'encode' && step.code) {
    state.codeText=step.code;
    $('code-text').value=step.code;
    $('code-panel').hidden=false;
    $('code-help').textContent=`The count comes first; the remaining bits are the binary fraction. Live code for the first ${state.index+1} token${state.index ? 's' : ''}.`;
    $('character-count').textContent=`${Array.from(state.sourceText).length} / ${MAX_CHARACTERS} characters`;
    $('mode-help').textContent=state.index+1===state.tokenCount
      ? 'Complete arithmetic code is shown. Switch to Decode to recover the text from this code.'
      : `Showing a code for the first ${state.index+1} of ${state.tokenCount} tokens. Decode will recover this prefix.`;
  }
  $('trace-view').hidden = false;
  $('decode-output').hidden = state.mode !== 'decode';
  $('encoding-comparison').hidden = state.mode === 'decode';
  if (state.mode === 'decode') {
    $('decode-verification').textContent = 'The binary fraction stays fixed. Recover each token from the interval containing its point.';
  }
  const displayedBits=(state.mode === 'decode' ? state.codeText : step.code || '').replace(/\s/g,'').split(':')[1] || '';
  const previousBits=state.mode === 'encode' && state.index>0
    ? (state.steps[state.index-1]?.code || '').replace(/\s/g,'').split(':')[1] || ''
    : '';
  let highlightedFrom=displayedBits.length;
  if (state.mode === 'encode' && step.pointMoved) {
    highlightedFrom=0;
    while (highlightedFrom<previousBits.length && highlightedFrom<displayedBits.length && previousBits[highlightedFrom]===displayedBits[highlightedFrom]) highlightedFrom++;
  }
  state.fractionAnimation = {bits:displayedBits, previousBits, highlightedFrom, changing:state.mode === 'encode' && step.pointMoved};
  updateFraction(0);
  $('demo-placeholder').hidden = true;
  $('step-title').textContent = isStart
    ? `Start · 0 of ${state.tokenCount} tokens ${state.mode === 'decode' ? 'decoded' : 'encoded'}`
    : `${state.mode === 'decode' ? 'Decoded token' : 'Token'} ${state.index + 1} of ${state.tokenCount} · ${step.label}`;
  $('previous-step').disabled = isStart;
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
  if (isStart) intervalDiagram.renderStart(state.mode, state.mode === 'decode' ? state.steps[0]?.pointPositionBefore ?? 0 : 0);
  else intervalDiagram.render(step, state.mode, {animate});
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
  for (const item of $('token-strip').children) {
    const index = Number(item.dataset.stepIndex);
    if (state.mode === 'decode') {
      item.hidden = !state.decodeComplete && index > state.index;
      item.disabled = !state.steps.length || index >= state.steps.length;
      item.classList.toggle('active', index === state.index);
      item.setAttribute('aria-current',index === state.index ? 'step' : 'false');
    } else {
      item.disabled = !state.steps.length || index >= state.steps.length;
      item.classList.toggle('active', index === state.index);
      item.classList.toggle('seen', index < state.index);
      item.setAttribute('aria-pressed',String(index === state.index));
    }
  }
  updateDecodedStep();
}

function updateDecodedStep() {
  if (state.mode !== 'decode') return;
  const revealed = !['previous', 'partition', 'start'].includes(state.diagramPhase);
  const count = Math.max(0, state.index + (revealed ? 1 : 0));
  $('decoded-text').textContent = new TextDecoder().decode(Uint8Array.from(state.pieces.slice(0, count).flat()));
  $('step-title').textContent = state.index < 0 ? `Start · 0 of ${state.tokenCount} tokens decoded` : `${revealed ? 'Decoded' : 'Decoding'} token ${state.index + 1} of ${state.tokenCount}${revealed ? ` · ${state.steps[state.index]?.label}` : ''}`;
  for (const item of $('token-strip').children) item.hidden = !state.decodeComplete && Number(item.dataset.stepIndex) >= count;
  for (const row of $('distribution-rows').children) row.classList.toggle('chosen-row', revealed && Number(row.dataset.symbol) === state.steps[state.index]?.symbol);
}

worker.addEventListener('message', ({data}) => {
  if (data.type === 'progress') progress(data);
  if (data.type === 'tokens') {
    state.tokens = data.tokens;
    state.tokenCount = data.total;
    state.pieces = data.pieces;
    state.labels = data.labels;
    const items = ['▶', ...data.labels].map((label,position) => {
      const index = position - 1;
      const chip=document.createElement('button');
      chip.type='button';
      chip.className='byte-chip';
      chip.dataset.stepIndex=String(index);
      chip.textContent=label;
      chip.disabled=true;
      chip.setAttribute('aria-label', index === -1 ? 'Start: before the first token' : `Token ${index+1}: ${label}`);
      if (index === -1) chip.title = 'Start of sequence; no input tokens encoded or decoded.';
      chip.addEventListener('click',()=>{
        stopPlayback();
        const animate = index > state.index;
        state.index = index;
        renderStep({animate});
      });
      return chip;
    });
    $('token-strip').replaceChildren(...items);
    $('token-strip').setAttribute('aria-label',state.mode === 'decode' ? 'Recovered GPT-2 tokens' : 'Select a token');
  }
  if (data.type === 'step') {
    state.steps.push(data.step);
    state.index=state.steps.length-1;
    renderStep();
  }
  if (data.type === 'encoded') {
    const characters = Array.from(state.sourceText).length;
    const bits = state.steps.at(-1)?.cumulativeBits;
    $('language-entropy').hidden = !characters || !Number.isFinite(bits);
    if (characters && Number.isFinite(bits)) $('language-bits-per-character').textContent = `${(bits / characters).toFixed(2)} bits per character`;
    state.fullCode = data.code;
    state.codeText = data.code;
    $('code-text').value = data.code;
    $('code-panel').hidden = false;
    $('mode-help').textContent = 'Arithmetic code is ready. Switch to Decode to recover the text from this code.';
    lock(false);
  }
  if (data.type === 'decoded') {
    state.decodeComplete = true;
    $('decoded-text').textContent = data.text;
    $('decode-verification').textContent = 'Decoded from the arithmetic code. The decoder did not use the original text.';
    state.index = state.steps.length - 1;
    renderStep();
  }
  if (data.type === 'done') {
    lock(false);
    $('trace-progress').hidden = true;
    if (state.steps.length && !data.cancelled) {
      stopPlayback();
      state.index = -1;
      renderStep({animate:false});
    }
    if (!state.steps.length) {
      $('demo-placeholder').hidden = false;
      $('demo-placeholder').querySelector('h2').textContent = data.cancelled ? 'Stopped.' : state.mode === 'decode' ? 'Decoded empty text.' : 'Empty input · no token steps.';
    }
  }
  if (data.type === 'error') {lock(false); error(data.message); progress({stage:'Could not trace', detail: 'Check your connection and available browser memory, then try again.'});}
});
worker.addEventListener('error', event => {lock(false); error(`Browser worker failed: ${event.message}`);});

function run() {
  if (state.busy) return;
  $('language-entropy').hidden = true;
  intervalDiagram.cancel();
  stopPlayback(); error(''); state.steps = []; state.tokens = []; state.pieces = []; state.labels=[]; state.index = 0; state.decodeComplete = false; state.stepsMode=state.mode;
  if (state.mode === 'encode') {state.fullCode=''; state.codeText=''; $('code-text').value=''; $('code-panel').hidden=true;}
  $('trace-view').hidden = true;
  $('decode-output').hidden = true;
  $('cancel-demo').disabled = false;
  lock(true);
  progress({stage:state.mode === 'decode' ? 'Decoding arithmetic code' : 'Loading GPT-2', detail:state.mode === 'decode' ? 'Using only the count-prefixed code and regenerated GPT-2 predictions.' : 'Downloading or reading cached model files. Inference will run here in your browser.'});
  worker.postMessage(state.mode === 'decode' ? {type:'decode',code:state.codeText} : {type:'trace', text:state.sourceText});
}
$('run-demo').addEventListener('click',run);
$('encode-mode').addEventListener('click', () => {
  state.mode = 'encode';
  formatInput();
  error('');
  $('encode-mode').setAttribute('aria-pressed','true');
  $('decode-mode').setAttribute('aria-pressed','false');
  $('mode-help').textContent = state.codeText ? 'Arithmetic code is ready. Switch to Decode to recover the text from this code.' : 'Encode your text to produce arithmetic code.';
  if (state.stepsMode === 'decode') {
    state.steps=[]; state.tokens=[]; state.pieces=[]; state.stepsMode=null;
    showModePlaceholder('Ready to encode.', 'Click Encode to trace the text and create a value that Decode can recover.');
  } else if (state.stepsMode === 'encode') renderStep();
  lock(false);
});
$('decode-mode').addEventListener('click', () => {
  if (state.busy) return;
  state.mode = 'decode';
  formatInput();
  $('encode-mode').setAttribute('aria-pressed','false');
  $('decode-mode').setAttribute('aria-pressed','true');
  $('encoding-comparison').hidden=true;
  state.steps=[]; state.tokens=[]; state.pieces=[]; state.labels=[]; state.index=0; state.decodeComplete=false; state.stepsMode='decode';
  $('token-strip').replaceChildren();

  $('mode-help').textContent=state.codeText ? 'The code field contains the arithmetic code. Click Decode to recover the text.' : 'Paste the count-prefixed arithmetic code, then click Decode.';
  showModePlaceholder('Ready to decode.', 'Decode reads the arithmetic code and recovers tokens one at a time. It does not need the original text.');
  lock(false);
});
$('cancel-demo').addEventListener('click', () => {worker.postMessage({type:'cancel'}); $('cancel-demo').disabled = true; $('trace-detail').textContent = 'Stopping after the current download or inference call…';});
$('run-demo').addEventListener('click', () => {$('cancel-demo').disabled = false;});
$('demo-text').addEventListener('input', () => {
  for (const chip of document.querySelectorAll('.preset-chip')) chip.setAttribute('aria-pressed','false');
  updateText();
});
$('code-text').addEventListener('input', () => {
  intervalDiagram.cancel();
  state.codeText=$('code-text').value;
  state.decodeComplete=false;
  state.steps=[];
  $('character-count').textContent=`${state.codeText.length.toLocaleString()} code characters`;
  $('mode-help').textContent='Click Decode to decode the arithmetic code in this field.';
  $('decode-output').hidden=true;
  $('trace-view').hidden=true;
  $('demo-placeholder').hidden=false;
  lock(false);
  error('');
});
for (const chip of document.querySelectorAll('.preset-chip')) chip.addEventListener('click', () => {
  const preset = chip.dataset.preset;
  state.mode = 'encode';
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
$('restart-demo').addEventListener('click', () => {stopPlayback(); state.index = -1; renderStep({animate:false});});
$('play-demo').addEventListener('click', () => {
  if (state.timer) {stopPlayback(); return;}
  if (!state.steps.length) return;
  if (state.index === state.steps.length - 1) state.index = -1;
  renderStep(); $('play-demo').textContent = 'Pause';
  state.timer = setInterval(() => {
    if (state.index === state.steps.length - 1) {stopPlayback(); return;}
    state.index++; renderStep();
  }, INTERVAL_PLAYBACK_MS);
});
document.addEventListener('keydown', event => {
  if (!state.steps.length || event.altKey || event.ctrlKey || event.metaKey || ['INPUT','TEXTAREA','SELECT'].includes(event.target.tagName) || event.target.isContentEditable) return;
  if (!['ArrowLeft','ArrowRight'].includes(event.key)) return;
  event.preventDefault(); stepBy(event.key === 'ArrowLeft' ? -1 : 1);
});
updateText();
