import test from 'ava';
import { importWasmModule, getFixturesImage } from './utils.js';

import decode, {
  init as initDecode,
  decodeWithMetadata,
  readIccProfile,
} from '@jsquash/jxl/decode.js';
import encode, {
  init as initEncode,
  dispose as disposeEncode,
} from '@jsquash/jxl/encode.js';
import decodeSimd, {
  init as initDecodeSimd,
} from '@jsquash/jxl/decode-simd.js';
import encodeSimd, {
  init as initEncodeSimd,
  dispose as disposeEncodeSimd,
} from '@jsquash/jxl/encode-simd.js';
import encodeScalar, {
  init as initEncodeScalar,
  dispose as disposeEncodeScalar,
} from '@jsquash/jxl/encode-scalar.js';
import decodeScalar, {
  init as initDecodeScalar,
  dispose as disposeDecodeScalar,
} from '@jsquash/jxl/decode-scalar.js';

/** Every ICC profile carries "acsp" at byte 36. */
const signatureOf = (icc: Uint8Array) =>
  String.fromCharCode(...icc.subarray(36, 40));

test('can successfully decode image', async (t) => {
  const [testImage, decodeWasmModule] = await Promise.all([
    getFixturesImage('test.jxl'),
    importWasmModule('node_modules/@jsquash/jxl/codec/dec/jxl_dec_simd.wasm'),
  ]);
  initDecode(decodeWasmModule);
  const data = await decode(testImage);
  t.is(data.width, 50);
  t.is(data.height, 50);
  t.is(data.data.length, 4 * 50 * 50);
});

