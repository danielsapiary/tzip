import {huffmanCodeLengths} from './huffman.js';
import {AutoTokenizer, AutoModelForCausalLM, Tensor, DynamicCache, env} from '@huggingface/transformers';
import {cumulativeBounds, distribution, limitText, MAX_CHARACTERS, narrowCumulative, tokenBytes, tokenLabel} from './core.js';

const MODEL = 'Xenova/gpt2';
const REVISION = 'bf2c7f02e0b826c60d03af341171bde20893da66';
const CONTEXT_TOKENS = 1024;
env.allowLocalModels = false;
env.backends.onnx.wasm.numThreads = 1;
let resources;
let cancelled = false;
let busy = false;
const send = value => self.postMessage(value);

async function loadModel() {
  if (resources) return resources;
  const progress_callback = info => {
    if (info.status === 'progress') send({type:'progress', stage:'Downloading GPT-2', percent: Math.min(99, info.progress || 0), detail:`${info.file}: ${(info.loaded / 1048576).toFixed(1)} MiB downloaded. Files are cached by your browser.`});
    else send({type:'progress', stage:'Loading GPT-2', detail:`${info.file || 'ONNX inference runtime'} · ${info.status}`});
  };
  const tokenizer = await AutoTokenizer.from_pretrained(MODEL, {revision: REVISION, progress_callback});
  // Disable special-string recognition: literal <|endoftext|> is input content.
  // These tokenizer fields are verified against the pinned Transformers.js version.
  const config = structuredClone(tokenizer._tokenizerJSON);
  config.added_tokens = [];
  config.post_processor = null;
  const fileTokenizer = new tokenizer.constructor(config, tokenizer._tokenizerConfig);
  const vocabulary = Array.from({length:50257}, (_, id) => tokenizer._tokenizer.id_to_token(id));
  if (vocabulary.some(token => typeof token !== 'string')) throw new Error('Incomplete GPT-2 vocabulary');
  const bytes = vocabulary.map(tokenBytes);
  const labels = bytes.map(tokenLabel);
  const model = await AutoModelForCausalLM.from_pretrained(MODEL, {revision: REVISION, device:'wasm', dtype:'int8', progress_callback});
  resources = {tokenizer: fileTokenizer, model, bytes, labels};
  return resources;
}

async function trace(text) {
  if (typeof text !== 'string' || limitText(text) !== text || Array.from(text).length > MAX_CHARACTERS) throw new Error('Use at most 2,048 Unicode characters');
  if (!text.length) {send({type:'tokens',tokens:[],pieces:[],labels:[]}); return;}
  const {tokenizer, model, bytes, labels} = await loadModel();
  if (cancelled) return;
  const tokens = tokenizer.encode(text, {add_special_tokens:false});
  const pieces = tokens.map(id => Array.from(bytes[id]));
  const original = new TextEncoder().encode(text);
  const huffmanLengths = huffmanCodeLengths(tokens);
  const reconstructed = pieces.flat();
  if (original.length !== reconstructed.length || original.some((byte,index) => byte !== reconstructed[index])) throw new Error('Tokenizer did not preserve the UTF-8 input');
  send({type:'tokens',tokens,pieces,labels:tokens.map(id=>labels[id])});
  let past = new DynamicCache();
  let before = {low:0n, high:1n, denominator:1n};
  let precedingBytes = 0, precedingBits = 0, precedingHuffmanBits = 0;
  try {
    for (let index = 0; index < tokens.length; index++) {
      if (cancelled) break;
      const position = index % CONTEXT_TOKENS;
      const blockStart = index - position;
      if (!position) {await past.dispose(); past = new DynamicCache();}
      send({type:'progress',stage:`Predicting token ${index+1} of ${tokens.length}`,completed:index,total:tokens.length,percent:100*index/tokens.length,detail:`GPT-2 on your browser CPU: BOS + ${position} preceding tokens. ${position ? 'Reusing KV cache.' : 'Starting a fresh context block.'} Computing all 50,257 logits.`});
      const input = position ? tokens[index-1] : 50256;
      const output = await model({input_ids:new Tensor('int64',BigInt64Array.of(BigInt(input)),[1,1]), attention_mask:new Tensor('int64',new BigInt64Array(position+1).fill(1n),[1,position+1]), past_key_values:past});
      const cache = {};
      for (const [name,value] of Object.entries(output)) {
        if (name.startsWith('present')) cache[name.replace('present','past_key_values')] = value;
      }
      if (!Object.keys(cache).length) throw new Error('GPT-2 did not return a reusable KV cache');
      past.update(cache);
      const logits = output.logits.data;
      const {cdf, probabilities} = distribution(logits.subarray(logits.length-50257));
      const symbol = tokens[index];
      const narrowed = narrowCumulative(before,cdf,symbol);
      const start = Math.max(0,Math.min(50226,symbol-15));
      const rows = Array.from({length:31},(_,offset) => {
        const id = start+offset;
        return {id,label:labels[id],probability:(cdf[id+1]-cdf[id])/cdf.at(-1)};
      });
      const probability = (cdf[symbol+1]-cdf[symbol])/cdf.at(-1);
      const cumulativeBits = precedingBits - Math.log2(probability);
      const digits = Math.max(10, Math.ceil(cumulativeBits/Math.log2(10))+4);
      send({type:'step',step:{symbol,label:labels[symbol],blockStart,precedingBytes,precedingBits,precedingHuffmanBits,beforeBounds:cumulativeBounds(before,digits),newBounds:cumulativeBounds(narrowed,digits),selectionStart:cdf[symbol]/cdf.at(-1),cumulativeBits,probability,modelProbability:probabilities[symbol],rows}});
      before = narrowed;
      precedingBits -= Math.log2(probability);
      precedingHuffmanBits += huffmanLengths[symbol];
      precedingBytes += pieces[index].length;
      // Yield so cancel messages can be processed even on a very fast runtime.
      await new Promise(resolve=>setTimeout(resolve,0));
    }
  } finally {await past.dispose();}
}

self.addEventListener('message', async ({data}) => {
  if (data.type === 'cancel') {cancelled = true; return;}
  if (data.type !== 'trace' || busy) return;
  busy = true; cancelled = false;
  try {await trace(data.text); send({type:'done',cancelled});}
  catch (error) {send({type:'error',message:error.message || String(error)});}
  finally {busy = false;}
});
