# Changelog

## Unreleased

### Added

- `zopfli` and `zopfliIterations` options. Zopfli replaces libdeflate as the
  deflate implementation. The output is an ordinary PNG that decodes to
  identical pixels; only the compressed stream differs. Off by default;
  oxipng's `zopfli` cargo feature had been disabled along with the rest of its
  defaults, so this was previously unreachable.

  How much it saves depends almost entirely on how compressible the image
  already is - see the package README for measurements. It ranges from
  negligible on noisy or textured content to very large on smooth content, and
  always costs an order of magnitude or more in time.

### Changed

- The wasm is larger: 77.0 KB to 104.1 KB brotli on the single-threaded build,
  102.6 KB to 129.5 KB on the threaded one. Zopfli is compiled in whether or
  not a caller enables it.

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
