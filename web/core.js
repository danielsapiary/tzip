/** Numeric state for an educational interval trace; no file encoding or decoding. */
export const MAX_CHARACTERS = 2048;
export const FULL = 2 ** 32;
export const COUNT_TOTAL = 2 ** 20;

export function limitText(text) {
  return Array.from(text).slice(0, MAX_CHARACTERS).join('');
}

export function byteCharacters() {
  const visible = [...Array.from({length: 94}, (_, i) => i + 33),
    ...Array.from({length: 12}, (_, i) => i + 161), ...Array.from({length: 82}, (_, i) => i + 174)];
  const inverse = new Map(visible.map(byte => [String.fromCodePoint(byte), byte]));
  let extra = 0;
  for (let byte = 0; byte < 256; byte++) {
    if (!visible.includes(byte)) inverse.set(String.fromCodePoint(256 + extra++), byte);
  }
  return inverse;
}

const inverseBytes = byteCharacters();
export function tokenBytes(token) {
  if (token === '<|endoftext|>') return new Uint8Array();
  return Uint8Array.from(Array.from(token, character => {
    const byte = inverseBytes.get(character);
    if (byte === undefined) throw new Error('Unexpected GPT-2 vocabulary character');
    return byte;
  }));
}

export function tokenLabel(bytes) {
  if (!bytes.length) return '<endoftext>';
  try { return JSON.stringify(new TextDecoder('utf-8', {fatal: true}).decode(bytes)); }
  catch { return Array.from(bytes, byte => `\\x${byte.toString(16).padStart(2, '0')}`).join(''); }
}

export function distribution(logits) {
  if (logits.length !== 50257) throw new Error('GPT-2 must return all 50,257 logits');
  let maximum = -Infinity;
  for (const value of logits) {
    if (!Number.isFinite(value)) throw new Error('Model returned non-finite logits');
    maximum = Math.max(maximum, value);
  }
  const weights = Float64Array.from(logits, value => Math.exp(value - maximum));
  let sum = 0;
  for (const weight of weights) sum += weight;
  const probabilities = Float64Array.from(weights, weight => weight / sum);
  const frequencies = new Uint32Array(weights.length);
  const remainders = new Float64Array(weights.length);
  let assigned = weights.length;
  const budget = COUNT_TOTAL - weights.length;
  for (let id = 0; id < weights.length; id++) {
    const quota = probabilities[id] * budget;
    const floor = Math.floor(quota);
    frequencies[id] = floor + 1;
    remainders[id] = quota - floor;
    assigned += floor;
  }
  const order = Array.from(weights, (_, id) => id).sort((a, b) => remainders[b] - remainders[a] || a - b);
  for (let i = 0; i < COUNT_TOTAL - assigned; i++) frequencies[order[i]]++;
  const cdf = new Uint32Array(weights.length + 1);
  for (let i = 0; i < weights.length; i++) cdf[i + 1] = cdf[i] + frequencies[i];
  return {cdf, probabilities};
}

export function narrowInterval(before, cdf, symbol) {
  const [low, high] = before;
  const width = high - low + 1;
  const total = cdf[cdf.length - 1];
  // Products stay below 2^52, so JS integers remain exact.
  const narrowed = [low + Math.floor(width * cdf[symbol] / total),
    low + Math.floor(width * cdf[symbol + 1] / total) - 1];
  let [left, right] = narrowed;
  const half = FULL / 2, quarter = FULL / 4;
  while (true) {
    if (right < half) { /* Shared leading zero. */ }
    else if (left >= half) { left -= half; right -= half; }
    else if (left >= quarter && right < quarter * 3) { left -= quarter; right -= quarter; }
    else break;
    left *= 2; right = right * 2 + 1;
  }
  return {narrowed, after: [left, right]};
}

export const bounds = interval => `[${(interval[0] / FULL).toFixed(10)}, ${((interval[1] + 1) / FULL).toFixed(10)})`;

/** Exact cumulative [low, high) on the original [0, 1) scale.
 * BigInt rationals avoid underflow and never rescale the displayed interval.
 */
