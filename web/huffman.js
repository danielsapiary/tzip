/** Build one ordinary Huffman code from the whole input's GPT-2 token counts.
 * Unused tokens have length zero. A one-symbol alphabet uses a one-bit code.
 * Sorted leaves and merged-node queues keep equal-weight ties deterministic.
 * Only payload lengths are calculated; transmitting the tree is excluded.
 */
export function huffmanCodeLengths(tokens) {
  const counts = new Uint32Array(50257);
  for (const token of tokens) {
    if (!Number.isInteger(token) || token < 0 || token >= 50257) throw new Error('Invalid GPT-2 token');
    counts[token]++;
  }
  const symbols = Array.from({length:50257},(_,id)=>id).filter(id=>counts[id]);
  const lengths = new Uint16Array(50257);
  const n = symbols.length;
  if (!n) return lengths;
  if (n===1) {lengths[symbols[0]]=1; return lengths;}
  const weights = new Float64Array(2*n-1);
  const parents = new Int32Array(2*n-1).fill(-1);
  const leaves = symbols.map((symbol,id)=>{weights[id]=counts[symbol]; return id;})
    .sort((a,b)=>weights[a]-weights[b] || symbols[a]-symbols[b]);
  let leaf=0, merged=n;
  function take(next) {
    if (leaf<n && (merged>=next || weights[leaves[leaf]]<=weights[merged])) return leaves[leaf++];
    return merged++;
  }
  for (let next=n;next<2*n-1;next++) {
    const a=take(next),b=take(next);
    weights[next]=weights[a]+weights[b];
    parents[a]=parents[b]=next;
  }
  for (let id=0;id<n;id++) {
    for (let node=id;parents[node]!==-1;node=parents[node]) lengths[symbols[id]]++;
  }
  return lengths;
}
