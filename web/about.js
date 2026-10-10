import katex from 'katex';
import 'katex/dist/katex.min.css';

for (const element of document.querySelectorAll('.equation, .inline-math')) {
  katex.render(element.textContent, element, {displayMode:element.classList.contains('equation'), throwOnError:true});
}

const slider = document.getElementById('model-probability');
const p = 0.75;
const entropy = -p * Math.log2(p) - (1-p) * Math.log2(1-p);
const graphX = q => 60 + 550*q;
const graphY = bits => 230 - 210*bits/5;
const points = Array.from({length:99},(_,i) => {
  const q=(i+1)/100;
  const cost=-p*Math.log2(q)-(1-p)*Math.log2(1-q);
  return `${i ? 'L' : 'M'}${graphX(q)} ${graphY(cost)}`;
});
document.getElementById('cross-entropy-curve').setAttribute('d',points.join(' '));
document.getElementById('entropy-baseline').setAttribute('d',`M60 ${graphY(entropy)}H610`);
function update() {
  const q = Number(slider.value) / 100;
  const crossEntropy = -p * Math.log2(q) - (1-p) * Math.log2(1-q);
  const mismatch = Math.max(0, crossEntropy - entropy);
  const marker = document.getElementById('cross-entropy-marker');
  marker.setAttribute('cx',graphX(q));
  marker.setAttribute('cy',graphY(crossEntropy));
  document.getElementById('model-probability-label').textContent = `${slider.value}%`;
  document.getElementById('cross-entropy-value').textContent = `${crossEntropy.toFixed(3)} bits`;
  document.getElementById('mismatch-value').textContent = `${mismatch.toFixed(3)} bits`;
  // Q(A) ranges from 1% to 99%; the maximum cost is below 5 bits.
  // Keep this axis fixed so the data entropy never changes visual width.
  const scale = 5;
  document.getElementById('entropy-bar').style.width = `${100*entropy/scale}%`;
  document.getElementById('mismatch-bar').style.width = `${100*mismatch/scale}%`;
}
slider.addEventListener('input',update);
update();
