// Each step starts in the preceding interval's local coordinates. A single
// affine zoom moves both sets of bounds and the point together.
export const VIEW_LEFT = 57.5;
export const VIEW_WIDTH = 285; // 75% of the 380-unit line.
export const INTERVAL_PLAYBACK_MS = 8000;

export function intervalGeometry(step, zoom = 0) {
  const start = step.selectionStart;
  const probability = step.probability;
  const mix = (from, to) => from + (to - from) * zoom;
  const selectedLeft = VIEW_LEFT + VIEW_WIDTH * start;
  const selectedWidth = VIEW_WIDTH * probability;
  const oldLeft = mix(VIEW_LEFT, VIEW_LEFT - VIEW_WIDTH * start / probability);
  const oldRight = mix(VIEW_LEFT + VIEW_WIDTH, VIEW_LEFT + VIEW_WIDTH * (1 - start) / probability);
  const point = step.pointPositionAfter;
  return {
    oldLeft, oldRight,
    selectedLeft: mix(selectedLeft, VIEW_LEFT),
    selectedWidth: mix(selectedWidth, VIEW_WIDTH),
    point: mix(selectedLeft + selectedWidth * point, VIEW_LEFT + VIEW_WIDTH * point),
  };
}

const ease = t => t * t * (3 - 2 * t);
const progress = (time, start, duration) => Math.max(0, Math.min(1, (time - start) / duration));

export class IntervalDiagram {
  constructor(svg, onPhase, onPointProgress = () => {}) {
    this.svg = svg;
    this.onPhase = onPhase;
    this.onPointProgress = onPointProgress;
    this.frame = null;
    this.elements = Object.fromEntries(['interval-current', 'interval-selection', 'range-start', 'range-end', 'range-new-start', 'range-new-end', 'encoded-marker'].map(id => [id, svg.querySelector(`#${id}`)]));
  }

  cancel() {
    cancelAnimationFrame(this.frame);
    this.frame = null;
  }

  renderStart(mode, point = 0) {
    this.cancel();
    this.svg.querySelector('#interval-partitions').replaceChildren();
    const elements = this.elements;
    const interval = elements['interval-current'];
    interval.setAttribute('x', VIEW_LEFT);
    interval.setAttribute('width', VIEW_WIDTH);
    interval.setAttribute('fill', '#aebbb4');
    interval.setAttribute('opacity', 1);
    elements['interval-selection'].setAttribute('width', 0);
    elements['interval-selection'].setAttribute('opacity', 0);
    for (const [id, x] of [['range-start', VIEW_LEFT], ['range-end', VIEW_LEFT + VIEW_WIDTH]]) {
      elements[id].setAttribute('x1', x);
      elements[id].setAttribute('x2', x);
      elements[id].setAttribute('opacity', 1);
    }
    elements['range-new-start'].setAttribute('opacity', 0);
    elements['range-new-end'].setAttribute('opacity', 0);
    const marker = elements['encoded-marker'];
    marker.toggleAttribute('hidden', mode !== 'decode');
    marker.setAttribute('cx', VIEW_LEFT + VIEW_WIDTH * point);
    marker.setAttribute('cy', 50);
    marker.setAttribute('fill', '#214c59');
    this.svg.dataset.phase = 'start';
    this.onPointProgress(0);
    this.onPhase('start', mode === 'decode'
      ? 'No tokens have been decoded. The supplied binary fraction is fixed inside the initial interval.'
      : 'No input tokens have been encoded. Start with the full interval.');
  }

