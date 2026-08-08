/**
 * Codec benchmark and quality harness.
 *
 * Reports wall time, output size and - for lossy paths - SSIM against the
 * source, so a change can be judged on quality per byte rather than either
 * number alone. Writes JSON so runs can be diffed across branches.
 *
 *   node bench.mjs                          run everything
 *   node bench.mjs --filter webp,resize     run selected suites
 *   node bench.mjs --out before.json        record a baseline
 *   node bench.mjs --compare before.json    diff against one
 *   node bench.mjs --runs 5 --size 2048x1536
 */
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeImage } from './fixture.mjs';
import { ssim } from './ssim.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : argv[i + 1];
};

const RUNS = Number(flag('runs', 3));
const [WIDTH, HEIGHT] = flag('size', '1024x768').split('x').map(Number);
const FILTER = flag('filter', null)?.split(',').map((s) => s.trim());
const OUT = flag('out', null);
const COMPARE = flag('compare', null);

const source = makeImage(WIDTH, HEIGHT);
const results = [];

/** The codec glue polyfills ImageData on import; use it once available. */
const asImageData = (img) =>
  typeof globalThis.ImageData === 'function'
    ? new globalThis.ImageData(img.data, img.width, img.height)
    : img;

async function time(fn) {
  const samples = [];
  let last;
  for (let i = 0; i < RUNS; i += 1) {
    const t0 = performance.now();
    last = await fn();
    samples.push(performance.now() - t0);
  }
  samples.sort((a, b) => a - b);
  return { ms: samples[Math.floor(samples.length / 2)], value: last };
}

async function record(suite, name, fn, { bytes, quality } = {}) {
  try {
    const { ms, value } = await time(fn);
    const row = {
      suite,
      name,
      ms: Number(ms.toFixed(2)),
      bytes: bytes ? bytes(value) : undefined,
      ssim: quality ? Number((await quality(value)).toFixed(5)) : undefined,
    };
    results.push(row);
    const size = row.bytes ? `${(row.bytes / 1024).toFixed(1)} KiB` : '';
    const q = row.ssim !== undefined ? `ssim ${row.ssim.toFixed(4)}` : '';
    console.log(
      `  ${name.padEnd(30)} ${String(row.ms).padStart(9)} ms  ${size.padStart(11)}  ${q}`,
    );
  } catch (err) {
    console.log(`  ${name.padEnd(30)} FAILED: ${err.message}`);
    results.push({ suite, name, error: err.message });
  }
}

const wanted = (suite) => !FILTER || FILTER.includes(suite);

/**
 * Node cannot fetch() a file: URL, which is how the generated glue locates its
 * .wasm by default, so every module is handed a compiled WebAssembly.Module
 * explicitly - the same approach the integration tests take.
 */
async function loadWasm(...candidates) {
  for (const rel of candidates) {
    const path = join(HERE, 'node_modules', rel);
    if (existsSync(path)) return WebAssembly.compile(readFileSync(path));
  }
  throw new Error(`no wasm found, tried: ${candidates.join(', ')}`);
}

async function load(spec) {
  try {
    return await import(spec);
  } catch (err) {
    console.log(`\n[${spec}] unavailable (${err.code ?? err.message}) - skipped`);
    console.log('  build the workspace first: npm run build && (cd bench && npm install)');
    return null;
  }
}

// ---------------------------------------------------------------- resize ---
if (wanted('resize')) {
  const resize = await load('@jsquash/resize');
  if (resize) {
    console.log(`\nresize  (${WIDTH}x${HEIGHT} -> ${WIDTH >> 2}x${HEIGHT >> 2})`);
    await resize.initResize(
      await loadWasm('@jsquash/resize/lib/resize/pkg/squoosh_resize_bg.wasm'),
    );
    await resize.initMagicKernel(
      await loadWasm('@jsquash/resize/lib/magic-kernel/pkg/jsquash_magic_kernel_bg.wasm'),
    );
    await resize.initHqx(
      await loadWasm('@jsquash/resize/lib/hqx/pkg/squooshhqx_bg.wasm'),
    );

    const reference = asImageData(source);
    for (const method of [
      'triangle', 'catrom', 'mitchell', 'lanczos3',
      'magicKernel', 'magicKernelSharp2013', 'magicKernelSharp2021',
    ]) {
      await record('resize', method, () =>
        resize.default(reference, {
          width: WIDTH >> 2, height: HEIGHT >> 2, method,
        }),
      );
    }
    // hqx only upscales, so give it a job it can actually do.
    const small = asImageData(makeImage(256, 192));
    await record('resize', 'hqx (2x upscale)', () =>
      resize.default(small, { width: 512, height: 384, method: 'hqx' }),
    );
  }
}

