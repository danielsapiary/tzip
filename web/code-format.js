/** Group fractional bits from the left; right padding preserves the exact point. */
export function arithmeticCodeToHex(code) {
  const [count, bits] = code.split(':');
  const padded = bits.padEnd(Math.ceil(bits.length / 4) * 4, '0');
  return `${count}:${padded.match(/.{4}/g).map(group => parseInt(group, 2).toString(16)).join('')}`;
}

export function arithmeticCodeFromHex(code) {
  const match = /^(0|[1-9][0-9]*):([0-9a-f]+)$/i.exec(code.replace(/\s/g, ''));
  if (!match) throw new Error('Invalid arithmetic code. Expected <token count>:<hexadecimal fraction digits>.');
  if (!Number.isSafeInteger(Number(match[1])) || Number(match[1]) > 8192 || match[2].length > 250000) {
    throw new Error('Arithmetic code exceeds the supported size.');
  }
  const bits = Array.from(match[2], digit => parseInt(digit, 16).toString(2).padStart(4, '0')).join('');
  return `${match[1]}:${bits.replace(/0+$/, '') || '0'}`;
}
