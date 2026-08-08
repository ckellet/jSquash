# Benchmarks

Measures wall time, output size and quality for every codec, so codec and
build-flag changes can be judged on evidence rather than intuition. A change
that shrinks output by degrading the image is not an improvement, which is why
SSIM is reported alongside byte counts.

## Running

The harness runs against the built packages, so build the workspace first:

```sh
npm run build          # from the repository root
npm run bench          # installs bench deps and runs everything
```

Or directly, for more control:

```sh
cd bench
npm install
node bench.mjs --runs 5 --size 2048x1536
node bench.mjs --filter webp,resize
```

## Comparing two branches

Record a baseline, switch branches, rebuild, then compare:

```sh
node bench.mjs --out baseline.json
# ... change something, npm run build ...
node bench.mjs --compare baseline.json
```

The comparison prints per-case deltas for time, size and SSIM.

A convenient way to get a clean baseline without stashing work in progress:

```sh
git worktree add /tmp/jsquash-baseline main
cp -r bench /tmp/jsquash-baseline/bench
cd /tmp/jsquash-baseline && npm install && npx turbo run build
cd bench && npm install && node bench.mjs --out baseline.json
```

## Comparing two builds under load (`ab.mjs`)

`bench.mjs` measures one build at a time, so a fair before/after needs a quiet
machine. When you cannot have one — parallel codec builds, a shared box —
use the interleaved comparison instead:

```sh
node ab.mjs --codec qoi --a /path/to/old/dist --b /path/to/new/dist
node ab.mjs --codec webp --a ../a --b ../b --op decode --runs 40
```

It alternates between the two builds trial by trial inside one process, so
drift, thermal throttling and background load hit both arms equally and mostly
cancel out of the difference. Both arms are warmed up first, and which arm goes
first alternates each round.

`--a` and `--b` are **built package directories** — what `npm run build` leaves
in `packages/<codec>/dist` — not bare `.wasm` files. Emscripten 4.x renamed
embind's internals, so glue and binary have to be compared as a pair; loading a
4.x `.wasm` with 3.x glue fails on missing symbols.

Its noise floor is measured rather than assumed: comparing a build against
itself reports 0.1%.

One trap when preparing the two arms: `npx turbo run build` is cached, and will
happily restore a `dist` from a previous state rather than rebuilding. Build
each arm directly (`cd packages/<codec> && npm run build`) or you may end up
comparing a binary with itself without noticing.

## Notes

- The source image is generated from a seeded PRNG rather than committed as a
  fixture, so runs are reproducible without carrying megabytes in git. It mixes
  gradients, hard edges, saturated colour, fine noise and an alpha ramp,
  because encoders behave very differently on each.
- Node cannot `fetch()` a `file:` URL, so each module is handed a compiled
  `WebAssembly.Module` explicitly. When a codec ships several builds the
  harness picks the one the runtime dispatch would choose - the SIMD variant
  where it exists, falling back otherwise.
- Reported time is the **fastest** of `--runs` samples, taken after `--warmup`
  untimed iterations (3 by default). Both matter:
  - WebAssembly starts in V8's baseline compiler (Liftoff) and tiers up to
    TurboFan only after a few executions. Timing from the first call mixes two
    compilers into one distribution, which on its own can manufacture a swing
    of 25% or more in either direction.
  - Interference only ever makes a run slower, so the minimum is the closest
    estimate of the true cost. The median is recorded alongside it, and a
    spread above 1.25x is printed as a warning that the machine was not quiet.
- The harness records load average and refuses to write an `--out` baseline
  when the machine is oversubscribed. Sizes and SSIM stay valid under load;
  only wall time does not.
- SSIM here is computed on the luma plane. It is a good proxy for detail
  retention and a poor one for colour: it cannot see chroma bleed, so it will
  not show you what an option like WebP's `use_sharp_yuv` does. Measure chroma
  separately if that is what you are changing.
