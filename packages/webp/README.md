# @jsquash/webp

[![npm version](https://badge.fury.io/js/@jsquash%2Fwebp.svg)](https://badge.fury.io/js/@jsquash%2Fwebp)

An easy experience for encoding and decoding WebP images in the browser. Powered by WebAssembly ⚡️.

Uses the [libwebp](https://github.com/webmproject/libwebp) library.

A [jSquash](https://github.com/jamsinclair/jSquash) package. Codecs and supporting code derived from the [Squoosh](https://github.com/GoogleChromeLabs/squoosh) app.

## Installation

```shell
npm install --save @jsquash/webp
# Or your favourite package manager alternative
```

## Usage

Note: You will need to either manually include the wasm files from the codec directory or use a bundler like WebPack or Rollup to include them in your app/server.

### decode(data: ArrayBuffer): Promise<ImageData>

Decodes WebP binary ArrayBuffer to raw RGB image data.

#### data

Type: `ArrayBuffer`

#### Example

```js
import { decode } from '@jsquash/webp';

const formEl = document.querySelector('form');
const formData = new FormData(formEl);
// Assuming user selected an input WebP file
const imageData = await decode(await formData.get('image').arrayBuffer());
```

### encode(data: ImageData, options?: EncodeOptions): Promise<ArrayBuffer>

Encodes raw RGB image data to WebP format and resolves to an ArrayBuffer of binary data.

#### data

Type: `ImageData`

#### options

Type: `Partial<EncodeOptions>`

The WebP encoder options for the output image. [See default values](./meta.ts).

#### Example

```js
import { encode } from '@jsquash/webp';

async function loadImage(src) {
  const img = document.createElement('img');
  img.src = src;
  await new Promise((resolve) => (img.onload = resolve));
  const canvas = document.createElement('canvas');
  [canvas.width, canvas.height] = [img.width, img.height];
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, img.width, img.height);
}

const rawImageData = await loadImage('/example.png');
const webpBuffer = await encode(rawImageData);
```

## Manual WASM initialisation (not recommended)

In most situations there is no need to manually initialise the provided WebAssembly modules.
The generated glue code takes care of this and supports most web bundlers.

One situation where this arises is when using the modules in Cloudflare Workers ([See the README for more info](/README.md#usage-in-cloudflare-workers)).

The `encode` and `decode` modules both export an `init` function that can be used to manually load the wasm module.

```js
import decode, { init as initWebpDecode } from '@jsquash/webp/decode';

initWebpDecode(WASM_MODULE); // The `WASM_MODULE` variable will need to be sourced by yourself and passed as an ArrayBuffer.
const image = await fetch('./image.webp')
  .then((res) => res.arrayBuffer())
  .then(decode);
```

You can also pass custom options to the `init` function to customise the behaviour of the module. See the [Emscripten documentation](https://emscripten.org/docs/api_reference/module.html#Module) for more information.

```js
import decode, { init as initWebpDecode } from '@jsquash/webp/decode';

initWebpDecode(null, {
  // Customise the path to load the wasm file
  locateFile: (path, prefix) => `https://example.com/${prefix}/${path}`,
});
const image = await fetch('./image.webp')
  .then((res) => res.arrayBuffer())
  .then(decode);
```

## Known Issues

See [jSquash Project README](https://github.com/jamsinclair/jSquash#known-issues)

## Choosing a single build (optional)

`@jsquash/webp/encode` and `@jsquash/webp/decode` pick a build at runtime,
testing for WebAssembly SIMD and falling back if it is missing. That is the
right default and nothing about it has changed.

The cost is that a bundler following that check cannot know which branch you
will take, so it emits **both** `.wasm` files. If you already know what you are
targeting, import a single-variant entry point instead and ship one:

| Entry point                   | Build             | Use when                                            |
| ----------------------------- | ----------------- | --------------------------------------------------- |
| `@jsquash/webp/encode`        | chosen at runtime | default; you do not know the target                 |
| `@jsquash/webp/encode-simd`   | SIMD              | Node, Deno, Cloudflare Workers, any current browser |
| `@jsquash/webp/encode-scalar` | baseline          | you must support a runtime without SIMD             |

`decode`, `decode-simd` and `decode-scalar` mirror this.

```js
// Before: works everywhere, bundles webp_enc.wasm and webp_enc_simd.wasm
import encode from '@jsquash/webp/encode';

// After: same API, bundles webp_enc_simd.wasm only
import encode from '@jsquash/webp/encode-simd';
```

The API is identical — same options, same `init()`, same `dispose()` — so
switching is a one-line change and switching back is too. Each entry point
keeps its own module instance, so `dispose()` on one does not affect another.

Bundlers resolve these without a file extension, as shown above. Node's ESM
resolver does not, so under plain Node use `@jsquash/webp/encode-simd.js`.

WebAssembly SIMD is available in every browser these packages target, as well
as Node, Deno and Cloudflare Workers, so `-simd` is the right choice for most
applications. Reach for `-scalar` only if you genuinely need to support a
runtime without it.

## Sharp YUV, and when to turn it on

`use_sharp_yuv` is off by default, matching libwebp and `cwebp` upstream. It is
worth turning on for **text, UI and screenshot content**, and generally not
worth it for photographs.

WebP stores chroma at half resolution (4:2:0). Sharp YUV uses a better
downsampling filter, which markedly reduces colour bleed on saturated edges —
red text on white being the classic case.

Measured on this repository's benchmark fixtures:

| content           | encode time | size  | luma SSIM | chroma RMSE |
| ----------------- | ----------- | ----- | --------- | ----------- |
| photographic      | +9%         | +3.6% | -0.005    | **-14%**    |
| red text on white | +30%        | +9.5% | -0.009    | **-34%**    |

The reason it earns its place is that **raising quality does not fix colour
bleed**. On the red-on-white fixture, sharp YUV at quality 75 produces a 67.4 KB
file; plain YUV needs quality 81 to reach that same size, and at that size its
chroma error is _worse_ than plain YUV at quality 75 (RMSE 7.20 vs 4.67).
The bleed comes from the chroma downsample, not from quantisation, so no amount
of quality budget removes it — only a better downsample does.

It is off by default because it is a genuine trade rather than a free win: at
equal file size it spends bytes on chroma that would otherwise go to luma
detail, and for general-purpose encoding luma is the better default. Enabling it
also costs 10-30% encode time and 4-10% size at fixed quality.

```js
// Worth it for a screenshot or a UI mock
await encode(imageData, { quality: 75, use_sharp_yuv: 1 });
```

Note that the SSIM figure reported by `npm run bench` is luma-only and by
construction cannot see what this option does.

## Releasing memory

WebAssembly heaps grow but never shrink. A long-lived Worker, Cloudflare
isolate or Node process that has handled one large image keeps that peak
allocation for the rest of its life, even while idle.

`dispose()` drops the module so its memory can be garbage collected. The next
call re-instantiates it on demand, so this is a trade of latency for residency
rather than a teardown you can never come back from.

```js
import { encode, decode, dispose } from '@jsquash/webp';

const output = await encode(imageData);
dispose(); // release both the encoder and decoder

// Or release just one side:
import { disposeEncoder, disposeDecoder } from '@jsquash/webp';
disposeEncoder();
```

Only call it once outstanding work has settled - any typed array still
pointing into the old heap is detached.
