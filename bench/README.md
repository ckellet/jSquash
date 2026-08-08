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

## Notes

- The source image is generated from a seeded PRNG rather than committed as a
  fixture, so runs are reproducible without carrying megabytes in git. It mixes
  gradients, hard edges, saturated colour, fine noise and an alpha ramp,
  because encoders behave very differently on each.
- Node cannot `fetch()` a `file:` URL, so each module is handed a compiled
  `WebAssembly.Module` explicitly. When a codec ships several builds the
  harness picks the one the runtime dispatch would choose - the SIMD variant
  where it exists, falling back otherwise.
- Timings are the median of `--runs` samples. Close the rest of your machine
  down before trusting small deltas, and never compare numbers taken while a
  build is running.
