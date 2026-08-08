# Changelog

## Unreleased

### Changes

- Encoding is substantially faster on large images. Pixels now reach the wasm
  heap through a pointer and a single `HEAPU8.set()` rather than embind's
  `std::string` binding, which copied the typed array a byte at a time from JS.
  `encode()`'s signature is unchanged.

### Adds

- `decodeWithMetadata(data)` returns `{ image, metadata }`. `metadata.icc` is
  the profile describing the **returned pixels**, which for JXL is always sRGB
  because the decoder converts. `decode()` is unchanged.
- `readIccProfile(data)` returns the profile the **file** declares, without
  decoding pixels, or `undefined`. This is the source colour space, and is
  deliberately a separate call from the one that hands back pixels.

  See the Colour profiles section of the README for why the two differ.

## @jsquash/jxl@1.3.0

### Adds

- Adds a convenience option to set lossless encoding (`encode(imageData, { lossless: true })`)

## @jsquash/jxl@1.2.0

### Adds
- Adds support for only providing a module option override to the `init` function directly

  **Example:**
  ```ts
  import encode, { init } from '@jsquash/jxl/encode';
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

## @jsquash/jxl@1.1.0

### Adds

- Adds Node.js ESM support
    - Updates relative imports to use file extensions
    - Adds `module` field to relevant `package.json`
    - Updates pre.js to polyfill ImageData for Node.js
- Correctly exports init method from encode module

### Misc.

- Removes *.d.ts.map files from the package

## @jsquash/jxl@1.0.3

### Fixes

- Add missing `wasm-feature-detect` dependency

## @jsquash/jxl@1.0.2

### Fixes

- Stops the WebWorker module code from being instantiated when running in a Cloudflare Worker environment

## @jsquash/jxl@1.0.1

### Fixes

- Removed check threads util method that would have prevented threads not working outside of a worker context. That util was specific to the Squoosh app use case.

## @jsquash/jxl@1.0.0

Initial Release.
