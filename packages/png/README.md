# @jsquash/png

[![npm version](https://badge.fury.io/js/@jsquash%2Fpng.svg)](https://badge.fury.io/js/@jsquash%2Fpng)

An easy experience for encoding and decoding PNG images in the browser. Powered by WebAssembly ⚡️.

Uses the [rust PNG crate](https://docs.rs/png/0.11.0/png/).

A [jSquash](https://github.com/jamsinclair/jSquash) package. Codecs and supporting code derived from the [Squoosh](https://github.com/GoogleChromeLabs/squoosh) app.

## Installation

```shell
npm install --save @jsquash/png
# Or your favourite package manager alternative
```

## Usage

Note: You will need to either manually include the wasm files from the codec directory or use a bundler like WebPack or Rollup to include them in your app/server.

### decode(data: ArrayBuffer, options?: { bitDepth?: 8 | 16 }): Promise<ImageData | ImageDataRGBA16>

Decodes PNG binary ArrayBuffer to raw image data. 
By default, it decodes to 8-bit RGBA image data. 
If `options.bitDepth` is set to 16, it decodes to 16-bit RGBA image data.

#### data
Type: `ArrayBuffer`

#### options (optional)
Type: `object`
- `bitDepth` (optional): `8 | 16` - The desired bit depth of the output. Defaults to `8`.

#### Example
```js
import { decode } from '@jsquash/png';

const formEl = document.querySelector('form');
const formData = new FormData(formEl);
// Decode to 8-bit RGBA
const imageData8bit = await decode(await formData.get('image').arrayBuffer());
// Decode to 16-bit RGBA
const imageData16bit = await decode(await formData.get('image').arrayBuffer(), { bitDepth: 16 });
```

### encode(data: ImageData | ImageDataRGBA16, options?: { bitDepth?: 8 | 16, compression?: CompressionLevel }): Promise<ArrayBuffer>

> ℹ️ You may want to use the [@jsquash/oxipng](/packages/oxipng) package instead. It can both optimise and encode to PNG directly from raw image data (8-bit images only).

Encodes raw RGB image data to PNG format and resolves to an ArrayBuffer of binary data.

Can optionally specify the bit depth of the output PNG. The default is 8-bit.

#### data
Type: `ImageData` or for 16-bit images `{ data: Uint16Array; width: number; height: number; }`

#### Example
```js
import { encode } from '@jsquash/png';

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

const rawImageData = await loadImage('/example.jpg');
const pngBuffer = await encode(rawImageData);
```

#### Example with 16-bit image data
```js
import { encode } from '@jsquash/png';

async function create16bitImage(src) {
  const pixels = new Uint16Array(4 * 256 * 256);
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = Math.floor(Math.random() * 65535); // R
    pixels[i + 1] = Math.floor(Math.random() * 65535); // G
    pixels[i + 2] = Math.floor(Math.random() * 65535); // B
    pixels[i + 3] = 65535; // A
  }
  return {
    data: pixels,
    width: 256,
    height: 256,
  };
}

const rawImageData = await create16bitImage();
const png16bitBuffer = await encode(rawImageData, { bitDepth: 16 });
```

## Choosing a compression level

`compression` selects how hard the encoder works to shrink the image data.
It does not affect the pixels - every level decodes to exactly the same image.

| Level | Size | Time | Notes |
| --- | --- | --- | --- |
| `none` | 3.00 MB | 1.6 ms | Stored, no compression |
| `fastest` | 1.99 MB | 6.9 ms | **Default.** fdeflate with the `Up` filter |
| `fast` | 1.94 MB | 10.5 ms | Rarely worth it over `fastest` |
| `balanced` | 1.22 MB | 237 ms | flate2; where the size win is |
| `high` | 1.22 MB | 310 ms | No smaller than `balanced` here, just slower |

Measured on the 1024x768 bench image; your mileage will vary with content.

**Which one you want depends on what happens next.** If you pass the output to
[@jsquash/oxipng](/packages/oxipng), stay on `fastest`: oxipng recompresses the
image data from scratch, so effort spent here is spent twice, and it reaches a
smaller file than `balanced` does anyway (1.13 MB at level 2). If this encoder
is the last step and you would rather pay time than bytes, `balanced` is the
setting - `high` costs a third more time for nothing on this image.

```js
// Last step in the pipeline, and bytes matter more than milliseconds.
const pngBuffer = await encode(rawImageData, { compression: 'balanced' });
```

The default stays `fastest`, which is what this package has always produced.
`png` 0.18's own default is `balanced`; adopting it silently would have been a
35x encode slowdown, so it is opt-in.

Note that making the slower levels reachable links flate2 into the module,
which costs about 10 KB brotli whether or not you use them.

## Colour profiles (ICC)

`decode` returns pixels in the file's **own** colour space, not sRGB. A Display
P3 or Adobe RGB PNG decodes to the numbers that were in the file; what those
numbers mean is described by the image's embedded ICC profile.

This package **carries profiles, it does not apply them**. It will not transform
pixels between colour spaces - use a colour management library, or the browser's
own (a `canvas` created with the right `colorSpace`, or `createImageBitmap`), if
you need that. Before this API existed the profile was discarded on decode and
never written on encode, so a wide-gamut image silently round-tripped as if it
were sRGB and came out desaturated in any colour-managed viewer.

See [docs/colour-management.md](/docs/colour-management.md) for the full design.

### decodeWithMetadata(data: ArrayBuffer, options?: { bitDepth?: 8 | 16 }): Promise<DecodedImage>

Like `decode`, but returns the image together with its embedded metadata:

```ts
{ image: ImageData, metadata: { icc?: Uint8Array, exif?: Uint8Array } }
```

`metadata.icc` holds the raw profile from the `iCCP` chunk, or is absent when
the image carries none. `metadata.exif` is always absent for PNG today - reading
the `eXIf` chunk needs a `png` crate bump.

`decode` is unchanged and still resolves to a plain `ImageData` you can put
straight on a canvas. Metadata lives on a separate function precisely so that
signature never changes.

### readIccProfile(data: ArrayBuffer): Promise<Uint8Array | undefined>

Reads the profile **without decoding any pixels** - parsing stops at the first
`IDAT`. Use this to ask "what colour space is this file in?" cheaply. Resolves
to `undefined` when there is no profile, or when the profile is present but
unreadable; metadata never throws.

### encode(data, options?: { bitDepth?: 8 | 16, icc?: Uint8Array | ArrayBuffer })

Pass `icc` to embed a profile as an `iCCP` chunk. Omit it and the output carries
no profile, exactly as before. The pixels are written unchanged, so the profile
must be the one they are already in.

```js
import { decodeWithMetadata, encode } from '@jsquash/png';

const { image, metadata } = await decodeWithMetadata(await file.arrayBuffer());
// ... resize, filter, whatever - as long as you do not change colour space
const output = await encode(image, { icc: metadata.icc });
```

An `icc` value that is not a plausible ICC profile throws before any encoding
work happens.

## Manual WASM initialisation (not recommended)

In most situations there is no need to manually initialise the provided WebAssembly modules.
The generated glue code takes care of this and supports most web bundlers.

One situation where this arises is when using the modules in Cloudflare Workers ([See the README for more info](/README.md#usage-in-cloudflare-workers)).

The `encode` and `decode` modules both export an `init` function that can be used to manually load the wasm module.

```js
import decode, { init as initPngDecode } from '@jsquash/png/decode';

initPngDecode(WASM_MODULE); // The `WASM_MODULE` variable will need to be sourced by yourself and passed as an ArrayBuffer.
const image = await fetch('./image.png').then(res => res.arrayBuffer()).then(decode);
```

## Releasing memory

WebAssembly heaps grow but never shrink. A long-lived Worker, Cloudflare
isolate or Node process that has handled one large image keeps that peak
allocation for the rest of its life, even while idle.

`dispose()` drops the module so its memory can be garbage collected. The next
call re-instantiates it on demand.

```js
import { encode, dispose } from '@jsquash/png';

const output = await encode(imageData);
dispose();
```

Only call it once outstanding work has settled - any typed array still
pointing into the old heap is detached.

The encoder and decoder share one module, so `dispose()` affects both.
