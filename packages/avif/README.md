# @jsquash/avif

[![npm version](https://badge.fury.io/js/@jsquash%2Favif.svg)](https://badge.fury.io/js/@jsquash%2Favif)

An easy experience for encoding and decoding AVIF images in the browser. Powered by WebAssembly ⚡️.

Uses the [libavif](https://github.com/AOMediaCodec/libavif) library.

A [jSquash](https://github.com/jamsinclair/jSquash) package. Codecs and supporting code derived from the [Squoosh](https://github.com/GoogleChromeLabs/squoosh) app.

## Installation

```shell
npm install --save @jsquash/avif
# Or your favourite package manager alternative
```

## Usage

Note: You will need to either manually include the wasm files from the codec directory or use a bundler like WebPack or Rollup to include them in your app/server.

### decode(data: ArrayBuffer): Promise<ImageData>

Decodes AVIF binary ArrayBuffer to raw RGB image data.

#### data
Type: `ArrayBuffer`

#### options (optional)
Type: `object`
  - `bitDepth`: `8 | 10 | 12 | 16` (default: `8`). Specifies the desired bit depth of the decoded image data.
    - If `bitDepth` is `8` (or not provided), the function returns a standard `ImageData` object.
    - If `bitDepth` is `10`, `12`, or `16`, the function returns an `ImageData`-like object. The `data` property will be a `Uint16Array`.

#### Example
```js
import { decode } from '@jsquash/avif';

const formEl = document.querySelector('form');
const formData = new FormData(formEl);
// Assuming user selected an input avif file
const imageData = await decode(await formData.get('image').arrayBuffer());
```

### encode(data: ImageData, options?: EncodeOptions): Promise<ArrayBuffer>

Encodes raw RGB image data to AVIF format and resolves to an ArrayBuffer of binary data.

#### data
Type: `ImageData`

#### options
Type: `Partial<EncodeOptions>`

The AVIF encoder options for the output image. [See default values](./meta.ts).

> [!NOTE]
> To encode images with a bit depth greater than 8, the `data` property of the image object must be a `Uint16Array`. The pixel values will need to be in the appropriate range for the bit depth.

#### Example
```js
import { encode } from '@jsquash/avif';

async function loadImage(src) {
  const img = document.createElement('img');
  img.src = src;
  await new Promise(resolve => img.onload = resolve);
  const canvas = document.createElement('canvas');
  [canvas.width, canvas.height] = [img.width, img.height];
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, img.width, img.height);
}

const rawImageData = await loadImage('/example.png');
const avifBuffer = await encode(rawImageData);
```

#### Lossless Example
```js
import { encode } from '@jsquash/avif';

const rawImageData = await loadImage('/example.png');
// Lossless encoding can be achieved by setting the `lossless` option to `true`
const avifBuffer = await encode(rawImageData, { lossless: true });
```

## Colour profiles

`decode` returns pixels in the file's **own** colour space and `encode` writes
them unchanged. jSquash carries ICC profiles, it does not apply them — so a
Display P3 image decodes to P3 numbers, not sRGB ones, and it is the caller's
job to interpret or convert them. See [`docs/colour-management.md`](../../docs/colour-management.md).

`ImageData` cannot carry a profile, so the profile is surfaced through separate
functions rather than by changing what `decode` returns.

### decodeWithMetadata(data: ArrayBuffer, options?): Promise<DecodedImage>

As `decode`, but resolves to `{ image, metadata }`. `metadata.icc` is a
`Uint8Array` holding the raw profile, and is **absent** when the file carries
none. The wrapper shape is the same at every bit depth.

### readIccProfile(data: ArrayBuffer): Promise<Uint8Array | undefined>

The profile on its own, without decoding any pixels — this parses the
container's boxes and stops. Resolves to `undefined` when there is no profile,
or when the file cannot be parsed: metadata is advisory and never throws.

### encode(data, { icc })

`icc` accepts a `Uint8Array`, `ArrayBuffer` or any `ArrayBufferView`. Omit it
and the output carries no profile, exactly as before. Unlike the read side, a
malformed profile here is a caller error and throws before any encoding starts.

```js
import { decodeWithMetadata, encode } from '@jsquash/avif';

const { image, metadata } = await decodeWithMetadata(avifBuffer);
// Re-encode at a lower quality, keeping the colour space intact.
const smaller = await encode(image, { quality: 40, icc: metadata.icc });
```

The payload is raw and unparsed in both directions, so a profile jSquash does
not understand still survives a round trip. Profiles are portable across the
jSquash codecs — one read from `@jsquash/png` can be handed straight to this
encoder.

## Activate Multithreading

By default, the encode function will use a single thread to encode the image. If you want to speed this up you can enable multithreading with the following.

1. Move your calls to `encode` into a [WebWorker](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers).
1. Configure your web server to use the following headers (this is [a security requirement](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer#security_requirements))
    - `Cross-Origin-Opener-Policy: same-origin`
    - `Cross-Origin-Embedder-Policy: require-corp`

This will still only take effect in browsers and devices that support multithreading. If the browser does not support it, it will fallback to single threaded mode

## Choosing a single encoder or decoder build

The encoder ships as three WebAssembly builds — multithreaded, SIMD and
baseline. `encode.js` picks between them at runtime, which is the right default
but means a bundler following that dispatch sees all three and emits all three
`.wasm` files, including the 3.3 MB multithreaded build that only loads on a
cross-origin isolated page.

If you already know what you are targeting, import one of the single-variant
entry points instead. They take the same options, return the same thing, and
export the same `init` and `dispose`; the only difference is that the build is
chosen at import time, so you ship one binary.

| Import | Build | Use when |
| --- | --- | --- |
| `@jsquash/avif/encode` | picked at runtime | You don't know the target, and don't mind shipping all three |
| `@jsquash/avif/encode-simd` | SIMD | Node, Deno, Cloudflare Workers, or any browser page that isn't cross-origin isolated |
| `@jsquash/avif/encode-mt` | multithreaded | A browser page you serve with the [cross-origin isolation headers](#activate-multithreading) |
| `@jsquash/avif/encode-scalar` | baseline | You must support a runtime without WebAssembly SIMD |

`encode-simd` is the one most projects want. WebAssembly SIMD is available in
every browser these packages target as well as in Node, Deno and Cloudflare
Workers, and none of those environments can use the multithreaded build unless
you have set the isolation headers yourself.

```js
import encode, { init, dispose } from '@jsquash/avif/encode-simd';

const avifBuffer = await encode(rawImageData);
```

Note these variants have no fallback. `encode-mt` will not load without
`SharedArrayBuffer`, so only reach for it if you control the headers your page
is served with — otherwise stay on `encode.js` or `encode-simd`.

The decoder ships as two builds — SIMD and baseline — and `decode.js` picks
between them the same way. There is no multithreaded decoder: libaom's decoder
is built without threads here.

| Import | Build | Use when |
| --- | --- | --- |
| `@jsquash/avif/decode` | picked at runtime | You don't know the target, and don't mind shipping both |
| `@jsquash/avif/decode-simd` | SIMD | Anything current — see above |
| `@jsquash/avif/decode-scalar` | baseline | You must support a runtime without WebAssembly SIMD |

```js
import decode, { init, dispose } from '@jsquash/avif/decode-simd';

const imageData = await decode(avifBuffer);
```

## Manual WASM initialisation (not recommended)

In most situations there is no need to manually initialise the provided WebAssembly modules.
The generated glue code takes care of this and supports most web bundlers.

One situation where this arises is when using the modules in Cloudflare Workers ([See the README for more info](/README.md#usage-in-cloudflare-workers)).

The `encode` and `decode` modules both export an `init` function that can be used to manually load the wasm module.

```js
import decode, { init as initAvifDecode } from '@jsquash/avif/decode';

initAvifDecode(WASM_MODULE); // The `WASM_MODULE` variable will need to be sourced by yourself and passed as an ArrayBuffer.
const image = await fetch('./image.avif').then(res => res.arrayBuffer()).then(decode);
```

You can also pass custom options to the `init` function to customise the behaviour of the module. See the [Emscripten documentation](https://emscripten.org/docs/api_reference/module.html#Module) for more information.

```js
import decode, { init as initAvifDecode } from '@jsquash/avif/decode';

initAvifDecode(null, {
  // Customise the path to load the wasm file
  locateFile: (path, prefix) => `https://example.com/${prefix}/${path}`,
});
const image = await fetch('./image.avif').then(res => res.arrayBuffer()).then(decode);
```

## Known Issues

See [jSquash Project README](https://github.com/jamsinclair/jSquash#known-issues)

## Releasing memory

WebAssembly heaps grow but never shrink. A long-lived Worker, Cloudflare
isolate or Node process that has handled one large image keeps that peak
allocation for the rest of its life, even while idle.

`dispose()` drops the module so its memory can be garbage collected. The next
call re-instantiates it on demand, so this is a trade of latency for residency
rather than a teardown you can never come back from.

```js
import { encode, decode, dispose } from '@jsquash/avif';

const output = await encode(imageData);
dispose(); // release both the encoder and decoder

// Or release just one side:
import { disposeEncoder, disposeDecoder } from '@jsquash/avif';
disposeEncoder();
```

Only call it once outstanding work has settled - any typed array still
pointing into the old heap is detached.
