import test from 'node:test';
import assert from 'node:assert/strict';
import {arithmeticCodeToHex, arithmeticCodeFromHex} from '../web/code-format.js';
import {parseArithmeticText} from '../web/core.js';

test('Hex fractions preserve leading zeros and non-nibble-aligned points', () => {
  for (const bits of ['1', '001', '10101', '000000001', '10110010', '0']) {
    const binary = `3:${bits}`;
    const hex = arithmeticCodeToHex(binary);
    const before = parseArithmeticText(binary).point;
    const after = parseArithmeticText(arithmeticCodeFromHex(hex)).point;
    assert.equal(before.numerator * after.denominator, after.numerator * before.denominator);
  }
  assert.equal(arithmeticCodeToHex('3:001'), '3:2');
  assert.equal(arithmeticCodeFromHex(' 3: Ab '), '3:10101011');
});

test('Reject malformed or oversized hexadecimal code', () => {
  for (const code of ['3:g', '3:', '-1:ab', '8193:ab', '3:0x12']) {
    assert.throws(() => arithmeticCodeFromHex(code));
  }
});
