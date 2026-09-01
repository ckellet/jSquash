# @jsquash/jpeg

[![npm version](https://badge.fury.io/js/@jsquash%2Fjpeg.svg)](https://badge.fury.io/js/@jsquash%2Fjpeg)

An easy experience for encoding and decoding JPEG images in the browser. Powered by WebAssembly ⚡️.

Uses the [MozJPEG](https://github.com/mozilla/mozjpeg) library.

A [jSquash](https://github.com/jamsinclair/jSquash) package. Codecs and supporting code derived from the [Squoosh](https://github.com/GoogleChromeLabs/squoosh) app.

## Installation

```shell
npm install --save @jsquash/jpeg
# Or your favourite package manager alternative
```

## Usage

Note: You will need to either manually include the wasm files from the codec directory or use a bundler like WebPack or Rollup to include them in your app/server.

### decode(data: ArrayBuffer, options?: DecodeOptions): Promise<ImageData>

Decodes JPEG binary ArrayBuffer to raw RGB image data.

#### data
Type: `ArrayBuffer`

#### options
Type: `Partial<DecodeOptions>`

The custom options for the decoder. Setting `preserveOrientation` to `true` will rotate the image to the correct orientation based on the metadata tag. By default, this is set to `false`.

#### Example
```js
import { decode } from '@jsquash/jpeg';

const formEl = document.querySelector('form');
const formData = new FormData(formEl);
// Assuming user selected an input jpeg file
const imageData = await decode(await formData.get('image').arrayBuffer());
```

### encode(data: ImageData, options?: EncodeOptions): Promise<ArrayBuffer>

Encodes raw RGB image data to JPEG format and resolves to an ArrayBuffer of binary data.

#### data
Type: `ImageData`

#### options
Type: `Partial<EncodeOptions>`

The MozJPEG encoder options for the output image. [See default values](./meta.ts).

#### Example
```js
import { encode } from '@jsquash/jpeg';

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
const jpegBuffer = await encode(rawImageData);
```

## Colour profiles (ICC) and metadata

`decode` returns pixels in the file's **own** colour space, not sRGB. A Display
P3 or Adobe RGB JPEG - which is what most modern phone cameras produce - decodes
to the numbers that were in the file; what those numbers mean is described by
the image's embedded ICC profile.

This package **carries profiles, it does not apply them**. It will not transform
pixels between colour spaces - use a colour management library, or the browser's
own (a `canvas` created with the right `colorSpace`, or `createImageBitmap`), if
you need that. Before this API existed the profile was discarded on decode and
never written on encode, so a wide-gamut image silently round-tripped as if it
were sRGB and came out desaturated in any colour-managed viewer.

See [docs/colour-management.md](/docs/colour-management.md) for the full design.

### decodeWithMetadata(data: ArrayBuffer, options?: DecodeOptions): Promise<DecodedImage>

Like `decode`, but returns the image together with its embedded metadata:

```ts
{ image: ImageData, metadata: { icc?: Uint8Array, exif?: Uint8Array } }
```

`metadata.icc` holds the raw profile reassembled from the `ICC_PROFILE\0` APP2
markers. `metadata.exif` holds the raw APP1 payload starting at the TIFF header,
with JPEG's `Exif\0\0` prefix stripped, so it is the same shape any EXIF parser
expects. Both are absent when the file carries nothing, and both are unparsed -
the orientation tag `preserveOrientation` acts on is in there along with
everything else the camera wrote.

`decode` is unchanged and still resolves to a plain `ImageData` you can put
straight on a canvas. Metadata lives on a separate function precisely so that
signature never changes.

### readIccProfile(data: ArrayBuffer): Promise<Uint8Array | undefined>

Reads the profile **without decoding any pixels** - parsing stops after the JPEG
header, which is where the APP2 markers already are. Use this to ask "what
colour space is this file in?" cheaply. Resolves to `undefined` when there is no
profile, when the profile is present but does not reassemble, and when the input
is not a JPEG at all; metadata never throws.

### encode(data, options?: { ...EncodeOptions, icc?: Uint8Array | ArrayBuffer })

Pass `icc` to embed a profile in APP2 markers. Omit it and the output carries no
profile, exactly as before - byte for byte the same file. The pixels are written
unchanged, so the profile must be the one they are already in.

```js
import { decodeWithMetadata, encode } from '@jsquash/jpeg';

const { image, metadata } = await decodeWithMetadata(await file.arrayBuffer());
// ... resize, filter, whatever - as long as you do not change colour space
const output = await encode(image, { quality: 80, icc: metadata.icc });
```

An `icc` value that is not a plausible ICC profile throws before any encoding
work happens.

## Manual WASM initialisation (not recommended)

In most situations there is no need to manually initialise the provided WebAssembly modules.
The generated glue code takes care of this and supports most web bundlers.

One situation where this arises is when using the modules in Cloudflare Workers ([See the README for more info](/README.md#usage-in-cloudflare-workers)).

The `encode` and `decode` modules both export an `init` function that can be used to manually load the wasm module.

```js
import decode, { init as initJpegDecode } from '@jsquash/jpeg/decode';

initJpegDecode(WASM_MODULE); // The `WASM_MODULE` variable will need to be sourced by yourself and passed as an ArrayBuffer.
const image = await fetch('./image.jpeg').then(res => res.arrayBuffer()).then(decode);
```

You can also pass custom options to the `init` function to customise the behaviour of the module. See the [Emscripten documentation](https://emscripten.org/docs/api_reference/module.html#Module) for more information.

```js
import decode, { init as initJpegDecode } from '@jsquash/jpeg/decode';

initJpegDecode(null, {
  // Customise the path to load the wasm file
  locateFile: (path, prefix) => `https://example.com/${prefix}/${path}`,
});
const image = await fetch('./image.jpeg').then(res => res.arrayBuffer()).then(decode);
```

What you pass is kept, not just used: after a [`dispose()`](#releasing-memory)
the next call re-instantiates from the same module and options, so a runtime
that cannot fetch its own binary never has to.

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
import { encode, decode, dispose } from '@jsquash/jpeg';

const output = await encode(imageData);
dispose(); // release both the encoder and decoder

// Or release just one side:
import { disposeEncoder, disposeDecoder } from '@jsquash/jpeg';
disposeEncoder();
```

Safe to call at any time, including with work outstanding: each call in
flight keeps the module it is running on, and the reclaim happens once the
last of them has finished. Images already handed back are copies, and stay
valid.

The wasm and options given to `init()` are kept, so the call after a
`dispose()` re-instantiates from the same binary rather than reaching for one
over the network - which is the difference between working and not in a
runtime that cannot fetch.
