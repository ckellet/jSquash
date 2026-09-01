import test from 'ava';
import { importWasmModule, getFixturesImage } from './utils.js';

import optimise, { init } from '@jsquash/oxipng/optimise.js';
import decodePng, { init as initPngDecode } from '@jsquash/png/decode.js';

test('can successfully optimise png image', async (t) => {
  const [testImage, optimiseWasmModule] = await Promise.all([
    getFixturesImage('test.png'),
    importWasmModule(
      'node_modules/@jsquash/oxipng/codec/pkg/squoosh_oxipng_bg.wasm',
    ),
  ]);
  await init(optimiseWasmModule);
  const optimisedImage = await optimise(testImage);
  t.assert(optimisedImage instanceof ArrayBuffer);
  t.assert(optimisedImage.byteLength < testImage.byteLength);
});

test('can successfully optimise from raw image data and output png image', async (t) => {
  const optimiseWasmModule = await importWasmModule(
    'node_modules/@jsquash/oxipng/codec/pkg/squoosh_oxipng_bg.wasm',
  );
  await init(optimiseWasmModule);

  const testRawImageData = new ImageData(
    new Uint8ClampedArray(4 * 50 * 50),
    50,
    50,
  );
  const optimisedImage = await optimise(testRawImageData);
  t.assert(optimisedImage instanceof ArrayBuffer);
});

test('zopfli produces a smaller file than the default deflater', async (t) => {
  const [testImage, optimiseWasmModule] = await Promise.all([
    getFixturesImage('test.png'),
    importWasmModule(
      'node_modules/@jsquash/oxipng/codec/pkg/squoosh_oxipng_bg.wasm',
    ),
  ]);
  await init(optimiseWasmModule);

  const libdeflate = await optimise(testImage, { level: 2 });
  const zopfli = await optimise(testImage, { level: 2, zopfli: true });

  t.assert(zopfli instanceof ArrayBuffer);
  t.true(
    zopfli.byteLength <= libdeflate.byteLength,
    `zopfli (${zopfli.byteLength}) should not be larger than libdeflate (${libdeflate.byteLength})`,
  );
});

test('zopfli output is still a valid png that decodes to the same pixels', async (t) => {
  const [testImage, optimiseWasmModule, pngWasm] = await Promise.all([
    getFixturesImage('test.png'),
    importWasmModule(
      'node_modules/@jsquash/oxipng/codec/pkg/squoosh_oxipng_bg.wasm',
    ),
    importWasmModule('node_modules/@jsquash/png/codec/pkg/squoosh_png_bg.wasm'),
  ]);
  await init(optimiseWasmModule);
  await initPngDecode(pngWasm);

  const original = await decodePng(testImage);
  const zopfli = await optimise(testImage, { level: 2, zopfli: true });
  const roundTripped = await decodePng(zopfli);

  t.is(roundTripped.width, original.width);
  t.is(roundTripped.height, original.height);
  // Zopfli only changes how the data is compressed, never what it decodes to.
  t.deepEqual(roundTripped.data, original.data);
});

test('zopfliIterations is validated rather than passed through', async (t) => {
  const optimiseWasmModule = await importWasmModule(
    'node_modules/@jsquash/oxipng/codec/pkg/squoosh_oxipng_bg.wasm',
  );
  await init(optimiseWasmModule);

  const testImage = await getFixturesImage('test.png');
  for (const iterations of [0, 256, 1.5]) {
    const error = await t.throwsAsync(() =>
      optimise(testImage, { zopfli: true, zopfliIterations: iterations }),
    );
    t.regex(error!.message, /zopfliIterations/);
  }

  // Out-of-range values are only rejected when zopfli is actually in use.
  await t.notThrowsAsync(() =>
    optimise(testImage, { zopfli: false, zopfliIterations: 0 }),
  );
});
