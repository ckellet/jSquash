# Changelog

## Unreleased

### Changed

- Updates oxipng to v10.2.0, from v9.1.1. Output is unchanged at `level: 2`
  and never larger at `level: 3`, where it is also markedly faster - measured
  on 1024x768 images, level 3 takes 47-60% less time, and one case came out
  4.6% smaller. Decoded pixels identical throughout.
- The wasm grows with it: 77.0 KB to 82.4 KB brotli on the single-threaded
  build, 102.6 KB to 107.5 KB on the threaded one.

### Not included: Zopfli

oxipng can deflate with Zopfli instead of libdeflate, and it is in the crate's
default feature set. It was built and measured here, and deliberately left
out. Recorded so it is not re-derived:

- The win depends almost entirely on how compressible the image already is.
  At 15 iterations, level 2, 1024x768: **-34%** on smooth gradients, but only
  -1.1% on flat colour blocks, -0.7% on photographic texture and -0.2% on
  noise. The large number is the outlier, not the rule.
- It costs 10x to 96x the encode time - seconds per image of pure CPU with
  nothing to overlap, which rules it out of a CPU-metered request path.
- Turning the iteration count down does not rescue it. Below about 5
  iterations Zopfli loses to libdeflate outright on anything that is not
  highly compressible: at 1 iteration, +2.5% on photographic texture and
  +2.1% on noise. Above 5 the curve is flat.
- Enabling the feature added ~29 KB brotli to the wasm whether or not a caller
  used it, because it is compiled in regardless.

Worth revisiting only for an offline, build-time pipeline over assets that are
known to be smooth-gradient-like.

## @jsquash/oxipng@2.3.0

### Adds

- Better compilation with Vite Bundler. Solves issues with circular dependencies for Vite v5.1.6+.

## @jsquash/oxipng@2.2.0

### Adds

- Updates oxipng to v9.0
- Adds support to optimise raw image data directly and output as an optimised PNG. This is useful for when you have raw image data and want to optimise it without having to encode to a PNG first.

## @jsquash/oxipng@2.1.0

### Adds

- Adds Node.js ESM support
    - Updates relative imports to use file extensions
    - Adds `module` field to relevant `package.json`
    - Updates pre.js to polyfill ImageData for Node.js

## @jsquash/oxipng@2.0.0

### Breaking Changes

- Upgrades several major versions to oxipng 8.0.0

### Adds

- Adds support for `optimiseAlpha` option to control whether alpha channels are optimised or not

## @jsquash/oxipng@1.0.2

### Fixes

- Only allow multithreading when running in a WebWorker, otherwise it will throw an error

### Misc.

- Removes *.d.ts.map files from the package

## @jsquash/oxipng@1.0.1

### Fixes

- Update the rayon dynamic import path so it can be handled better by bundlers. Particularly Vite.
