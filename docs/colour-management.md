# Colour management in jSquash

## The problem

Every decoder in this library throws away the image's ICC profile and returns
bare RGBA. Every encoder writes output with no profile attached. A Display P3 or
Adobe RGB source therefore round-trips as if it were sRGB: the numbers survive,
their meaning does not, and the image comes out visibly desaturated in any
colour-managed viewer.

Nothing about this is recoverable downstream. Once the profile is gone the
pixels are ambiguous, and no amount of care by the caller can put the
information back. That makes it a correctness bug rather than a missing feature.

EXIF has the same shape. JPEG orientation is partially handled through
`preserveOrientation`, which parses the APP1 marker in C and then discards it;
nothing else survives anywhere.

This document covers what each underlying library actually gives us, the API
shape, what it costs in bytes, whether conversion belongs here at all, and a
phased plan. `@jsquash/png` is implemented as the reference; the rest is
designed but not built.

## Scope: passthrough, not conversion

**Recommendation: this library should carry profiles, not apply them.**

Passing a profile through and converting between colour spaces are different
jobs with different costs:

- Passthrough needs no colour code at all. It is byte plumbing: read a chunk,
  hand it to the caller, write it back on the way out. It is cheap in every
  package (see the cost table) and it is what unblocks correctness, because a
  caller who *has* the profile can do anything they like with it.
- Conversion needs a colour management module — lcms2 or skcms — plus a policy
  surface that jSquash does not otherwise have: rendering intent, black point
  compensation, gamut mapping, what to do when the destination is smaller than
  the source. Those are real decisions with no universally right answer, and
  making them silently on the caller's behalf is worse than not making them.

There is also already a CMM on the other side of the API. Browsers colour-manage
`createImageBitmap` and honour `canvas`'s `colorSpace` option; on the server,
callers reach for sharp or a native binding. jSquash's value is the codec, not
the colour maths.

So: **carry the bytes, document the limitation honestly, and do not convert.**
The README should say plainly that decode returns pixels in the file's own
colour space, that the profile describing that space is available via
`decodeWithMetadata`, and that jSquash will not transform pixels between spaces.

If conversion is ever wanted, the right home is a **separate `@jsquash/color`
package** wrapping one CMM once, not a CMM linked into each of five codecs. This
repo already has a working skcms build recipe — libjxl vendors it and
`packages/jxl/codec/Makefile:84-86` compiles `skcms.cc` by hand into
`libskcms.a` — so the path exists if the need appears.

**JXL is the exception that proves the rule, and it is a trap.** Its decoder
already converts. `packages/jxl/codec/dec/jxl_dec.cpp:62-90` subscribes to
`JXL_DEC_COLOR_ENCODING`, pulls the profile with
`JxlDecoderGetColorAsICCProfile`, hands it to `skcms_Transform`, bakes the image
into sRGB 8-bit, and drops the profile on the floor. Naively "adding
passthrough" there — returning the source profile alongside those pixels — would
produce output that is *doubly* wrong: pixels already converted to sRGB, tagged
as if they were still P3. Whatever JXL does, it must report the space the
returned pixels are actually in. See phase 5.

## What each library actually exposes

Summarised first, evidence below.

| Package | Decode side | Encode side | New bindings? | Payload |
| --- | --- | --- | --- | --- |
| **png** | free — crate parses `iCCP` into `Info` | **no public setter in any 0.17.x**; must write the chunk by hand | small Rust fn each way | **+5.0 KB measured** |
| **avif** | free — `avifDecoderReadMemory` fills `image->icc` | `avifImageSetProfileICC()` | ~5 lines each way | **~0** (already linked) |
| **jpeg** | `jpeg_save_markers(APP2)` + manual reassembly | `jpeg_write_marker` + manual chunking | ~80 lines of C | ~0 (glue only) |
| **webp** | needs `libwebpdemux` **linked** (already built) | needs `libwebpmux` **built and linked** (currently neither) | Makefile + glue | ~10-30 KB est. |
| **jxl** | already reads it, then destroys it | encoder bypasses the public API entirely | semantic decision first | ~0 (skcms linked) |

