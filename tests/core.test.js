import test from 'node:test';
import assert from 'node:assert/strict';
import {bounds, byteCharacters, COUNT_TOTAL, distribution, FULL, limitText, narrowInterval, tokenBytes, tokenLabel} from '../web/core.js';

test('Unicode code point limit preserves surrogate pairs', () => {
  assert.equal(Array.from(limitText('🦋'.repeat(2049))).length,2048);
  assert.equal(limitText('🦋'.repeat(2049)), '🦋'.repeat(2048));
  assert.equal(limitText('a'.repeat(2048)), 'a'.repeat(2048));
});
test('GPT-2 ByteLevel alphabet covers every byte exactly once', () => {
  const inverse = byteCharacters();
  assert.equal(inverse.size,256);
  assert.equal(new Set(inverse.values()).size,256);
  assert.deepEqual([...tokenBytes('Ġbanana')],[32,98,97,110,97,110,97]);
  assert.equal(tokenLabel(tokenBytes('Ġbanana')), '" banana"');
  assert.equal(tokenLabel(Uint8Array.of(255)), '\\xff');
});
test('Complete positive integer distribution and exact interval subdivision', () => {
  const logits = new Float32Array(50257);
  logits[3820] = 8;
  const {cdf,probabilities} = distribution(logits);
  assert.equal(cdf.length,50258);
  assert.equal(cdf.at(-1),COUNT_TOTAL);
  for (let i=0;i<50257;i++) assert.ok(cdf[i+1]>cdf[i]);
  assert.ok(Math.abs(probabilities.reduce((sum,p)=>sum+p,0)-1)<1e-10);
  const result = narrowInterval([0,FULL-1],cdf,3820);
  assert.deepEqual(result.narrowed,[Math.floor(FULL*cdf[3820]/COUNT_TOTAL),Math.floor(FULL*cdf[3821]/COUNT_TOTAL)-1]);
  assert.ok(result.after[1]>result.after[0]);
  assert.ok(result.after[0]>=0 && result.after[1]<FULL);
  assert.match(bounds(result.narrowed),/^\[0\./);
});
test('Incomplete and non-finite model outputs fail explicitly', () => {
  assert.throws(()=>distribution(new Float32Array(50)), /50,257/);
  const logits = new Float32Array(50257); logits[0] = NaN;
  assert.throws(()=>distribution(logits), /non-finite/);
});
test('Long interval traces remain representable', () => {
  const {cdf} = distribution(new Float32Array(50257));
  let before = [0,FULL-1];
  for (let i=0;i<8192;i++) {
    const result = narrowInterval(before,cdf,i%50257);
    assert.ok(result.narrowed[0]<=result.narrowed[1]);
    assert.ok(result.after[0]>=0 && result.after[1]<FULL);
    before = result.after;
  }
});

test('Ordinary Huffman uses whole-input GPT-2 token frequencies', async () => {
  const {huffmanCodeLengths} = await import('../web/huffman.js');
  const tokens = [1000,1000,1000,1000,2000,2000,3000,50256];
  const lengths = huffmanCodeLengths(tokens);
  assert.deepEqual([1000,2000,3000,50256].map(id=>lengths[id]),[1,2,3,3]);
  assert.equal(tokens.reduce((sum,token)=>sum+lengths[token],0),14);
  assert.deepEqual(huffmanCodeLengths(tokens),huffmanCodeLengths(tokens));
  assert.equal(lengths[0],0);
  assert.equal(huffmanCodeLengths([]).reduce((a,b)=>a+b,0),0);
  assert.equal(huffmanCodeLengths([50256,50256])[50256],1);
  assert.throws(()=>huffmanCodeLengths([50257]),/Invalid GPT-2 token/);
  assert.throws(()=>huffmanCodeLengths([-1]),/Invalid GPT-2 token/);
});

test('Cumulative bounds shrink without rescaling or floating-point underflow', async () => {
  const {narrowCumulative,cumulativeBounds}=await import('../web/core.js');
  const cdf=[0,1,3,4];
  let interval={low:0n,high:1n,denominator:1n};
  interval=narrowCumulative(interval,cdf,1);
  assert.equal(cumulativeBounds(interval,4),'[0.2500, 0.7500)');
  interval=narrowCumulative(interval,cdf,0);
  assert.equal(cumulativeBounds(interval,4),'[0.2500, 0.3750)');
  for (let i=0;i<2048;i++) {
    const next=narrowCumulative(interval,cdf,i%3);
    assert.ok(next.low*interval.denominator>=interval.low*next.denominator);
    assert.ok(next.high*interval.denominator<=interval.high*next.denominator);
    assert.ok((next.high-next.low)*interval.denominator<(interval.high-interval.low)*next.denominator);
    interval=next;
  }
  assert.ok(interval.high>interval.low);
  const rendered=cumulativeBounds(interval,1400);
  const [left,right]=rendered.slice(1,-1).split(', ');
  assert.notEqual(left,right);
});

test('Decode tokens from the encoded point and recovered context only', async () => {
  const {decodeSymbol,intervalPoint,narrowCumulative}=await import('../web/core.js');
  const input=Array.from({length:2048},(_,i)=>(i*17+i%7)%3);
  const predict = prefix => prefix.at(-1)===1 ? [0,2,3,8] : [0,1,5,8];
  let interval={low:0n,high:1n,denominator:1n};
  for (let i=0;i<input.length;i++) interval=narrowCumulative(interval,predict(input.slice(0,i)),input[i]);
  const point=intervalPoint(interval);
  const recovered=[];
  interval={low:0n,high:1n,denominator:1n};
  for (let i=0;i<input.length;i++) {
    const cdf=predict(recovered);
    const decoded=decodeSymbol(interval,point,cdf);
    assert.ok(decoded.position>=0 && decoded.position<=1);
    recovered.push(decoded.symbol);
    interval=narrowCumulative(interval,cdf,decoded.symbol);
  }
  assert.deepEqual(recovered,input);
});

test('Decoder respects half-open boundaries and rejects points outside the interval', async () => {
  const {decodeSymbol}=await import('../web/core.js');
  const interval={low:0n,high:1n,denominator:1n};
  assert.equal(decodeSymbol(interval,{numerator:0n,denominator:1n},[0,1,2,4]).symbol,0);
  assert.equal(decodeSymbol(interval,{numerator:1n,denominator:4n},[0,1,2,4]).symbol,1);
  assert.equal(decodeSymbol(interval,{numerator:1n,denominator:2n},[0,1,2,4]).symbol,2);
  assert.throws(()=>decodeSymbol(interval,{numerator:1n,denominator:1n},[0,1,2,4]),/outside/);
});

test('Live binary-fraction point remains valid or gains precision when an interval narrows', async () => {
  const {encodeArithmeticText,narrowCumulative,parseArithmeticText}=await import('../web/core.js');
  const sequence=[0,2,1,1,0,2,2,0];
  const predict=prefix=>prefix.at(-1)===2 ? [0,1,4,8] : [0,3,5,8];
  let interval={low:0n,high:1n,denominator:1n};
  let bits='1';
  let point={numerator:1n,denominator:2n};
  for (let i=0;i<sequence.length;i++) {
    const narrowed=narrowCumulative(interval,predict(sequence.slice(0,i)),sequence[i]);
    const inside=point.numerator*narrowed.denominator>=narrowed.low*point.denominator &&
      point.numerator*narrowed.denominator<narrowed.high*point.denominator;
    if (!inside) {
      const parsed=parseArithmeticText(encodeArithmeticText(narrowed,i+1,bits.length+1));
      assert.ok(parsed.bits.length>bits.length);
      bits=parsed.bits;
      point=parsed.point;
    }
    assert.ok(point.numerator*narrowed.denominator>=narrowed.low*point.denominator);
    assert.ok(point.numerator*narrowed.denominator<narrowed.high*point.denominator);
    const code=parseArithmeticText(`${i+1}:${bits}`);
    assert.deepEqual(code.point,point);
    interval=narrowed;
  }
});
