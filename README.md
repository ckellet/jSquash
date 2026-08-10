# jSquash 🥝 — Kedos fork

> **This is a fork of [jamsinclair/jSquash](https://github.com/jamsinclair/jSquash), tuned for edge and serverless runtimes.**
> Upstream's README follows below and still applies — everything here is additive.

## Why this fork exists

Most of the work is about WebAssembly SIMD, which has been universally available
since 2021 but was barely used here: **the decoders had none at all, in any
format**, and JPEG had none on either side. Measured against upstream, same
input, byte-identical output, SSIM unchanged throughout:

| codec | encode | decode |
| --- | --- | --- |
| jxl | **−66%** | **−54%** |
| png | **−41%** | −36% |
| avif | **−33%** | −19% |
| webp | ~flat | **−46%** |
| qoi | — | **−36%** |
| jpeg | **−15%** | −4% |

Not one of those speedups was paid for in image quality — every encoder produces
the same bytes it did before.

Three things here are not in upstream at all:

- **`dispose()` on every package.** Emscripten heaps grow and never shrink, so a
  long-lived Worker or isolate holds its peak allocation for the rest of its
  life. This hands the memory back. For the Rust-backed packages it needed a
  patch to the generated glue, because wasm-bindgen pins the instance in module
  scope with no way to release it.
- **Single-variant entry points.** `encode-simd`, `encode-mt`, `encode-scalar`
  and their decode equivalents each bind one build statically, so a bundler
  emits one `.wasm` instead of every candidate the runtime dispatch could
  reach. For a Cloudflare Workers deployment using AVIF, JXL and WebP that is
  19.95 MB of wasm down to 8.41 MB. (Upstream issue
  [#33](https://github.com/jamsinclair/jSquash/issues/33).)
- **ICC colour profile support** across PNG, WebP, JPEG and AVIF, with profiles
  verified to survive byte-identically *between* codecs. Previously a Display P3
  image round-tripped as sRGB — numbers preserved, meaning lost. See
  [docs/colour-management.md](docs/colour-management.md). (Upstream issue
  [#5](https://github.com/jamsinclair/jSquash/issues/5).)

Also: a benchmark and quality harness in [bench/](bench/) that reports time,
size and SSIM together and refuses to record timings from a loaded machine
(upstream issue [#46](https://github.com/jamsinclair/jSquash/issues/46)), and a
modernised toolchain — Emscripten 4.0.16 (the first release published for
arm64), MozJPEG 4.1.5, libwebp 1.6.0.

## What this fork does not offer

- **It is not published to npm.** Consume it as a git dependency; see
  [DIST-BRANCH.md](https://github.com/ckellet/jSquash/blob/kedos-dist/DIST-BRANCH.md)
  on the `kedos-dist` branch. pnpm supports subdirectory git dependencies; npm
  does not.
- **No support commitment.** This exists because we needed it in production. It
  is offered as-is.
- **JXL ICC is deliberately partial** — `readIccProfile` only. Writing profiles,
  and returning untransformed pixels, are not correctly implementable at the
  pinned libjxl; the reasoning is in the design doc rather than left as a TODO.

## Upstreaming

The bug fixes here are offered back:
[#108](https://github.com/jamsinclair/jSquash/pull/108),
[#109](https://github.com/jamsinclair/jSquash/pull/109),
[#110](https://github.com/jamsinclair/jSquash/pull/110),
[#111](https://github.com/jamsinclair/jSquash/pull/111).
If they land, and the codec work follows, this fork should stop being necessary.

`main` here tracks upstream unchanged so rebasing stays clean; the work lives on
`kedos`, which is the default branch.

---

# jSquash 🥝

> Collection of WebAssembly image codecs that support the browser and are derived from the [Squoosh App](https://github.com/GoogleChromeLabs/squoosh)

The aim of this library is to provide an easy experience to encode, decode and modify images with the tools you know and love from Squoosh in the **Browser** and **Web Worker** environments.

jSquash name is inspired by jQuery and Squoosh. It symbolizes the browser support focus of these packages.

⚠️ There is limited support for Node.js environments. The experimental Node.js support is provided for convenience and is not the primary focus of this project. For much better Node based alternatives please check out the [Squoosh Node.js library](https://github.com/GoogleChromeLabs/squoosh/tree/918c596cba36a46ff3d7aa8ffd69580bd22528e2/libsquoosh) and [Sharp](https://github.com/lovell/sharp).

## Differences with Squoosh

- The codecs and tools are built for both Web and Web Worker environments
- No dynamic code execution, the packages can be run in strict environments that do not allow code evaluation. Like Cloudflare Workers.
- Does not require the TextEncoder/TextDecoder API. It is used where the runtime provides it, with a plain JS fallback where it does not, so the packages still run in simpler V8 runtimes (Cloudflare Workers, Vercel Edge Functions etc.)

## Packages

- [@jSquash/avif](/packages/avif) - An encoder and decoder for AVIF images using the [libavif](https://github.com/AOMediaCodec/libavif) library
- [@jSquash/jpeg](/packages/jpeg) - An encoder and decoder for JPEG images using the [MozJPEG](https://github.com/mozilla/mozjpeg) library
- [@jSquash/jxl](/packages/jxl) - An encoder and decoder for JPEG XL images using the [libjxl](https://github.com/libjxl/libjxl) library
- [@jSquash/oxipng](/packages/oxipng) - A PNG image optimiser using [Oxipng](https://github.com/shssoichiro/oxipng)
- [@jSquash/png](/packages/png) - An encoder and decoder for PNG images using the [rust PNG crate](https://docs.rs/png/0.11.0/png/)
- [@jSquash/qoi](/packages/qoi) - An encoder and decoder for the "Quite Ok Image Format" using the [official library](https://github.com/phoboslab/qoi)
- [@jSquash/resize](/packages/resize) - An image resizer tool using rust [resize](https://github.com/PistonDevelopers/resize), [hqx](https://github.com/CryZe/wasmboy-rs/tree/master/hqx) and [magic-kernel](https://github.com/SevInf/magic-kernel-rust) libraries. Supports both downscaling and upscaling.
- [@jSquash/webp](/packages/webp) - An encoder and decoder for WebP images using [libwebp](https://github.com/webmproject/libwebp)
- ...more to come

⚠️ All packages are ESM modules. You may need to manually transpile the packages if your build environment still relies on Commonjs formats.

## Usage in the Browser

You can use the packages directly from the Unpkg CDN and can be the easiest way to get started.

```js
import { decode } from "https://esm.sh/@jsquash/jpeg";
import { encode } from "https://esm.sh/@jsquash/webp";

const imageResponse = await fetch("https://picsum.photos/200/300.jpg");
const imageData = await decode(await imageResponse.arrayBuffer());
const webpImageBuffer = await encode(imageData);
```

To target a specific version, you can use the `@version` syntax.
```js
import { encode } from "https://esm.sh/@jsquash/webp@1.2.0";
```

Checkout the [with CDN](/examples/with-cdn) example for a working demo.

## Usage in Node.js

Using jSquash modules with Node.js requires some additional steps so that the WASM binaries can be included.
The support is limited and the WASM modules are not optimized for speed with Node.js.

Check out the [with Node.js](/examples/with-node) example for a working demo.

## Usage in Cloudflare Workers

Using jSquash modules with Cloudflare Workers requires some additional steps so that the WASM binaries get included.

Depending on which format you are using check the examples below:
- [Cloudflare Worker (ES Module Format) function that upgrades images to webp](/examples/cloudflare-worker-esm-format)
- [Cloudflare Worker (Legacy Service Worker Format) function that upgrades images to webp](/examples/cloudflare-worker)

## Other Examples

- [Web App using image codecs bundled with Rollup](/examples/with-rollup)
- [Web App using image codecs bundled with Vite](/examples/with-vite)
- [Web App using image codecs bundled with Webpack](/examples/with-webpack)
- [Deno script that converts images from the file system](/examples/with-deno)

## Building the codecs

The `.wasm` binaries are committed, so most work needs only `npm run build`
(TypeScript) at the repository root. Rebuilding a codec from source needs
Docker, and is done per package:

```sh
cd packages/webp/codec && npm run build     # Emscripten codecs
cd packages/resize/lib/resize && npm run build   # Rust codecs
```

### Toolchain pinning

Emscripten is pinned per codec rather than globally, because the upstream
libraries do not all tolerate the same version. `tools/build-cpp.sh` supplies
the default; a codec that needs something else sets `EMSDK_VERSION` in its own
`codec/package.json`.

| Codec | Emscripten | Notes |
| --- | --- | --- |
| jpeg, webp, avif, qoi | 4.0.16 | Built natively on arm64; see below |
| jxl | 3.1.57 | Four libjxl builds, and cannot move to 4.x; see below |

4.0.16 is the first Emscripten release published for arm64. Earlier tags are
amd64 only and run under emulation on Apple Silicon, which costs roughly an
order of magnitude on a build the size of libaom.

Rust codecs build through `tools/build-rust.sh`, which pins the image in
`tools/rust.Dockerfile` and compiles with `-C target-feature=+simd128`.

### SIMD and thread variants

Several codecs ship more than one binary and pick between them at runtime:

- **SIMD** is used wherever a SIMD build exists. Every browser these packages
  target supports it, as do Node, Deno and Cloudflare Workers.
- **Threads** additionally require `SharedArrayBuffer`, so they are used only
  in a cross-origin-isolated browser context - never in Node or Cloudflare
  Workers.

Because those two capabilities are independent, codecs with a threaded build
also need a SIMD-only build; otherwise a runtime without threads silently
falls back to a binary with no SIMD either.

### Known trade-offs

- **The wasm payload grew from 15.0 MB to 24.2 MB, and single-variant entry
  points are how you avoid paying for it.** The SIMD builds that made AVIF and
  JXL two to three times faster are not free, and 6.5 MB of the total is
  threaded builds that need `SharedArrayBuffer` - so they can never load under
  Node, Deno, Cloudflare Workers, or any page without COOP/COEP headers.

  `encode`/`decode` choose a build at runtime, which is the right default but
  means a bundler emits every candidate. Each codec now also exposes entry
  points bound to a single build, so an application that knows its target
  ships one binary. Same API, same options, same `dispose()`:

  ```js
  import encode from '@jsquash/avif/encode';        // bundles all three builds
  import encode from '@jsquash/avif/encode-simd';   // bundles one
  ```

  For a Node or Workers deployment using AVIF, JXL and WebP, that is **19.95 MB
  of wasm down to 8.41 MB**. See each package's README for the full list;
  `-simd` suits anything current, `-mt` a cross-origin-isolated browser, and
  `-scalar` a runtime without SIMD.

  The installed size is unchanged - every variant is still on disk after
  `npm install`, because the runtime dispatch has to be able to reach them.
  Only what reaches a bundle changes. Trimming the install too would need an
  `exports` map, which is exhaustive and would break existing deep imports, so
  it has deliberately not been added.

- **AVIF is compiled `-Oz`, and that is not a speed compromise.** Measured on
  the bench fixture, `-Oz`, `-O2` and `-O3` encode within 1.5% of each other -
  inside run-to-run noise - while `-O2`/`-O3` add ~8% to the binary. libaom's
  hot loops are memory-bound and already hand-tuned, so the extra inlining
  buys nothing. `-Oz` is the best point on the curve, not a trade-off.
- **libaom is built with `AOM_TARGET_CPU=generic`**, so AVIF gets no
  hand-written SIMD - only whatever the compiler autovectorises. That turns
  out to be a lot: the SIMD encoder build carries ~465k v128 instructions
  against zero in the plain build, and encodes 4-11% faster depending on the
  `speed` setting (the win is largest at fast speeds, where the vectorisable
  transform kernels are a bigger share of the work). It costs +2.9 MB raw but
  only +110 KB brotli, because vectorised code compresses well. The other half
  of that cost is cold start, since wasm compile time scales with binary size:
  measured, 8 ms to compile the SIMD encoder against 5 ms for the scalar one.
  Three milliseconds against 4-11 ms saved on a ~100 ms encode, so it pays for
  itself even on a single-image serverless invocation.
- **AVIF is pinned to libavif 1.0.1 / libaom 3.7.0, and that is deliberate.**
  libavif 1.3.0 + libaom 3.12.1 was built and benchmarked, and it is not an
  upgrade on these workloads: encode is ~18% slower at `speed: 8` and level
  at `speed: 6`, for no measurable quality gain (identical SSIM, 0.4% larger
  output). It does produce smaller binaries (encoder -4%, SIMD encoder -12%).
  If it is revisited, note that libavif >= 1.1 replaced its boolean
  dependency options with `LOCAL`/`SYSTEM`/`OFF`, so the build needs
  `-DAVIF_CODEC_AOM=SYSTEM`, `-DAVIF_LIBYUV=OFF` and `-DAVIF_LIBSHARPYUV=SYSTEM`
  with `AOM_LIBRARY`/`AOM_INCLUDE_DIR`/`LIBSHARPYUV_LIBRARY`/
  `LIBSHARPYUV_INCLUDE_DIR` pointing at the trees we build. `AVIF_CODEC_AOM=1`
  silently disables the codec on those versions.
- **MozJPEG is built twice, in two SIMD configurations.** Its hand-written
  SIMD comes in an x86 flavour, which is NASM and cannot be assembled for
  wasm, and an Arm Neon flavour, which is plain C intrinsics and reaches wasm
  through the SIMDe `<arm_neon.h>` Emscripten ships. SIMDe has to emulate the
  de-interleaving loads and stores, which pays off in the encoder but not in
  the decoder, so the encoder links the Neon build and the decoder links an
  autovectorised-only one. `packages/jpeg/codec/Makefile` has the numbers.
- **JXL builds libjxl four times**, once per (threads, SIMD) combination,
  where the other codecs need one library per SIMD variant. A single-threaded
  wrapper cannot link a libjxl compiled with `-pthread`: from Emscripten 3.1.x
  on, TLS initialisers in `-pthread` objects are never run in a link that is
  not itself `-pthread`, so every `thread_local` with a dynamic initialiser
  keeps its zero value. That includes embind's cached
  `_emval_get_method_caller` id, so the first `val::new_()` fails at runtime
  with "caller is not a function" - a linker-level mismatch that produces no
  build-time diagnostic. Emscripten 2.0.34 ran those initialisers from
  `__wasm_call_ctors`, which is why the old two-library layout worked.
- **JXL cannot move to Emscripten 4.x.** `emscripten/emsdk` only publishes
  arm64 images from 4.0.16 onward, so on Apple Silicon every older tag builds
  under QEMU emulation, roughly 15-20x slower. JXL cannot have that yet: on
  4.0.16 the Clang 22 frontend segfaults in `EmitBuiltinExpr` compiling
  `hwy/aligned_allocator.cc` from the 2021 highway that libjxl vendors.
  Unpinning it needs a libjxl bump, which changes encoder output and wants its
  own quality comparison. Going back to 2.0.34 is also closed off: its bundled
  terser predates `import.meta`, which `codec/pre.js` now uses.

## Known Issues

### Issues with Vite and Vue build environments

This may present itself as any of the following errors:
- `TypeError: Failed to construct 'URL': Invalid URL`
- `RuntimeError: Aborted(both async and sync fetching of the wasm failed). Build with -sASSERTIONS for more info.`
- Other console errors could also be related to this issue

As a workaround, update your `vite.config.js` file with the `optimizeDeps` property. Put affected module names in the exclude array. Vites dependency optimizer seems to be causing issues with the WASM modules.

```js
import { defineConfig } from 'vite'

export default defineConfig({
  optimizeDeps: {
    exclude: ["@jsquash/png"]
  }
})
```

### Issues with Nuxt build environments

This may present itself as a `Cannot find module` error. This is likely because Nuxt is anticipating third party modules to be in the Commonjs format.

Setting the following Nuxt config with the jSquash packages that your app uses seems to resolve it.

```js
export default defineNuxtConfig({
  build: {
    transpile: ["@jsquash/png"],
  },
  vite: {
    optimizeDeps: {
      exclude: ["@jsquash/png"],
    },
  },
});
```

### Issues with Nuxt/Vite and nested Web Workers

There is a known Vite bug breaking production code compilation when using a worker that references another worker, see [issue #19](https://github.com/jamsinclair/jSquash/issues/19) for more information.

```
Unexpected early exit. This happens when Promises returned by plugins cannot resolve. Unfinished hook action(s) on exit:
```

In the meantime, you can install special builds that don't use workers to work around this issue:
- [@jsquash/avif@1.1.2-single-thread-only](https://www.npmjs.com/package/@jsquash/avif/v/1.1.2-single-thread-only)
- [@jsquash/jxl@1.0.2-single-thread-only](https://www.npmjs.com/package/@jsquash/jxl/v/1.0.2-single-thread-only)
- [@jsquash/oxipng@1.0.1-single-thread-only](https://www.npmjs.com/package/@jsquash/oxipng/v/1.0.1-single-thread-only)