### PNG — Rust `png` crate 0.17.10

Decode is free. `Info` carries the profile already:

```rust
// png-0.17.10/src/common.rs:509
pub icc_profile: Option<Cow<'a, [u8]>>,
```

`parse_iccp` (`decoder/stream.rs:1084`) inflates the chunk during `read_info()`,
which stops at the first `IDAT`. Reaching it is `reader.info().icc_profile`.

Encode is the awkward half. **There is no public way to write an `iCCP` chunk
through the encoder API, in 0.17.10 or in the latest 0.17.16.** 0.17.16 added
`write_iccp_chunk` (`encoder.rs:1059`) but it is `pub(crate)`, reachable only via
`Info::encode`, and `Encoder` keeps its `Info` private:

```rust
// png-0.17.16/src/encoder.rs:148
pub struct Encoder<'a, W: Write> {
    w: W,
    info: Info<'a>,     // private, no accessor
    options: Options,
}
```

There is no `set_icc_profile` on `Encoder` at any 0.17.x. So **bumping the crate
would not help**, which is why the implementation stays on the pinned 0.17.10
and writes the chunk itself through the public
`Writer::write_chunk(chunk::iCCP, ..)` (`encoder.rs:584`), deflating the profile
first. `png::chunk::iCCP` and `ChunkType(pub [u8; 4])` are both public.

`eXIf` is **not supported at all** in 0.17.10 — no read, no write, zero
occurrences in the source. 0.17.16 added both (`chunk.rs:45`, `common.rs:792`).
PNG EXIF therefore needs either a crate bump or ~30 lines of manual chunk
walking; it is deliberately out of scope for phase 1.

### AVIF — libavif 1.0.1

The cheapest of all five, and nothing new gets linked. `avifImage` already
carries the fields, and all three setters exist at the pinned tag:

```c
avifRWData icc; avifRWData exif; avifRWData xmp;
avifResult avifImageSetProfileICC(avifImage*, const uint8_t*, size_t);
avifResult avifImageSetMetadataExif(avifImage*, const uint8_t*, size_t);
```

(Note these return `avifResult` in 1.0.x, having been `void` in 0.x.)

`avifDecoderReadMemory` populates `image->icc` today. The glue simply never
looks: `packages/avif/codec/dec/avif_dec.cpp` touches `image` only to create it,
read into it, convert YUV→RGB and destroy it — the profile is discarded at
`avifImageDestroy`. The encoder sets only `matrixCoefficients` and has no field
that could carry a profile.

libavif's Exif code is already linked in — `strings avif_dec.wasm` contains
`Exif header`. So this is pure glue on both sides, against an 8.19 MB pair of
binaries where the addition rounds to zero.

### JPEG — MozJPEG 3.3.1

> **Superseded.** This section assessed MozJPEG 3.3.1. The package has since
> moved to **4.1.5**, where `jcicc.c` and `jdicc.c` are present and already
> compiled into `libjpeg.a` — they were simply unreachable. The hand-rolled
> chunking described below was not needed: the implementation uses
> `jpeg_write_icc_profile`, `jpeg_save_markers` and `jpeg_read_icc_profile`.
> Measured cost: encoder **+946 B**, decoder **+4.7 KB** (of which 1,570 B is a
> setjmp guard, since libjpeg's default error handler calls `exit()` and would
> take the whole wasm module with it on a malformed file). EXIF did fall out
> free, as predicted. The original assessment is kept below as a record.


ICC in JPEG lives in APP2 markers prefixed `ICC_PROFILE\0`, **split across
multiple markers** (each capped near 65533 bytes) with a 1-byte sequence number
and 1-byte count. Reading means reassembling; writing means chunking.

The convenience helpers do not exist here. MozJPEG 3.3.1 predates
libjpeg-turbo's ICC API: `jcicc.c` and `jdicc.c` are absent from the fetched
tree and `jpeg_read_icc_profile` / `jpeg_write_icc_profile` have zero occurrences
anywhere in it. Both directions must be hand-rolled — roughly 80 lines of C,
which is well-understood but is the largest glue change of the five.

