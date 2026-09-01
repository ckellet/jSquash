# Changelog

## Unreleased

### Fixed

- `init()` now keeps the wasm it was given, so the call after a `dispose()`
  re-instantiates from it instead of falling back to fetching the binary -
  which a runtime like Cloudflare Workers cannot do. `dispose()` is also safe
  to call with work outstanding: the reclaim waits for the calls already in
  flight rather than pulling the heap out from under them.

### Changed

- Updates the `resize` crate to 0.8.9, from 0.5.5. Output is byte-identical
  across `triangle`, `catrom`, `mitchell` and `lanczos3`, and timings are
  within noise, so this is a maintenance bump rather than an improvement -
  0.5.5 was five years behind.
- The crate's `rayon` feature is disabled. It became a default in 0.8 and is
  dead weight in a single-threaded wasm build: the parallel path can never be
  taken, but the code was still linked, which cost 62 KB of wasm (17.6 KB
  brotli). With it off the module grows by 522 bytes raw, 58 brotli.

## @jsquash/resize@2.1.1

### Fixes

- Updates magic-kernel rust dependency to version that includes a fix to ensure filters are applied in correct order on resize.

## @jsquash/resize@2.1.0

### Adds

- Adds initial Magic Kernel resizing method support ([Using the Rust library](https://github.com/SevInf/magic-kernel-rust))
    - `magicKernel` - The original Magic Kernel algorithm
    - `magicKernelSharp2013` - A sharpened version of the Magic Kernel algorithm
    - `magicKernelSharp2021` - A further sharpened version of the Magic Kernel algorithm

## @jsquash/resize@2.0.0

### Breaking Changes

- Moves compiled wasm and js files to the 'lib/*/pkg' directory. If you were using the wasm file directly you will need to update your paths to reference the following
    - `node_modules/@jsquash/resize/lib/hqx/pkg/squooshhqx_bg.wasm`
    - `node_modules/@jsquash/resize/lib/resize/pkg/squoosh_resize_bg.wasm`

### Fixes

- Fixes memory leak caused by a bug with wee_alloc

## @jsquash/resize@1.1.1

### Fixes

- Add same ImageData polyfill and tweaks to better support Cloudflare Workers and Node.js 

### Misc

- Ensures license is properly included in the package

## @jsquash/resize@1.1.0

### Adds

- Adds Node.js ESM support

### Misc.

- Removes *.d.ts.map files from the package
