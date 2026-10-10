# GPT-2 Compress

[Live site](https://danielsapiary.github.io/tzip/) · [GPT-2 demo](https://danielsapiary.github.io/tzip/demo.html)

An educational tool for exploring autoregressive token prediction and arithmetic
interval narrowing. **GPT-2 runs entirely client-side in a browser worker.**
Enter up to **2,048 Unicode code points** and step through real next-token
probabilities. Your input is processed locally and is never sent to an inference
server.

## Autoregressive Compression

An optimal predictive model and an optimal ideal compressor share an objective.
For a fixed tokenization, a token assigned probability `p` costs `−log₂(p)` bits
in an ideal arithmetic code. Averaging this cost gives cross-entropy in bits per
token. Minimizing predictive cross-entropy therefore minimizes expected ideal
encoding length. Training loss measured in natural logarithms has the same
minimizer; converting to bits multiplies by `1 / ln(2)`. Actual coding adds
quantization and framing overhead, so the equivalence concerns ideal lengths.

The [About page](index.html) explains entropy, cross-entropy, the perfect-model
case, arithmetic coding, and deriving predictions from compressed lengths.
It cites *Language Modeling Is Compression* (Delétang et al., ICLR 2024) and
Stanford information theory notes, and Claude Shannon’s foundational 1948 paper,
with typeset LaTeX equations and an interactive
cross-entropy curve. Both pages share the same content width.

## Run locally

Requires Node.js 22.12+ and npm.

```sh
npm ci --ignore-scripts
npm run dev
```

Open the localhost URL printed by Vite. The About page opens first; its navigation
and bottom link lead to the demo. Hints and examples start collapsed.
Click **Encode** to download
and initialize GPT-2, then compute the trace. The first run downloads quantized
model weights (approximately 130 MB) and runtime assets; subsequent runs use the
browser cache when available. Download and inference progress appear in the UI.
The browser needs sufficient memory and supports WebAssembly; long inputs can
be slow. **Stop tracing** cancels between inference calls, preserving computed
steps. Downloading/initializing an in-flight model cannot stop immediately.

## Decoding demonstration

As each token step is computed, the **arithmetic code** updates below the
source text to encode the prefix reached so far. Step backward or forward to
inspect the corresponding prefix code. After encoding, it contains the full
sequence. When computation finishes, both modes return to the ▶ start marker;
the complete arithmetic code remains in the top box. Switch to **Decode** and
the code itself is placed in the editable code field; you can also paste code there directly. Decode reads only that code
and the pinned GPT-2 model, regenerating the same integer probability
distributions from the recovered context. Once decoding finishes, all recovered
token chips remain visible and clickable, including at the start marker. The binary fraction stays fixed: the walkthrough partitions the current
interval, identifies the subregion containing its point, and zooms into that
subregion. Subpixel token regions are grouped visually; all vocabulary
probabilities still participate, and the selected token retains exact boundaries.

The text format is `<token-count>:<binary-fraction-bits>`. The bits represent a
dyadic rational strictly inside the final arithmetic interval, and the leading
count marks the end of the token sequence. While encoding, the demo keeps this
point as the model narrows the interval for each token. If the point remains
inside, it is preserved; otherwise the encoder adds binary precision and picks
a new point inside the narrower interval. The diagram first draws the new
bounds within the grey previous interval. If the point is outside, it turns red,
moves inside, and turns blue before zooming. The bounds and point zoom together
into the selected interval. The old interval and its end
bars fade out as the zoom finishes. In Encode, the current `0.bits` fraction is
shown above the probability table; new digits appear during the point's
move into the selected interval, with the newest digit temporarily enlarged.
Each animation stage pauses for reading, and autoplay advances every 8 seconds.
Selecting an earlier token or stepping left
snaps directly to that step's completed view, without replaying the animation.
The `▶` chip selects the start of the sequence, before any input token has been
encoded or decoded. Left from the first token and Restart also return there.
Decode keeps the code in the top input box and hides the duplicate fraction
display in the walkthrough. Before selecting a token, the right panel reads
“Finding new interval overlapping point.” The supplied point stays fixed: each regenerated token interval is checked for the point, then the
diagram zooms in while keeping that same value. The code can be copied as text,
but it depends
on this demo's pinned GPT-2 model and probability quantization; it is not a
model-independent archive format. Stop tracing also cancels decoding between
inference steps.

## What the walkthrough shows

- A single bar for preceding input: blue shows model information cost and red
  shows extra UTF-8 bits. Progress hides after tracing.
- A full-input ideal bits-per-Unicode-character result beside Shannon’s historical
  estimate of about one bit per letter for printed English. The model result
  uses the illustrated probabilities and stays fixed while stepping through.
- An ordinary Huffman comparison using GPT-2 token frequencies from the entire
  input, independent of model predictions. It sums code lengths for the same
  preceding tokens, excluding codebook, length metadata, and final byte padding.
  A single distinct token uses a one-bit code.
- Bee movie, All Star · Smash Mouth, and Random text preset chips; random text uses 300 uniformly sampled
  printable ASCII characters. Editing the input deselects both chips.
- GPT-2 BPE tokens, including visible spaces and byte escapes for token pieces
  that split a Unicode character.
- An ordered section of the token probability distribution on the left and a
  selected-bound diagram on the right. All **50,257 logits** participate in
  prediction; the table is only a display slice.
- The Encode and Decode strips show GPT-2 token labels. Decode discovers each
  token by locating the fixed code point in the model's regenerated intervals.
- Previous/Next, left/right arrows, clickable tokens, restart, and playback.
  Arrow keys retain normal behavior while editing text.

GPT-2's context is limited to 1,024 token positions. The tool starts each block
with BOS and resets its KV cache every 1,024 predictions. It traces the entire
input without silently truncating it.
The information comparison counts all preceding input bytes, across blocks.

Softmax uses the complete logit vector. For the interval demonstration, each
vocabulary token receives a positive integer count, with a total of 1,048,576.
Remaining counts are assigned by largest remainder, with token-ID tie breaking.
The UI shows the quantized probabilities actually used by the illustration.
Displayed bounds are exact BigInt fractions on the original `[0, 1)` scale,
with an exclusive upper endpoint. They shrink cumulatively without rescaling.
The cumulative interval width is the main metric, shown in scientific notation
without floating-point underflow. Expand “Inspect current and new bounds” for
full decimal endpoints, rounded outward at increasing precision. The diagram
zooms into the preceding interval.

The comparison bar is an **information estimate**, not the size of the
arithmetic code. The code is model-specific and educational, not a general archive
format. CPU WASM inference uses the browser's local ONNX runtime. No WebGPU or
hosted inference fallback is involved.

## Build and deploy

```sh
npm run build
npm run preview
```

Deploy the generated **`dist/` directory** to any static host over HTTPS.
It contains the page, styles, JavaScript, and worker. Relative asset paths support
hosting under a subdirectory. There are no backend routes, API keys, databases,
or Python processes. Node.js is a development/build dependency only.

Visitors still download model files from Hugging Face and runtime assets from
jsDelivr. These providers see ordinary asset requests, but not the text entered
into the tool. Browser caching depends on storage availability and browser policy;
this is not a guaranteed offline application. Restrictive hosting CSPs must
permit the external asset downloads and WebAssembly runtime.

### GitHub Pages

A deployment workflow is included in `.github/workflows/pages.yml`. In the
GitHub repository, open **Settings → Pages** and choose **GitHub Actions** as
the source. Commit and push to `main`; the workflow tests, builds, and publishes
`dist/`. You can also run it manually from the Actions tab.

For this repository the site URL is `https://danielsapiary.github.io/tzip/`.
The About page opens first, with the demo at `demo.html`. Vite uses relative
asset paths (`base: './'`), so both pages work under the repository subdirectory.
Keep `dist/`, `node_modules/`, and model weights out of Git; the workflow generates
the build and visitors fetch the model in their browser.

## Model and implementation

The pinned [Xenova/GPT-2 ONNX model](https://huggingface.co/Xenova/gpt2) revision is
`bf2c7f02e0b826c60d03af341171bde20893da66`, using its `int8` weights.
[Transformers.js](https://huggingface.co/docs/transformers.js) supplies the tokenizer
and inference runtime. Ordinary text uses GPT-2's ByteLevel BPE. Literal
`<|endoftext|>` strings are treated as text, not control tokens. Token bytes are
checked against the original UTF-8 input before tracing.

| File | Responsibility |
| --- | --- |
| `demo.html` | Accessible input, progress, and walkthrough |
| `index.html`, `web/about.js` | Cited theory and interactive cross-entropy example |
| `web/app.js` | UI state, streamed steps, and navigation |
| `web/interval-diagram.js` | Shared interval coordinates and staged point/zoom animation |
| `web/probability-view.js` | Complete-distribution display regions, grouping subpixel intervals |
| `web/huffman.js` | Huffman code lengths from whole-input token frequencies |
| `web/model-worker.js` | Model loading, tokenization, full-logit inference, KV cache |
| `web/core.js` | Unicode limits, byte labels, probabilities, interval mathematics |
| `web/style.css` | Responsive layout and wrapping contexts |

The repository uses Transformers.js for inference and KaTeX for equations, plus Vite and
Playwright for building and testing. `package-lock.json` is tracked. Dependencies,
builds, browser reports, environment files, and model caches are ignored.

## Checks

```sh
npm test
npm run build
npm run test:browser
TZIP_MODEL_TESTS=1 npm run test:browser
```

Unit tests cover Unicode limits, byte mappings, complete distributions, invalid
logits, interval subdivision, exact encode/decode round trips, long numeric
traces, zoom geometry, and full-vocabulary display region coverage. Browser
tests use installed Google Chrome and cover input limits, mobile layout, empty
input, and a mocked encode/decode walkthrough, including animation stages,
clickable token navigation, and preserving the full code at the start marker.
The opt-in live test downloads and runs the real GPT-2 model, checks navigation
and full-vocabulary output, and verifies there are no inference API requests or
text uploads. CI runs unit tests and the production build without model downloads.

MIT license; model and dependency licenses remain their respective owners'.