The scaffolding is half there already. The decoder saves APP1 for orientation:

```c
// packages/jpeg/codec/dec/mozjpeg_dec.cpp:173
jpeg_save_markers(&cinfo, JPEG_APP0 + 1, 0xFFFF);
```

and walks `cinfo->marker_list` in `extract_orientation`. Adding `JPEG_APP0 + 2`
alongside it is one line. The encoder has no `jpeg_write_marker` call at all;
the insertion point is immediately after `jpeg_start_compress` (line 194).

JPEG is also where **EXIF passthrough is nearly free**: the APP1 blob is already
saved and parsed, then thrown away after the orientation short is read.
Surfacing those bytes costs almost nothing, and JPEG is the format where EXIF
actually matters.

### WebP — libwebp (pinned commit, 1.1.0 era)

> **Superseded.** This section assessed a 1.1.0-era libwebp. The package has
> since moved to **1.6.0**, where upstream added a first-class
> `WEBP_BUILD_LIBWEBPMUX` option that defaults ON and is independent of
> `WEBP_BUILD_GIF2WEBP`/`WEBP_BUILD_IMG2WEBP`. Both `libwebpmux.a` and
> `libwebpdemux.a` were already being built and merely not linked, so **no
> cmake change was needed** — only the link lines. Measured cost, read and
> write attributable separately because read lands only on the decoder and
> write only on the encoder: **+4.1 KB / +4.2 KB** on the two decoders,
> **+10.1 KB / +11.1 KB** on the two encoders. Both below the 10-30 KB
> estimate, so neither direction was deferred. The original assessment is kept
> below as a record.


The only package where **payload is a real question**, because WebP metadata
lives in RIFF chunks that the core codec API cannot see. `WebPEncode` and
`WebPDecodeRGBA` know nothing about `ICCP`/`EXIF`/`XMP`; those need the mux
(write) and demux (read) libraries.

Today the Makefile links `libwebp.a` and nothing else:

```make
# packages/webp/codec/Makefile:19-20
enc/webp_enc.js dec/webp_dec.js: $(CODEC_BASELINE_BUILD_DIR)/libwebp.a
enc/webp_enc_simd.js dec/webp_dec_simd.js: $(CODEC_SIMD_BUILD_DIR)/libwebp.a
```

The two sides differ in cost:

- **Decode is close at hand.** `libwebpdemux.a` is already built (28,706 bytes of
  archive) and simply not on the link line. `webp_dec.cpp:5` even
  `#include`s `src/webp/demux.h` already without using anything from it. Adding
  the archive to those prerequisites and calling `WebPDemux*` is the whole job.
- **Encode needs a build change.** `libwebpmux.a` is **not built at all**. The
  Makefile passes `-DWEBP_BUILD_GIF2WEBP=0` and `-DWEBP_BUILD_IMG2WEBP=0`
  (lines 55-56), and upstream gates the mux *library* on exactly those two
  tools (`CMakeLists.txt:443`), not on `WEBP_BUILD_WEBPMUX`. So the mux target
  has to be enabled and then linked.

Archive size is a poor predictor of wasm growth after `-flto` and dead-code
elimination — the PNG measurement below came in at a fifth of the naive
estimate — but budget on the order of 10-30 KB per binary and measure. Against
current sizes (`webp_enc.wasm` 280,763 B, `webp_dec.wasm` 140,212 B) that is
material but not alarming, and it only lands on the two SIMD/baseline variants
that are actually shipped.

### JXL — libjxl @ 9f544641 (Jan 2022, pre-0.7)

