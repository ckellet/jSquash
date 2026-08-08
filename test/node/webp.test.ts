import test from 'ava';
import { importWasmModule, getFixturesImage } from './utils.js';

import decode, { init as initDecode } from '@jsquash/webp/decode.js';
import encode, {
  init as initEncode,
  dispose as disposeEncode,
} from '@jsquash/webp/encode.js';

test('can successfully decode image', async (t) => {
  const [testImage, decodeWasmModule] = await Promise.all([
    getFixturesImage('test.webp'),
    importWasmModule('node_modules/@jsquash/webp/codec/dec/webp_dec_simd.wasm'),
  ]);
  initDecode(decodeWasmModule);
  const data = await decode(testImage);
  t.is(data.width, 50);
  t.is(data.height, 50);
  t.is(data.data.length, 4 * 50 * 50);
});

test('can successfully encode image', async (t) => {
  const encodeWasmModule = await importWasmModule(
    'node_modules/@jsquash/webp/codec/enc/webp_enc_simd.wasm',
  );
  await initEncode(encodeWasmModule);
  const data = await encode({
    data: new Uint8ClampedArray(4 * 50 * 50),
    height: 50,
    width: 50,
    colorSpace: 'srgb' as const,
  });
  t.assert(data instanceof ArrayBuffer);
});

test('dispose releases the module and encoding still works afterwards', async (t) => {
  const encodeWasmModule = await importWasmModule(
    'node_modules/@jsquash/webp/codec/enc/webp_enc_simd.wasm',
  );
  // ImageData is polyfilled by the codec glue, so the module has to be
  // initialised before one can be constructed under Node.
  await initEncode(encodeWasmModule);
  const imageData = new ImageData(new Uint8ClampedArray(4 * 32 * 32), 32, 32);
  const first = await encode(imageData);
  t.true(first.byteLength > 0);

  disposeEncode();

  // The module has to come back on demand rather than staying disposed.
  await initEncode(encodeWasmModule);
  const second = await encode(imageData);
  t.is(second.byteLength, first.byteLength);
});

test('the SIMD-only entry points round-trip an image', async (t) => {
  // These bind one build statically instead of feature-detecting, so a
  // bundler emits a single .wasm. Same API as the dispatching entries.
  const [
    { default: encodeSimd, init: initEncodeSimd },
    { default: decodeSimd, init: initDecodeSimd },
  ] = await Promise.all([
    import('@jsquash/webp/encode-simd.js'),
    import('@jsquash/webp/decode-simd.js'),
  ]);

  const [encWasm, decWasm] = await Promise.all([
    importWasmModule('node_modules/@jsquash/webp/codec/enc/webp_enc_simd.wasm'),
    importWasmModule('node_modules/@jsquash/webp/codec/dec/webp_dec_simd.wasm'),
  ]);
  await Promise.all([initEncodeSimd(encWasm), initDecodeSimd(decWasm)]);

  const imageData = new ImageData(new Uint8ClampedArray(4 * 32 * 32), 32, 32);
  const encoded = await encodeSimd(imageData);
  t.true(encoded.byteLength > 0);

  const decoded = await decodeSimd(encoded);
  t.is(decoded.width, 32);
  t.is(decoded.height, 32);
});
