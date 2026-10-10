// Coalesce subpixel intervals for display only. Every vocabulary probability
// participates; the selected token and its neighbors retain exact boundaries.
export function probabilityRegions(cdf, selected, labels) {
  const total = cdf.at(-1);
  const regions = [];
  let first = 0;
  for (let last = 0; last < cdf.length - 1; last++) {
    if (cdf[last + 1] - cdf[first] >= total / 256 ||
        (last >= selected - 2 && last <= selected + 1) || last === cdf.length - 2) {
      regions.push({first, last, start:cdf[first] / total, end:cdf[last + 1] / total,
        label:first === last ? labels[first] : `Tokens ${first}–${last}`});
      first = last + 1;
    }
  }
  return regions;
}