> **Resolved, with a stronger reason than the one anticipated below.** The
> obvious fix - add an option to skip the skcms transform and hand back
> untransformed pixels with their real profile - is not implementable
> correctly at this pin. `GetColorEncodingForTarget` ignores the pixel format
> and, for an xyb-encoded image, returns `output_encoding_info.color_encoding`;
> `OutputEncodingInfo::Set` falls back to **linear sRGB** whenever the original
> encoding has no expressible fields, which is precisely the arbitrary-ICC
> case. `JxlDecoderSetPreferredColorProfile` only speaks `JxlColorEncoding`
> enums, so the original space cannot be asked for back. What you would get for
> a lossy Display P3 file - the exact case colour management exists for - is
> linear light quantised to 8 bits, banded in the shadows, tagged with a
> synthesised profile. It would work only for `uses_original_profile` files and
> degrade invisibly for the rest.
>
> So `metadata.icc` reports **sRGB**: the profile describing the pixels the
> caller was actually handed. That keeps JXL consistent with the other packages
> and safe to feed to another codec's encoder. `readIccProfile` reports the
> file's original profile without decoding pixels, which is the genuinely
> useful half and cannot mislabel anything because it never travels attached to
> pixels.
>
> `encode({ icc })` is reachable - `ColorEncoding::SetICC` on the internal path,
> roughly 15 lines - but was not built. Round trips would not be byte-exact,
> because `DecideIfWantICC` drops any profile libjxl can reconstruct from
> fields, so the cross-package contract the other four share would not hold.
> Non-RGB profiles would also need explicit rejection, since the glue always
> feeds 4-channel RGBA.


Reading is already done and already thrown away, as described under Scope.

Writing is blocked by an architectural choice rather than a missing API. The
encoder glue does not use the public `JxlEncoder*` C API at all; it calls libjxl
internals (`jxl::CompressParams`, `jxl::CodecInOut`, `EncodeFile`) and hardcodes
`jxl::ColorEncoding::SRGB(false)`. `JxlEncoderSetICCProfile` exists at the pin
but is unreachable from that design. The options are to set
`io.metadata.m.color_encoding` through `jxl::ColorEncoding::SetICC` on the
internal path, or to bump the four-year-old pin and rewrite the glue against the
public API — a much larger job that belongs to whoever modernises that package.

`JXL_DEC_BOX` is not in the decoder's subscription mask, so EXIF is unavailable
there without additional work.

## The API shape

`ImageData` cannot carry a profile, so surfacing one means either changing what
decode returns or adding somewhere else to get it. Three candidates:

**A. An options flag that switches the return type.**
`decode(buf, { metadata: true })` returning a richer object.

**B. A separate function.** `decodeWithMetadata(buf)`.

**C. Attach the profile to the returned `ImageData` as an extra property.**

### Rejecting C

C is superficially the most attractive: `decode` keeps returning something you
can put straight on a canvas, and existing callers see nothing new. It is also
the only one that is actively unsafe.

`postMessage` and `structuredClone` serialise `ImageData` through its own
algorithm, which copies `data`, `width`, `height` and `colorSpace` and **drops
any other own property**. Running codecs in a Worker and transferring the result
to the main thread is this library's single most common deployment. C would
therefore lose the profile silently, at exactly the boundary where people use
it, with no error and no type change to warn them. Monkey-patching a platform
object also behaves inconsistently across the repo: AVIF's 8-bit path returns a
real `ImageData` while its 10/12/16-bit path already returns a plain object, so
C would mean two different behaviours in one function.

### Choosing between A and B

The rule that settles it:

> **If the return type changes, use a different function. If it does not, use an
> option.**

Decode's return type changes, so decode gets a new function. Encode's does not —
it still resolves to `ArrayBuffer` whether or not a profile went in — so encode
gets an option.

This is not just symmetry for its own sake. With A, the flag only narrows the
return type when TypeScript can see it as a literal. The moment a caller builds
options dynamically, which is the normal thing to do when a flag comes from
config, they get the union back and have to unpick it:

```ts
const opts: DecodeOptions = { metadata: wantMetadata };
const result = await decode(buf, opts);   // ImageData | DecodedImage - now what?
```

B never has that problem, is tree-shakeable, and leaves `decode`'s signature and
documentation completely untouched — which matters because "decode returns
something you can put straight on a canvas" is the library's whole appeal.

A is defensible and other libraries use it; the cost is a second export per
package and a little duplication in the options types. That is the cheaper of
the two prices.

