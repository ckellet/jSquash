import test from 'ava';
import { importWasmModule, getFixturesImage } from './utils.js';

import decode, {
  init as initDecode,
  decodeWithMetadata,
  readIccProfile,
} from '@jsquash/webp/decode.js';
import encode, {
  init as initEncode,
  dispose as disposeEncode,
} from '@jsquash/webp/encode.js';
import {
  init as initPngDecode,
  readIccProfile as readPngIccProfile,
} from '@jsquash/png/decode.js';

const WEBP_ENC_WASM = 'node_modules/@jsquash/webp/codec/enc/webp_enc_simd.wasm';
const WEBP_DEC_WASM = 'node_modules/@jsquash/webp/codec/dec/webp_dec_simd.wasm';
const PNG_WASM = 'node_modules/@jsquash/png/codec/pkg/squoosh_png_bg.wasm';

/**
 * Locate a RIFF chunk by its four-character id, so tests can assert on the
 * container we emit rather than only on what our own decoder reads back.
 */
function findRiffChunk(
  webp: ArrayBuffer,
  fourcc: string,
): Uint8Array | undefined {
  const bytes = new Uint8Array(webp);
  const view = new DataView(webp);
  const idAt = (offset: number) =>
    String.fromCharCode(...bytes.subarray(offset, offset + 4));

  if (idAt(0) !== 'RIFF' || idAt(8) !== 'WEBP') return undefined;

  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const size = view.getUint32(offset + 4, true);
    if (idAt(offset) === fourcc) {
      return bytes.subarray(offset + 8, offset + 8 + size);
    }
    // Chunk payloads are padded to an even length; the padding byte is not
    // counted in the size field.
    offset += 8 + size + (size % 2);
  }
  return undefined;
}

/** The ICC profile from the PNG fixture, which is where a real one lives. */
async function fixtureIccProfile(): Promise<Uint8Array> {
  const [png, pngWasm] = await Promise.all([
    getFixturesImage('test-icc-profile.png'),
    importWasmModule(PNG_WASM),
  ]);
  await initPngDecode(pngWasm);

  const icc = await readPngIccProfile(png);
  if (!icc) throw new Error('the fixture should carry an ICC profile');
  return icc;
}

/**
 * A fully opaque image. Alpha matters here: libwebp writes an ALPH chunk and
 * the extended VP8X header for any image that has some, so an opaque fixture
 * is what lets a test attribute a VP8X header to the profile and nothing else.
 */
const solidImage = (size = 32) => {
  const data = new Uint8ClampedArray(4 * size * size).fill(0x80);
  for (let i = 3; i < data.length; i += 4) data[i] = 0xff;
  return { data, width: size, height: size, colorSpace: 'srgb' as const };
};

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

test('an ICC profile survives an encode/decode round trip byte for byte', async (t) => {
  const [profile, encWasm, decWasm] = await Promise.all([
    fixtureIccProfile(),
    importWasmModule(WEBP_ENC_WASM),
    importWasmModule(WEBP_DEC_WASM),
  ]);
  await Promise.all([initEncode(encWasm), initDecode(decWasm)]);

  const encoded = await encode(solidImage(), { icc: profile });

  // Metadata only exists in the extended container, so a VP8X header has to
  // have appeared alongside the profile.
  t.assert(
    findRiffChunk(encoded, 'VP8X') !== undefined,
    'expected an extended-format header',
  );
  const chunk = findRiffChunk(encoded, 'ICCP');
  t.assert(chunk !== undefined, 'expected an ICCP chunk');
  t.deepEqual(Array.from(chunk!), Array.from(profile));

  const { image, metadata } = await decodeWithMetadata(encoded);
  t.is(image.width, 32);
  t.is(image.height, 32);
  t.assert(metadata.icc instanceof Uint8Array);
  t.deepEqual(
    Array.from(metadata.icc!),
    Array.from(profile),
    'the profile should come back unchanged',
  );
  t.is(metadata.exif, undefined);

  // And without decoding any pixels.
  const readBack = await readIccProfile(encoded);
  t.deepEqual(Array.from(readBack!), Array.from(profile));
});

test('encode writes no ICCP chunk when no profile is supplied', async (t) => {
  const [encWasm, decWasm] = await Promise.all([
    importWasmModule(WEBP_ENC_WASM),
    importWasmModule(WEBP_DEC_WASM),
  ]);
  await Promise.all([initEncode(encWasm), initDecode(decWasm)]);

  const encoded = await encode(solidImage());

  t.is(findRiffChunk(encoded, 'ICCP'), undefined);
  // The simple format is what libwebp has always emitted here; adding a VP8X
  // header for images with no metadata would grow every file for nothing.
  t.is(findRiffChunk(encoded, 'VP8X'), undefined);
  t.is(await readIccProfile(encoded), undefined);

  const { metadata } = await decodeWithMetadata(encoded);
  t.is(metadata.icc, undefined);
  t.is(metadata.exif, undefined);
});

test('decodeWithMetadata omits icc for a file that carries no profile', async (t) => {
  const [testImage, decWasm] = await Promise.all([
    getFixturesImage('test.webp'),
    importWasmModule(WEBP_DEC_WASM),
  ]);
  await initDecode(decWasm);

  const { image, metadata } = await decodeWithMetadata(testImage);
  t.is(image.width, 50);
  t.is(image.height, 50);
  t.is(image.data.length, 4 * 50 * 50);
  t.is(metadata.icc, undefined);
});

test('readIccProfile treats unreadable input as having no profile', async (t) => {
  const decWasm = await importWasmModule(WEBP_DEC_WASM);
  await initDecode(decWasm);

  // Metadata is advisory: nothing here throws, it just has nothing to say.
  t.is(await readIccProfile(new Uint8Array(64).buffer), undefined);
  t.is(await readIccProfile(new ArrayBuffer(0)), undefined);
});

test('encode rejects data that is not an ICC profile', async (t) => {
  const encWasm = await importWasmModule(WEBP_ENC_WASM);
  await initEncode(encWasm);

  const tooShort = await t.throwsAsync(
    encode(solidImage(), { icc: new Uint8Array(16) }),
  );
  t.is(
    tooShort?.message,
    'Invalid ICC profile. Expected at least 132 bytes, got 16.',
  );

  // Long enough, but without the signature every ICC profile must carry.
  const noSignature = await t.throwsAsync(
    encode(solidImage(), { icc: new Uint8Array(200) }),
  );
  t.is(
    noSignature?.message,
    'Invalid ICC profile. Expected an "acsp" signature at byte 36, got "\0\0\0\0".',
  );
});

test('a profile can be supplied as a plain ArrayBuffer', async (t) => {
  const [profile, encWasm, decWasm] = await Promise.all([
    fixtureIccProfile(),
    importWasmModule(WEBP_ENC_WASM),
    importWasmModule(WEBP_DEC_WASM),
  ]);
  await Promise.all([initEncode(encWasm), initDecode(decWasm)]);

  const encoded = await encode(solidImage(), {
    icc: profile.slice().buffer,
    quality: 90,
  });

  const readBack = await readIccProfile(encoded);
  t.deepEqual(Array.from(readBack!), Array.from(profile));
});
