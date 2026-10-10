import test from 'node:test';
import assert from 'node:assert/strict';
import {probabilityRegions} from '../web/probability-view.js';

test('Display regions cover the full vocabulary and preserve selected boundaries', () => {
  const cdf = Uint32Array.from({length:50258}, (_, i) => i);
  for (const selected of [0, 25128, 50256]) {
    const regions = probabilityRegions(cdf, selected, []);
    assert.equal(regions[0].start, 0);
    assert.equal(regions.at(-1).end, 1);
    assert.ok(regions.length < 265);
    regions.forEach((region, i) => {
      assert.ok(region.end > region.start);
      if (i) {
        assert.equal(region.start, regions[i-1].end);
        assert.equal(region.first, regions[i-1].last+1);
      }
    });
    const chosen = regions.find(region => region.first === selected);
    assert.equal(chosen.last, selected);
    assert.equal(chosen.start, cdf[selected]/cdf.at(-1));
    assert.equal(chosen.end, cdf[selected+1]/cdf.at(-1));
  }
});