The packages publish per-file entry points (`@jsquash/png/decode.js`) with no
`exports` map, so a new named export in `decode.ts` needs no packaging work.

### The shape

Canonical across all packages, so a profile read from one format can be handed
straight to another's encoder:

```ts
interface ImageMetadata {
  icc?: Uint8Array;   // raw profile, from the profile header
  exif?: Uint8Array;  // raw payload, from the TIFF header ("II"/"MM")
}

interface DecodedImage<T = ImageData> {
  image: T;
  metadata: ImageMetadata;
}

// decode - unchanged
decode(data: ArrayBuffer, options?): Promise<ImageData>

// new
decodeWithMetadata(data: ArrayBuffer, options?): Promise<DecodedImage>
readIccProfile(data: ArrayBuffer): Promise<Uint8Array | undefined>

// encode - options bag gains a field, return type unchanged
encode(image, { icc?: Uint8Array | ArrayBuffer | ArrayBufferView }): Promise<ArrayBuffer>
```

Fields are absent rather than empty when the source carried nothing, so
`if (metadata.icc)` is the natural test. Payloads are raw and unparsed in both
directions: jSquash is not in the business of interpreting them, and anything it
does not understand should still survive a round trip.

`readIccProfile` is a deliberate third entry point. Reading a profile does not
require decoding pixels — PNG's parse stops at the first `IDAT` — so "what
colour space is this file in?" should not cost a full decode.

Metadata is advisory, so it never throws: a malformed ancillary chunk yields
`undefined` rather than failing an image whose pixels are perfectly good. The
inverse holds on encode, where a bad profile is a caller error and throws
eagerly, before any work is done.

## Payload cost

The PNG figures are measured, by building the same source three ways. They are
the useful data point for the others, and they contain a trap worth generalising.

| Build | `squoosh_png_bg.wasm` | Delta |
| --- | --- | --- |
| baseline (no ICC) | 163,585 B | — |
| decode side only (`read_icc_profile`) | 164,469 B | **+884 B** |
| decode + encode, deflating via `fdeflate` | **168,582 B** | **+4,997 B (+3.1%)** |
| decode + encode, deflating via `flate2` | 191,370 B | +27,785 B (+17.0%) |

Reading a profile is nearly free. Writing one costs whatever the compressor
costs, because `iCCP` payloads must be deflated — and **the choice of compressor
dominates everything else**. `png` only reaches for `flate2` on non-default
settings, so on this build miniz_oxide's deflate is dead code that the linker
drops; calling it for the profile drags all of it back in for 26.9 KB. Using
`fdeflate`, which `png` already links for `IDAT`, costs nothing extra.

The trade is worth stating explicitly, because `fdeflate` uses a fixed Huffman
table tuned for filtered image rows and compresses a profile roughly 30% worse.
On the 672-byte profile in `bad-icc-profile.png`: 375 bytes at zlib level 6,
about 590 through `fdeflate`. So the choice is **~215 bytes once per encoded
image against 26.9 KB once per download**, on a module that is otherwise 164 KB.
Break-even is around 130 images, and any bulk conversion passes it immediately —
but the deciding argument is that the per-image cost is under 1% of a real PNG
and `@jsquash/oxipng`, in this same repo, will recompress the chunk optimally for
anyone who cares about the last byte.

**The generalisable rule: prefer whatever compressor or parser is already linked,
and measure rather than estimate.** The naive guess for PNG was "flate2 is
already a dependency of `png`, so it is free"; it was wrong by 27 KB, because
being a dependency is not the same as being reachable.

Applying that to the rest:

- **avif, jxl, jpeg: ~0.** Every byte of code needed is already in the binaries
  — libavif's ICC/Exif handling, libjxl's skcms, MozJPEG's marker machinery.
  These are glue-only changes. Against AVIF's 8.19 MB and JXL's 5.60 MB the
  addition is unmeasurable, which is worth noting given the standing concern
  about those package sizes: **ICC support is not what makes them large.**