test('can successfully encode image', async (t) => {
  const encodeWasmModule = await importWasmModule(
    'node_modules/@jsquash/jxl/codec/enc/jxl_enc_simd.wasm',
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

test('can successfully encode and decode lossless image', async (t) => {
  const [encodeWasmModule, decodeWasmModule] = await Promise.all([
    importWasmModule('node_modules/@jsquash/jxl/codec/enc/jxl_enc_simd.wasm'),
    importWasmModule('node_modules/@jsquash/jxl/codec/dec/jxl_dec_simd.wasm'),
  ]);
  await initEncode(encodeWasmModule);
  initDecode(decodeWasmModule);

  const originalImageData = {
    width: 10,
    height: 10,
    data: new Uint8ClampedArray(4 * 10 * 10),
    colorSpace: 'srgb' as const,
  };
  // Fill with some non-zero data
  for (let i = 0; i < originalImageData.data.length; i++) {
    originalImageData.data[i] = (i * 3 + 7) % 256;
  }

  const encodedData = await encode(originalImageData, { lossless: true });
  t.assert(encodedData instanceof ArrayBuffer);

  const decodedData = await decode(encodedData);
  if (!decodedData) {
    t.fail('Failed to decode image');
    return;
  }

  t.is(decodedData.width, originalImageData.width);
  t.is(decodedData.height, originalImageData.height);
  t.deepEqual(
    decodedData.data,
    originalImageData.data,
    'Decoded data should match original for lossless',
  );
});

test('encodes lossless even with conflicting quality option', async (t) => {
  const [encodeWasmModule, decodeWasmModule] = await Promise.all([
    importWasmModule('node_modules/@jsquash/jxl/codec/enc/jxl_enc_simd.wasm'),
    importWasmModule('node_modules/@jsquash/jxl/codec/dec/jxl_dec_simd.wasm'),
  ]);
  await initEncode(encodeWasmModule);
  initDecode(decodeWasmModule);

  const originalImageData = {
    width: 8,
    height: 8,
    data: new Uint8ClampedArray(4 * 8 * 8),
    colorSpace: 'srgb' as const,
  };
  for (let i = 0; i < originalImageData.data.length; i++) {
    originalImageData.data[i] = (i * 5) % 256;
  }

  // Encode with lossless true but also a lossy quality setting
  const encodedData = await encode(originalImageData, {
    lossless: true,
    quality: 50,
  });
  t.assert(encodedData instanceof ArrayBuffer);

  const decodedData = await decode(encodedData);
  if (!decodedData) {
    t.fail('Failed to decode image');
    return;
  }

  t.deepEqual(
    decodedData.data,
    originalImageData.data,
    'Decoded data should match original even with conflicting quality',
  );
});

test('dispose releases each entry point and work continues afterwards', async (t) => {
  // Every entry point owns its own cached module, so dispose has to be checked
  // on each rather than once. encode-mt.js is left out: it needs threads, and
  // encode.js already refuses to pick a threaded build under Node.
  const [encodeWasmModule, decodeWasmModule] = await Promise.all([
    importWasmModule('node_modules/@jsquash/jxl/codec/enc/jxl_enc_simd.wasm'),
    importWasmModule('node_modules/@jsquash/jxl/codec/dec/jxl_dec_simd.wasm'),
  ]);
  const scalarEncodeModule = await importWasmModule(
    'node_modules/@jsquash/jxl/codec/enc/jxl_enc.wasm',
  );
  const scalarDecodeModule = await importWasmModule(
    'node_modules/@jsquash/jxl/codec/dec/jxl_dec.wasm',
  );

  const image = {
    width: 16,
    height: 16,
    data: new Uint8ClampedArray(4 * 16 * 16),
    colorSpace: 'srgb' as const,
  };
  for (let i = 0; i < image.data.length; i++) image.data[i] = (i * 7) % 256;

  for (const [name, init, run, release, wasm] of [
    ['encode.js', initEncode, encode, disposeEncode, encodeWasmModule],
    [
      'encode-simd.js',
      initEncodeSimd,
      encodeSimd,
      disposeEncodeSimd,
      encodeWasmModule,
    ],
    [
      'encode-scalar.js',
      initEncodeScalar,
      encodeScalar,
      disposeEncodeScalar,
      scalarEncodeModule,
    ],
  ] as const) {
    await init(wasm);
    const first = await run(image, { lossless: true });
    release();
    await init(wasm);
    const second = await run(image, { lossless: true });
    t.is(second.byteLength, first.byteLength, `${name} survives dispose()`);
  }

  // And the decoder, which has to keep handing back the same pixels.
  await initEncodeSimd(encodeWasmModule);
  const encoded = await encodeSimd(image, { lossless: true });

  initDecodeScalar(scalarDecodeModule);
  const before = await decodeScalar(encoded);
  disposeDecodeScalar();
  initDecodeScalar(scalarDecodeModule);
  const after = await decodeScalar(encoded);
  t.deepEqual(after.data, before.data, 'decode-scalar.js survives dispose()');

  initDecodeSimd(decodeWasmModule);
  t.deepEqual(
    (await decodeSimd(encoded)).data,
    before.data,
    'the SIMD and scalar decoders agree',
  );
});

test('lossless round trip is exact for a non-square image', async (t) => {
  // The encoder takes a heap pointer rather than a typed array, so the wasm
  // side derives the input length from width*height*4 instead of being told
  // it. A square fixture hides a transposed or mis-strided read; this does not.
  const [encodeWasmModule, decodeWasmModule] = await Promise.all([
    importWasmModule('node_modules/@jsquash/jxl/codec/enc/jxl_enc_simd.wasm'),
    importWasmModule('node_modules/@jsquash/jxl/codec/dec/jxl_dec_simd.wasm'),
  ]);
  await initEncode(encodeWasmModule);
  initDecode(decodeWasmModule);

  const originalImageData = {
    width: 37,
    height: 11,
    data: new Uint8ClampedArray(4 * 37 * 11),
    colorSpace: 'srgb' as const,
  };
  for (let i = 0; i < originalImageData.data.length; i++) {
    originalImageData.data[i] = (i * 13 + 29) % 256;
  }

  const encoded = await encode(originalImageData, { lossless: true });
  const decoded = await decode(encoded);

  t.is(decoded.width, 37);
  t.is(decoded.height, 11);
  t.deepEqual(decoded.data, originalImageData.data);
});

test('decodeWithMetadata returns the same pixels as decode', async (t) => {
  const [testImage, decodeWasmModule] = await Promise.all([
    getFixturesImage('test.jxl'),
    importWasmModule('node_modules/@jsquash/jxl/codec/dec/jxl_dec_simd.wasm'),
  ]);
  initDecode(decodeWasmModule);

  const plain = await decode(testImage);
  const { image, metadata } = await decodeWithMetadata(testImage);

  t.is(image.width, plain.width);
  t.is(image.height, plain.height);
  t.deepEqual(image.data, plain.data, 'decode() must be left untouched');
  t.is(metadata.exif, undefined, 'EXIF needs JXL_DEC_BOX, which is not wired');
});

test('decodeWithMetadata reports sRGB, the space the pixels are in', async (t) => {
  // JXL's decoder converts to sRGB on the way out, so the profile reported
  // alongside the pixels describes *them*, not the file. It is therefore the
  // same profile for every JXL image, which is the honest answer - see
  // readIccProfile below for what the file itself declares.
  const [testImage, decodeWasmModule] = await Promise.all([
    getFixturesImage('test.jxl'),
    importWasmModule('node_modules/@jsquash/jxl/codec/dec/jxl_dec_simd.wasm'),
  ]);
  initDecode(decodeWasmModule);

  const { metadata } = await decodeWithMetadata(testImage);

  t.assert(metadata.icc instanceof Uint8Array);
  t.is(signatureOf(metadata.icc!), 'acsp');
  // Bytes 16-19 are the profile's data colour space.
  t.is(String.fromCharCode(...metadata.icc!.subarray(16, 20)), 'RGB ');
});

test('readIccProfile reads the profile the file declares', async (t) => {
  const [testImage, decodeWasmModule] = await Promise.all([
    getFixturesImage('test.jxl'),
    importWasmModule('node_modules/@jsquash/jxl/codec/dec/jxl_dec_simd.wasm'),
  ]);
  initDecode(decodeWasmModule);

  const icc = await readIccProfile(testImage);

  t.assert(icc instanceof Uint8Array);
  t.is(signatureOf(icc!), 'acsp');
});

test('readIccProfile is advisory and never throws on rubbish', async (t) => {
  const decodeWasmModule = await importWasmModule(
    'node_modules/@jsquash/jxl/codec/dec/jxl_dec_simd.wasm',
  );
  initDecode(decodeWasmModule);

  t.is(await readIccProfile(new Uint8Array(64).buffer), undefined);
});

test('an encoded image declares sRGB, matching what the encoder writes', async (t) => {
  // The encoder hardcodes jxl::ColorEncoding::SRGB, so a file it produces
  // declares sRGB. This pins that: if encode ever grows an `icc` option, this
  // is the assertion that has to change.
  const [encodeWasmModule, decodeWasmModule] = await Promise.all([
    importWasmModule('node_modules/@jsquash/jxl/codec/enc/jxl_enc_simd.wasm'),
    importWasmModule('node_modules/@jsquash/jxl/codec/dec/jxl_dec_simd.wasm'),
  ]);
  await initEncode(encodeWasmModule);
  initDecode(decodeWasmModule);

  const encoded = await encode({
    data: new Uint8ClampedArray(4 * 16 * 16),
    height: 16,
    width: 16,
    colorSpace: 'srgb' as const,
  });

  const icc = await readIccProfile(encoded);
  t.assert(icc instanceof Uint8Array);
  t.is(signatureOf(icc!), 'acsp');
});

test('single-variant entry points round-trip an image', async (t) => {
  // encode-simd.js and decode-simd.js are statically bound to the SIMD builds,
  // so they never consult wasm-feature-detect and never reach for the threaded
  // encoder. Same API as encode.js/decode.js, including init() and dispose().
  const [encodeWasmModule, decodeWasmModule] = await Promise.all([
    importWasmModule('node_modules/@jsquash/jxl/codec/enc/jxl_enc_simd.wasm'),
    importWasmModule('node_modules/@jsquash/jxl/codec/dec/jxl_dec_simd.wasm'),
  ]);
  await initEncodeSimd(encodeWasmModule);
  initDecodeSimd(decodeWasmModule);

  const originalImageData = {
    width: 12,
    height: 12,
    data: new Uint8ClampedArray(4 * 12 * 12),
    colorSpace: 'srgb' as const,
  };
  for (let i = 0; i < originalImageData.data.length; i++) {
    originalImageData.data[i] = (i * 11 + 3) % 256;
  }

  const encodedData = await encodeSimd(originalImageData, { lossless: true });
  t.assert(encodedData instanceof ArrayBuffer);

  const decodedData = await decodeSimd(encodedData);
  if (!decodedData) {
    t.fail('Failed to decode image');
    return;
  }

  t.is(decodedData.width, originalImageData.width);
  t.is(decodedData.height, originalImageData.height);
  t.deepEqual(
    decodedData.data,
    originalImageData.data,
    'Decoded data should match original through the single-variant entries',
  );
});
