/**
 * Interleaved A/B comparison of two builds of the same codec.
 *
 * Sequential before/after runs are only trustworthy on a quiet machine. This
 * alternates between the two builds trial by trial inside one process, so
 * drift, thermal throttling and background load hit both arms equally and
 * mostly cancel out of the difference.
 *
 * Both arms are warmed up first: WebAssembly starts in V8's baseline compiler
 * and tiers up after a few executions, and a build that happens to be measured
 * first would otherwise carry that cost alone.
 *
 *   node ab.mjs --codec webp --a /path/to/old/dist --b /path/to/new/dist
 *   node ab.mjs --codec jpeg --a ../a --b ../b --op decode --runs 40
 *
 * --a and --b are built package directories (what `npm run build` puts in
 * packages/<codec>/dist), so this compares glue and wasm together - necessary
 * across Emscripten versions, which rename embind internals.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { makeImage } from './fixture.mjs';

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : argv[i + 1];
};

const CODEC = flag('codec');
const DIR_A = flag('a');
const DIR_B = flag('b');
const OP = flag('op', 'encode');
const RUNS = Number(flag('runs', 25));
const WARMUP = Number(flag('warmup', 5));
const [WIDTH, HEIGHT] = flag('size', '1024x768').split('x').map(Number);

if (!CODEC || !DIR_A || !DIR_B) {
  console.error('usage: node ab.mjs --codec <name> --a <dist> --b <dist> [--op encode|decode]');
  process.exit(1);
}

/** Where each codec keeps its wasm, most-preferred build first. */
const WASM = {
  webp: { encode: ['codec/enc/webp_enc_simd.wasm', 'codec/enc/webp_enc.wasm'],
          decode: ['codec/dec/webp_dec_simd.wasm', 'codec/dec/webp_dec.wasm'] },
  jpeg: { encode: ['codec/enc/mozjpeg_enc.wasm'], decode: ['codec/dec/mozjpeg_dec.wasm'] },
  qoi:  { encode: ['codec/enc/qoi_enc.wasm'], decode: ['codec/dec/qoi_dec.wasm'] },
  // png's encoder and decoder share one wasm-bindgen module.
  png:  { encode: ['codec/pkg/squoosh_png_bg.wasm'], decode: ['codec/pkg/squoosh_png_bg.wasm'] },
  avif: { encode: ['codec/enc/avif_enc_simd.wasm', 'codec/enc/avif_enc.wasm'],
          decode: ['codec/dec/avif_dec.wasm'] },
  jxl:  { encode: ['codec/enc/jxl_enc_simd.wasm', 'codec/enc/jxl_enc.wasm'],
          decode: ['codec/dec/jxl_dec_simd.wasm', 'codec/dec/jxl_dec.wasm'] },
};

const OPTS = { jpeg: { quality: 75 }, webp: { quality: 75 },
               avif: { quality: 50, speed: 8 }, jxl: { quality: 75, effort: 5 } };

async function loadArm(dir) {
  const root = resolve(dir);
  const pick = (candidates) => {
    for (const rel of candidates) {
      const p = join(root, rel);
      if (existsSync(p)) return p;
    }
    throw new Error(`no wasm in ${root}, tried: ${candidates.join(', ')}`);
  };

  const enc = await import(pathToFileURL(join(root, 'encode.js')).href);
  const dec = await import(pathToFileURL(join(root, 'decode.js')).href);
  await enc.init(await WebAssembly.compile(readFileSync(pick(WASM[CODEC].encode))));
  await dec.init(await WebAssembly.compile(readFileSync(pick(WASM[CODEC].decode))));
  return { enc, dec, root };
}

const source = makeImage(WIDTH, HEIGHT);
const a = await loadArm(DIR_A);
const b = await loadArm(DIR_B);

const asImageData = (img) =>
  typeof globalThis.ImageData === 'function'
    ? new globalThis.ImageData(img.data, img.width, img.height)
    : img;
const input = asImageData(source);

const encoded = {
  a: await a.enc.default(input, OPTS[CODEC]),
  b: await b.enc.default(input, OPTS[CODEC]),
};

const run = (arm) =>
  OP === 'encode'
    ? arm.enc.default(input, OPTS[CODEC])
    : arm.dec.default(arm === a ? encoded.a : encoded.b);

for (let i = 0; i < WARMUP; i += 1) {
  await run(a);
  await run(b);
}

const samples = { a: [], b: [] };
for (let i = 0; i < RUNS; i += 1) {
  // Alternate which arm goes first, so neither consistently benefits from
  // whatever state the other leaves behind.
  for (const arm of i % 2 ? ['b', 'a'] : ['a', 'b']) {
    const target = arm === 'a' ? a : b;
    const t0 = performance.now();
    await run(target);
    samples[arm].push(performance.now() - t0);
  }
}

const stat = (xs) => {
  const s = [...xs].sort((x, y) => x - y);
  return { min: s[0], median: s[Math.floor(s.length / 2)] };
};
const sa = stat(samples.a);
const sb = stat(samples.b);
const delta = ((sb.min - sa.min) / sa.min) * 100;

console.log(`\n${CODEC} ${OP}  (${WIDTH}x${HEIGHT}, ${RUNS} interleaved pairs, ${WARMUP} warmup)\n`);
console.log(`  A  ${DIR_A}`);
console.log(`     min ${sa.min.toFixed(2)} ms   median ${sa.median.toFixed(2)} ms`);
console.log(`  B  ${DIR_B}`);
console.log(`     min ${sb.min.toFixed(2)} ms   median ${sb.median.toFixed(2)} ms`);
console.log(`\n  B vs A: ${delta >= 0 ? '+' : ''}${delta.toFixed(1)}% on the minimum`);
if (encoded.a.byteLength !== encoded.b.byteLength) {
  console.log(`  !! output differs: ${encoded.a.byteLength} vs ${encoded.b.byteLength} bytes`);
} else {
  console.log(`  output identical in size (${encoded.a.byteLength} bytes)`);
}