// ------------------------------------------------------------------ codecs ---
const CODECS = [
  {
    suite: 'jpeg', spec: '@jsquash/jpeg', opts: { quality: 75 },
    enc: ['@jsquash/jpeg/codec/enc/mozjpeg_enc.wasm'],
    dec: ['@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm'],
  },
  {
    suite: 'webp', spec: '@jsquash/webp', opts: { quality: 75 },
    // Node supports SIMD, so the dispatch picks the SIMD build where present.
    enc: ['@jsquash/webp/codec/enc/webp_enc_simd.wasm', '@jsquash/webp/codec/enc/webp_enc.wasm'],
    dec: ['@jsquash/webp/codec/dec/webp_dec_simd.wasm', '@jsquash/webp/codec/dec/webp_dec.wasm'],
  },
  {
    suite: 'qoi', spec: '@jsquash/qoi', opts: undefined,
    enc: ['@jsquash/qoi/codec/enc/qoi_enc.wasm'],
    dec: ['@jsquash/qoi/codec/dec/qoi_dec.wasm'],
  },
  {
    suite: 'png', spec: '@jsquash/png', opts: undefined,
    enc: ['@jsquash/png/codec/pkg/squoosh_png_bg.wasm'],
    dec: null, // same module as the encoder
  },
  {
    suite: 'avif', spec: '@jsquash/avif', opts: { quality: 50, speed: 8 },
    // Node takes the single-threaded branch.
    enc: ['@jsquash/avif/codec/enc/avif_enc.wasm'],
    dec: ['@jsquash/avif/codec/dec/avif_dec.wasm'],
  },
  {
    suite: 'jxl', spec: '@jsquash/jxl', opts: { quality: 75, effort: 5 },
    // Node has no SharedArrayBuffer here but does have SIMD, so the dispatch
    // takes the single-threaded SIMD build.
    enc: ['@jsquash/jxl/codec/enc/jxl_enc_simd.wasm', '@jsquash/jxl/codec/enc/jxl_enc.wasm'],
    dec: ['@jsquash/jxl/codec/dec/jxl_dec_simd.wasm', '@jsquash/jxl/codec/dec/jxl_dec.wasm'],
  },
];

for (const { suite, spec, opts, enc, dec } of CODECS) {
  if (!wanted(suite)) continue;
  const encMod = await load(`${spec}/encode.js`);
  const decMod = await load(`${spec}/decode.js`);
  if (!encMod || !decMod) continue;

  console.log(`\n${suite}`);
  try {
    await encMod.init(await loadWasm(...enc));
    if (dec) await decMod.init(await loadWasm(...dec));
  } catch (err) {
    console.log(`  init failed: ${err.message}`);
    continue;
  }

  const input = asImageData(source);
  let encoded;
  await record(
    suite, 'encode',
    async () => (encoded = await encMod.default(input, opts)),
    {
      bytes: (buf) => buf.byteLength,
      quality: async (buf) => ssim(source, await decMod.default(buf)),
    },
  );
  if (encoded) await record(suite, 'decode', () => decMod.default(encoded));
}

// ------------------------------------------------------------------ oxipng ---
if (wanted('oxipng')) {
  const oxipng = await load('@jsquash/oxipng/optimise.js');
  const pngEnc = await load('@jsquash/png/encode.js');
  if (oxipng && pngEnc) {
    console.log('\noxipng');
    await pngEnc.init(await loadWasm('@jsquash/png/codec/pkg/squoosh_png_bg.wasm'));
    // Outside a Worker the package takes the single-threaded branch.
    await oxipng.init(
      await loadWasm('@jsquash/oxipng/codec/pkg/squoosh_oxipng_bg.wasm'),
    );
    const encoded = await pngEnc.default(asImageData(source));
    for (const level of [1, 2, 3]) {
      await record('oxipng', `optimise level ${level}`,
        () => oxipng.default(encoded, { level }),
        { bytes: (buf) => buf.byteLength });
    }
    console.log(`  (source png: ${(encoded.byteLength / 1024).toFixed(1)} KiB)`);
  }
}

// ------------------------------------------------------------------ output ---
const summary = {
  generatedWith: { runs: RUNS, width: WIDTH, height: HEIGHT, node: process.version },
  results,
};

if (OUT) {
  const path = join(HERE, OUT);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(summary, null, 2));
  console.log(`\nwrote ${path}`);
}

if (COMPARE) {
  const path = join(HERE, COMPARE);
  if (!existsSync(path)) {
    console.error(`\ncompare: ${path} not found`);
    process.exit(1);
  }
  const base = JSON.parse(readFileSync(path, 'utf8'));
  const key = (r) => `${r.suite}/${r.name}`;
  const baseline = new Map(base.results.map((r) => [key(r), r]));

  console.log('\n=== vs baseline ===');
  console.log(
    `${'case'.padEnd(38)} ${'time'.padStart(18)} ${'bytes'.padStart(18)} ${'ssim'.padStart(10)}`,
  );
  for (const row of results) {
    const was = baseline.get(key(row));
    if (!was || row.error || was.error) continue;
    const pct = (now, before) =>
      before == null || now == null
        ? ''.padStart(18)
        : `${before.toFixed(0)}→${now.toFixed(0)} (${now >= before ? '+' : ''}${(((now - before) / before) * 100).toFixed(1)}%)`.padStart(18);
    const dssim =
      row.ssim == null || was.ssim == null
        ? ''.padStart(10)
        : `${(row.ssim - was.ssim >= 0 ? '+' : '')}${(row.ssim - was.ssim).toFixed(4)}`.padStart(10);
    console.log(`${key(row).padEnd(38)} ${pct(row.ms, was.ms)} ${pct(row.bytes, was.bytes)} ${dssim}`);
  }
}
