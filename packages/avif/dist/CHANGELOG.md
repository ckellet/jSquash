# Changelog

## Unreleased

### Fixed

- `init()` now keeps the wasm module and options it was given, so the call after
  a `dispose()` re-instantiates from them instead of falling back to fetching
  the binary - which a runtime like Cloudflare Workers cannot do. `dispose()`
  is also safe to call with work outstanding: calls already in flight keep the
  module they are running on, and the reclaim waits for the last of them.
- `decode` no longer resolves to `null`. It was typed as `ImageData | null`
  while also throwing `Decoding error` on a failed decode, so callers had two
  failure paths to handle for one operation. It now throws on anything it
  cannot decode, matching every other codec in the library. Code that checked
  the result for `null` still compiles; the check is simply dead.

### Added

- ICC colour profile passthrough. Previously the profile was discarded on decode
  and never written on encode, so a Display P3 or Adobe RGB image silently
  round-tripped as if it were sRGB.
    - `decodeWithMetadata` returns `{ image, metadata }`, where `metadata.icc`
      holds the raw profile when the image carries one
    - `readIccProfile` reads the profile without decoding any pixels - it parses
      the container's boxes and stops
    - `encode` accepts an `icc` option to embed a profile
- `decode` and `encode` are unchanged for callers who do not ask for metadata.
  Profiles are carried, never applied - see
  [docs/colour-management.md](/docs/colour-management.md).
- `decode-simd` and `decode-scalar` single-variant entry points, matching the
  encoder's. `decode` now picks between the two builds at runtime.

### Changed

- **AVIF decoding is ~65% faster and the decoder is 47% smaller**, with
  byte-identical pixels at 8, 10 and 12 bits. Three changes, measured
  separately:
    - Decoding now uses **dav1d** rather than libaom. It is a decoder-only AV1
      implementation, so it carries none of the encoder: 1.17 MB to 616 KB
      (267 KB to 193 KB brotli), and 30-33% quicker than the tuned libaom
      decoder. libaom is still the encoder.
    - libaom is built without `CONFIG_ACCOUNTING`, which Squoosh had enabled.
      It is off by default upstream and only readable through the inspection
      API this build already disables, but it costs a null check and two
      counter increments on every read in the entropy decoder. Worth 34% on
      its own; it no longer affects the shipped decoder, but still applies to
      anyone building the libaom one.
    - A SIMD decoder build, which the package previously lacked entirely, so
      Node and Cloudflare Workers decoded on scalar code despite supporting
      SIMD.
- The encoder now takes its pixels through the wasm heap rather than embind's
  `std::string` binding, which copied the input a byte at a time from JS. This
  is internal to the package; `encode`'s signature is unchanged.

## @jsquash/avif@2.1.1

### Fixes

- Fixes the type definitions for the `encode` method to work correctly with the intended bitDepths.

## @jsquash/avif@2.1.0

### Adds

- Adds support for encoding and decoding AVIF images with higher bit depths
    - 10-bit and 12-bit images are supported for encoding. Pixel data must be provided as 16-bit integers.
    - 10-bit, 12-bit and 16-bit images are supported for decoding
    - See [README](./README.md) for bit depth configuration options

- Adds easy support for lossless encoding with the `lossless` option
    - When `lossless` is set to `true`, the `quality` and `qualityAlpha` options are ignored
    - The `subsample` option is ignored when `lossless` is set to `true`

- Adds support for only providing a module option override to the `init` function directly

  **Example:**
  ```ts
  import encode, { init } from '@jsquash/avif/encode';
  await init({
    locateFile: (path) => {
        const remoteLocation = 'https://cdn.mydomain.com/wasm';
        return remoteLocation + path;
    }
  });
  const buffer = await encode(/* image data */);
  ```

### Fixes

- Updates `locateFile` emscripten module option type to support prefix parameter.

## @jsquash/avif@2.0.0

### Breaking Changes

- Upgrades libavif to v1.0.1

## @jsquash/avif@1.3.0

### Adds

- Adds ability to customise Emscripten module options, e.g. define your own `locateFile` method.

## @jsquash/avif@1.2.0

### Adds

- Adds Node.js ESM support
    - Updates relative imports to use file extensions
    - Adds `module` field to relevant `package.json`
    - Updates pre.js to polyfill ImageData for Node.js

### Misc.

- Removes *.d.ts.map files from the package

## @jsquash/avif@1.1.2

### Bug Fixes

- Stops the WebWorker module code from being instantiated when running in a Cloudflare Worker environment

## @jsquash/avif@1.1.1

### Bug Fixes

- Fixes an issue where it may not have been possible instantiate encode wasm modules manually

## @jsquash/avif@1.1.0

### Added 

- Include polyfills for Cloudflare Worker environment for easier compatibility