export function narrowCumulative(before, cdf, symbol) {
  const {low, high, denominator} = before;
  const total = BigInt(cdf.at(-1));
  const width = high-low;
  return {
    low:low*total + width*BigInt(cdf[symbol]),
    high:low*total + width*BigInt(cdf[symbol+1]),
    denominator:denominator*total,
  };
}

/** Round endpoints outwards with enough decimal places to see their separation. */
export function cumulativeBounds(interval, digits) {
  const scale=10n**BigInt(digits);
  const {low,high,denominator}=interval;
  const left=low*scale/denominator;
  const right=(high*scale+denominator-1n)/denominator;
  const decimal = value => {
    const text=value.toString().padStart(digits+1,'0');
    return `${text.slice(0,-digits)}.${text.slice(-digits)}`;
  };
  return `[${decimal(left)}, ${decimal(right)})`;
}

/** An exact interior point; token count supplies the stopping condition. */
export function intervalPoint(interval) {
  return {numerator:interval.low+interval.high, denominator:2n*interval.denominator};
}

/** Serialize a completed interval as a finite binary fraction inside it.
 * The token-count prefix tells decoding when to stop.
 */
export function encodeArithmeticText(interval, tokenCount, minimumPrecision = 1) {
  const {low,high,denominator}=interval;
  const width=high-low;
  let bits=Math.max(1,minimumPrecision);
  while ((width<<BigInt(bits)) <= 2n*denominator) bits++;
  let scale=1n<<BigInt(bits);
  let numerator=(low*scale+denominator-1n)/denominator;
  while ((numerator+1n)*denominator > high*scale) {
    bits++;
    scale <<= 1n;
    numerator=(low*scale+denominator-1n)/denominator;
  }
  const pointNumerator=2n*numerator+1n;
  return `${tokenCount}:${pointNumerator.toString(2).padStart(bits+1,'0')}`;
}

/** Parse the visible binary decimal as an exact dyadic point in [0,1). */
export function parseArithmeticText(code) {
  const normalized=code.replace(/\s/g,'');
  const match=/^(0|[1-9][0-9]*):([01]+)$/.exec(normalized);
  if (!match) throw new Error('Invalid arithmetic code. Expected <token count>:<binary fraction bits>.');
  const tokenCount=Number(match[1]);
  const bits=match[2];
  if (!Number.isSafeInteger(tokenCount) || tokenCount>8192 || bits.length>1000000) {
    throw new Error('Arithmetic code exceeds the supported size.');
  }
  return {tokenCount,bits,point:{numerator:BigInt(`0b${bits}`),denominator:1n<<BigInt(bits.length)}};
}

/** Find how many leading code bits uniquely place this dyadic cell inside an interval. */
export function bitsToIdentifyInterval(interval, bits) {
  const {low,high,denominator}=interval;
  const fits = length => {
    const scale=1n<<BigInt(length);
    const prefix=length ? BigInt(`0b${bits.slice(0,length)}`) : 0n;
    return prefix*denominator>=low*scale && (prefix+1n)*denominator<=high*scale;
  };
  let left=0,right=bits.length;
  while (left<right) {
    const middle=Math.floor((left+right)/2);
    if (fits(middle)) right=middle;
    else left=middle+1;
  }
  return left;
}

/** Locate an encoded rational point in the current conditional CDF.
 * Integer comparisons preserve half-open boundary semantics even for tiny ranges.
 * No original token is involved in this lookup.
 */
export function decodeSymbol(interval, point, cdf) {
  const offset=point.numerator*interval.denominator-interval.low*point.denominator;
  const width=(interval.high-interval.low)*point.denominator;
  if (offset<0n || offset>=width) throw new Error('Encoded point is outside the decoding interval');
  const total=BigInt(cdf.at(-1));
  const target=offset*total/width;
  let low=0, high=cdf.length-1;
  while (low+1<high) {
    const middle=Math.floor((low+high)/2);
    if (BigInt(cdf[middle])<=target) low=middle;
    else high=middle;
  }
  return {symbol:low, position:Number(offset*1000000000000n/width)/1e12};
}
