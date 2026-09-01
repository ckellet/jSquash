# Changelog

## Unreleased

### Fixed

- `init()` now keeps the wasm module and options it was given, so the call after
  a `dispose()` re-instantiates from them instead of falling back to fetching
  the binary - which a runtime like Cloudflare Workers cannot do. `dispose()`
  is also safe to call with work outstanding: calls already in flight keep the
  module they are running on, and the reclaim waits for the last of them.

## @jsquash/qoi@1.1.0

### Adds

- Adds support for only providing a module option override to the `init` function directly

  **Example:**
  ```ts
  import encode, { init } from '@jsquash/qoi/encode';
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

## @jsquash/qoi@1.0.0

### Adds

- Initial release of the QOI codec
