# Changelog

## Unreleased

### Fixed

- `init()` now keeps the wasm module and options it was given, so the call after
  a `dispose()` re-instantiates from them instead of falling back to fetching
  the binary - which a runtime like Cloudflare Workers cannot do. `dispose()`
  is also safe to call with work outstanding: calls already in flight keep the
  module they are running on, and the reclaim waits for the last of them.

### Added

- ICC colour profile passthrough. Previously the `ICCP` chunk was discarded on
  decode and never written on encode, so a Display P3 or Adobe RGB image
  silently round-tripped as if it were sRGB.
    - `decodeWithMetadata` returns `{ image, metadata }`, where `metadata.icc`
      holds the raw profile when the image carries one
    - `readIccProfile` reads the profile without decoding any pixels
    - `encode` accepts an `icc` option to embed a profile
- `decode` and `encode` are unchanged for callers who do not ask for metadata,
  and encoder output is byte-for-byte identical when no profile is supplied.
  Profiles are carried, never applied - see
  [docs/colour-management.md](/docs/colour-management.md).

  WebP metadata lives in RIFF chunks that the core codec API cannot see, so this
  links two libraries that were already built but never used: `libwebpdemux` on
  the decoder (+4.1 KB) and `libwebpmux` on the encoder (+10.1 KB).

## @jsquash/webp@1.5.0

### Adds

- Adds support for only providing a module option override to the `init` function directly

  **Example:**
  ```ts
  import encode, { init } from '@jsquash/webp/encode';
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

## @jsquash/webp@1.4.0

### Adds

- Adds ability to customise Emscripten module options, e.g. define your own `locateFile` method.

## @jsquash/webp@1.3.0

### Adds

- Adds Node.js ESM support
    - Updates relative imports to use file extensions
    - Adds `module` field to relevant `package.json`
    - Updates pre.js to polyfill ImageData for Node.js

### Misc.

- Removes *.d.ts.map files from the package

## @jsquash/webp@1.2.0

### Added 

- Include polyfills for Cloudflare Worker environment for easier compatibility