  render(step, mode, {animate = true} = {}) {
    this.cancel();
    const elements = this.elements;
    const partitions = this.svg.querySelector('#interval-partitions');
    const regions = mode === 'decode' ? (step.partitions || []) : [];
    const regionRects = regions.map((region, index) => {
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('y', 46); rect.setAttribute('height', 8);
      rect.setAttribute('fill', index % 2 ? '#86abb8' : '#b9d1d8');
      rect.setAttribute('stroke', '#fff'); rect.setAttribute('stroke-width', '.35');
      rect.setAttribute('vector-effect', 'non-scaling-stroke');
      const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
      title.textContent = `${region.label}: ${((region.end-region.start)*100).toFixed(4)}%`;
      rect.append(title);
      return rect;
    });
    partitions.replaceChildren(...regionRects);
    elements['interval-selection'].setAttribute('y', 46);
    elements['interval-selection'].setAttribute('height', 8);
    const marker = elements['encoded-marker'];
    const before = step.pointPositionBefore;
    const geometry = intervalGeometry(step);
    const hasPoint = Number.isFinite(before);
    const outside = mode === 'encode' && hasPoint && (before < step.selectionStart || before >= step.selectionStart + step.probability);
    const movePoint = mode === 'encode' && hasPoint && step.pointMoved;
    const initialPoint = hasPoint ? VIEW_LEFT + VIEW_WIDTH * before : geometry.point;
    const drawStart = 1000;
    const drawEnd = drawStart + 880;
    const alertStart = drawEnd + 720;
    const moveStart = alertStart + (outside ? 1200 : 0);
    const moveEnd = moveStart + (movePoint ? 800 : 0);
    const zoomStart = moveEnd + 1000;
    const zoomDuration = 1400;
    let lastPhase;

    const phase = (name, description) => {
      if (name === lastPhase) return;
      lastPhase = name;
      this.svg.dataset.phase = name;
      this.onPhase(name, description);
    };
    const bar = (id, x, width, opacity = 1) => {
      const element = elements[id];
      element.setAttribute('x', x);
      element.setAttribute('width', Math.max(0, width));
      element.setAttribute('opacity', opacity);
    };
    const bound = (id, x, opacity = 1) => {
      const element = elements[id];
      element.setAttribute('x1', x);
      element.setAttribute('x2', x);
      element.setAttribute('opacity', opacity);
    };
    const draw = time => {
      const zoom = ease(progress(time, zoomStart, zoomDuration));
      const layout = intervalGeometry(step, zoom);
      const reveal = ease(progress(time, drawStart, drawEnd - drawStart));
      const fade = ease(progress(time, 0, drawStart));
      const oldOpacity = 1 - ease(progress(time, zoomStart + zoomDuration - 300, 300));
      const oldColor = [206, 104, 55].map((channel, i) => Math.round(channel + ([174, 187, 180][i] - channel) * fade));
      elements['interval-current'].setAttribute('fill', `rgb(${oldColor.join(',')})`);
      bar('interval-current', layout.oldLeft, layout.oldRight - layout.oldLeft, oldOpacity);
      bound('range-start', layout.oldLeft, oldOpacity);
      bound('range-end', layout.oldRight, oldOpacity);
      const decoding = mode === 'decode';
      const selectedVisible = time >= (decoding ? alertStart : drawStart);
      const selectedReveal = decoding ? 1 : reveal;
      const parentWidth = layout.oldRight - layout.oldLeft;
      regions.forEach((region, index) => {
        const width = Math.max(0, Math.min(region.end, reveal) - region.start);
        regionRects[index].setAttribute('x', layout.oldLeft + parentWidth * region.start);
        regionRects[index].setAttribute('width', parentWidth * width);
        regionRects[index].setAttribute('opacity', time >= drawStart ? oldOpacity : 0);
      });
      bar('interval-selection', layout.selectedLeft, layout.selectedWidth * selectedReveal, selectedVisible ? 1 : 0);
      bound('range-new-start', layout.selectedLeft, selectedVisible ? 1 : 0);
      bound('range-new-end', layout.selectedLeft + layout.selectedWidth * selectedReveal, selectedVisible ? 1 : 0);

      const moving = ease(progress(time, moveStart, moveEnd - moveStart || 1));
      this.onPointProgress(!hasPoint ? (time >= drawEnd ? 1 : 0) : (movePoint ? moving : 1));
      const pointBeforeZoom = initialPoint + (geometry.point - initialPoint) * (movePoint ? moving : 0);
      marker.setAttribute('cx', zoom > 0 ? layout.point : pointBeforeZoom);
      const red = outside && time >= alertStart && time < moveEnd;
      marker.setAttribute('fill', red ? '#c94040' : '#214c59');
      marker.setAttribute('cy', red && time < moveStart ? 50 + 4 * Math.sin((time - alertStart) / (moveStart - alertStart) * Math.PI * 8) : 50);
      marker.toggleAttribute('hidden', !hasPoint && time < drawEnd);

      if (time < drawStart) phase('previous', 'Start with the interval determined by the preceding tokens.');
      else if (time < alertStart) phase(mode === 'decode' ? 'partition' : 'select', mode === 'decode' ? 'Divide the current interval into token subregions using GPT-2’s predicted probabilities. The original text is unknown.' : 'Use the next token’s predicted probability to select its subinterval.');
      else if (red) phase(time < moveStart ? 'outside' : 'move', time < moveStart ? 'The red point is outside the token’s subinterval. The binary fraction needs more precision.' : 'Refine the binary fraction to choose a point inside the selected subinterval.');
      else if (time < zoomStart) phase(mode === 'decode' ? 'locate' : 'inside', mode === 'decode' ? 'The encoded point lies in this token’s subinterval, so the decoder recovers this token.' : 'The binary fraction now represents a point inside the selected subinterval.');
      else if (zoom < 1) phase('zoom', '');
      else phase('complete', mode === 'decode' ? 'Use the recovered token as context to predict the next token’s intervals.' : 'Use this interval and the preceding tokens to encode the next token.');
    };
    if (!animate) {
      draw(zoomStart + zoomDuration);
      return;
    }
    // Render synchronously so interrupted steps never leave stale bounds behind.
    draw(0);
    let started;
    const tick = now => {
      started ??= now;
      const time = now - started;
      draw(time);
      if (time < zoomStart + zoomDuration) this.frame = requestAnimationFrame(tick);
      else this.frame = null;
    };
    this.frame = requestAnimationFrame(tick);
  }
}
