import test from 'node:test';
import assert from 'node:assert/strict';
import {intervalGeometry, VIEW_LEFT, VIEW_WIDTH} from '../web/interval-diagram.js';

test('Zoom preserves nested bounds and keeps the updated point inside the selection', () => {
  // The old point is outside the new interval; use the updated point for zoom.
  const step = {selectionStart:.64, probability:.01, pointPositionAfter:.7, selectedPointPosition:-12};
  for (const zoom of [0, .1, .5, .9, 1]) {
    const layout = intervalGeometry(step, zoom);
    const selectedRight = layout.selectedLeft + layout.selectedWidth;
    assert.ok(layout.selectedLeft >= layout.oldLeft);
    assert.ok(selectedRight <= layout.oldRight);
    assert.ok(layout.point >= layout.selectedLeft && layout.point < selectedRight);
    assert.ok(Math.abs((layout.point-layout.selectedLeft)/layout.selectedWidth-.7) < 1e-12);
  }
  const final = intervalGeometry(step, 1);
  assert.equal(final.selectedLeft, VIEW_LEFT);
  assert.equal(final.selectedWidth, VIEW_WIDTH);
});

test('Tiny and full-probability intervals remain finite throughout the zoom', () => {
  for (const probability of [1, 1/16777216]) {
    const step = {selectionStart:probability===1 ? 0 : .99, probability, pointPositionAfter:.25};
    for (const zoom of [0, .5, 1]) {
      const layout = intervalGeometry(step, zoom);
      assert.ok(Object.values(layout).every(Number.isFinite));
      assert.ok(layout.selectedWidth>0);
    }
  }
});