- **webp: the only one to budget for**, because it links new archives.
  `libwebpdemux.a` is 28,706 bytes of archive on the decode side; the mux is
  comparable on the encode side. Expect 10-30 KB per binary after LTO, and
  measure before committing — if the encoder cost lands badly, ship decode-only
  first, since the demux is already built and reading is where the correctness
  win is.

## Performance

Profile handling must not slow the common path, and in the PNG implementation it
does not, by construction: `decode` and `encode` keep their exact wasm exports
and code paths, and the metadata work lives in separate functions that callers
opt into.

Measured by loading the baseline and new modules into one process and
alternating trial by trial, 40 interleaved trials on a 1024×768 image:

| | baseline | with ICC |
| --- | --- | --- |
| encode min / p10 | 5.02 / 5.09 ms | 5.03 / 5.10 ms |
| decode min / p10 | 7.17 / 7.22 ms | 7.17 / 7.21 ms |

Identical. Medians on this machine swung ±20% and **changed sign between runs**
(encode +14% then −22%), which is noise from concurrent builds, not signal —
hence reporting minima and p10, which are the right statistics for "how fast can
this code run" under contention. Encoder output is byte-for-byte identical when
no profile is supplied, which is the stronger guarantee: the common path is not
merely as fast, it is the same code.

The metadata path pays one extra copy of the *compressed* input across the wasm
boundary, because `decodeWithMetadata` calls both the decoder and the profile
reader. Passing only a prefix would avoid it, but `iCCP` may follow an arbitrary
number of large text chunks, and truncating would silently lose profiles. A
sub-millisecond memcpy on the opt-in path is the right side of that trade.

## Phased plan

Ordered by value for effort.

**Phase 1 — PNG (done).** Reference implementation. Establishes `ImageMetadata`,
`DecodedImage`, `decodeWithMetadata`, `readIccProfile` and `encode({ icc })`.
+5.0 KB, no measurable slowdown. Details below.

**Phase 2 — AVIF.** Best value for effort remaining: zero payload, ~5 lines of
glue each way against APIs that already exist and are already linked, and AVIF is
where wide-gamut content actually lives. The only wrinkle is that the 8-bit path
returns a real `ImageData` while the >8-bit path returns a plain object, so the
wrapper shape must be applied consistently to both.

**Phase 3 — JPEG.** No payload cost and the highest real-world impact, because
JPEG is the most common wide-gamut source (Adobe RGB and Display P3 camera
output). Costs the most glue — APP2 reassembly and chunking, ~80 lines, hand-
rolled because MozJPEG 3.3.1 predates the helpers. Do EXIF in the same pass: the
APP1 bytes are already saved and discarded, so surfacing them is nearly free and
finally makes `preserveOrientation` part of a coherent metadata story rather
than a one-off.

**Phase 4 — WebP.** Decode first, since `libwebpdemux.a` is already built and
only needs linking. Encode after, once the mux is enabled and its cost measured.
Split the two so a bad payload result on the encoder does not block the decoder.

**Phase 5 — JXL.** Last, and needs a decision before any code. The decoder
converts to sRGB today, so it must either keep converting and report sRGB
honestly, or stop converting and return the source profile with untransformed
pixels — a behaviour change for existing callers. The encoder cannot accept a
profile at all without either working through `jxl::ColorEncoding::SetICC` on
the internal path or bumping a four-year-old pin and rewriting the glue. Lowest
value, highest uncertainty.

**Phase 6 — optional.** EXIF across the remaining formats (PNG `eXIf` needs the
crate bump; AVIF has `avifImageSetMetadataExif` ready; JXL needs `JXL_DEC_BOX`).
A separate `@jsquash/color` package if conversion is ever genuinely wanted —
never a CMM per codec.

Phases 2-5 are independent of each other and can be done in any order or in
parallel; only the shared type shape from phase 1 couples them.

## Implementation status

| Package | ICC read | ICC write | EXIF read | Measured cost |
| --- | --- | --- | --- | --- |
| png | yes | yes | no | +5.0 KB |
| webp | yes | yes | no | +4.1 KB read, +10.1 KB write |
| jpeg | yes | yes | **yes** | +946 B enc, +4.7 KB dec |
| avif | yes | yes | no | +224 B |
| jxl | `readIccProfile` only | **no** | no | ~0 |

JXL is the exception and deliberately so - see below. Verified end to end
across the rest: a profile read from a PNG survives byte-identically through
WebP, JPEG and AVIF encoders, and a profile recovered from a WebP file can be
re-embedded in a JPEG. That portability is the reason
the `ImageMetadata` shape is shared rather than per-package.

Encoding without a profile produces byte-identical output to before in every
package, so the common path is unaffected in both speed and result.

## What was implemented for PNG

Rust (`packages/png/codec/src/lib.rs`):

- `read_icc_profile(data) -> Option<Vec<u8>>` — parses to the first `IDAT` and
  returns the inflated `iCCP` contents. Never throws; returns `None` on any
  parse failure. Keeps `ignore_checksums(true)` to match `decode`.
- `encode_with_icc_profile(..., icc_profile)` — `encode` refactored onto a shared
  `encode_impl`, so the original export keeps its exact signature and does no
  extra work. The chunk is written via the public `Writer::write_chunk` between
  `write_header` and `write_image_data`, which is where the spec requires
  `iCCP` to sit.
- `fdeflate` added as a direct dependency for the reason given above.

TypeScript:

- `meta.ts` — `ImageMetadata`, `DecodedImage`, `IccProfileInput`, and
  `toIccProfileBytes`, which normalises caller input and validates it shallowly
  (minimum length plus the mandatory `acsp` signature at byte 36). Validation
  lives in TS because it costs no wasm, gives better messages, and mirrors how
  `bitDepth` is already checked before crossing the boundary. It is deliberately
  shallow: the contract is passthrough, so profiles jSquash does not understand
  must still survive.
- `decode.ts` — adds `decodeWithMetadata` and `readIccProfile`. `decode` is
  untouched.
- `encode.ts` — adds `EncodeOptions.icc`. The no-profile call is unchanged.
- `index.ts` — re-exports the above. `init`/`dispose` and the shared module
  cache in `init.ts` are untouched.

### Tests

Ten tests in `test/node/png.test.ts`, over two fixtures:

- `test-icc-profile.png` (new) — profile read back at the right length with the
  right signature and self-declared size; the same for the 16-bit path;
  `readIccProfile` without decoding; a decode→encode→decode round trip asserting
  the profile returns byte for byte; the same round trip at 16-bit; a profile
  supplied as a plain `ArrayBuffer`.
- `test.png` — no profile, so `metadata.icc` and `metadata.exif` are absent.
- Encoding with no profile writes no `iCCP` chunk at all, asserted by walking the
  output's chunks. This is the regression guard on the common path.
- Invalid profiles are rejected with specific messages, both too-short and
  right-length-wrong-signature.
- `bad-icc-profile.png` — see below.

`bad-icc-profile.png` exists for GH issue #44: its `iCCP` chunk has a **corrupt
CRC**, and it guards `decoder.ignore_checksums(true)` so such files still decode.
The existing test asserting that is untouched and still passes. The new test goes
further: the profile itself is intact (672 bytes, valid `acsp`), so it now also
asserts the profile comes back despite the bad chunk CRC — the metadata reader
sets `ignore_checksums` for exactly this reason.

### Provenance of the new fixture

`test/fixtures/test-icc-profile.png` is a 50×50 RGBA PNG carrying a **clean-room
ICC v2 RGB matrix-shaper profile** (544 bytes) describing Display P3: P3
primaries, D65 white Bradford-adapted to the D50 PCS, gamma 2.2. It was generated
programmatically rather than copied from a vendor profile, so the repository
takes on no third-party licence — the system profiles in
`/System/Library/ColorSync/Profiles` are Apple and Adobe copyrighted and must not
be committed.

The generated matrix agrees with the published D50-adapted Display P3 values to
four decimal places, and macOS ColorSync validates it end to end: `sips` reports
`profile: Display P3 (jSquash test fixture)` when reading the PNG, and
`sips --matchTo` successfully transforms through it to sRGB. It is a real
profile, not a plausible-looking blob.
