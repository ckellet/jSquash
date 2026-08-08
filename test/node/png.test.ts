import test from 'ava';
import { importWasmModule, getFixturesImage } from './utils.js';

import {
  init as initDecode,
  decode,
  decodeWithMetadata,
  readIccProfile,
} from '@jsquash/png/decode.js';
import encode, { init as initEncode } from '@jsquash/png/encode.js';

const PNG_WASM = 'node_modules/@jsquash/png/codec/pkg/squoosh_png_bg.wasm';

/** Locate a PNG chunk by type, so tests can assert on the bytes we emit. */
function findChunk(png: ArrayBuffer, type: string): Uint8Array | undefined {
  const bytes = new Uint8Array(png);
  const view = new DataView(png);
  let offset = 8; // skip the signature
  while (offset + 8 <= bytes.length) {
    const length = view.getUint32(offset);
    const name = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    if (name === type) return bytes.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;
  }
  return undefined;
}

const signatureOf = (icc: Uint8Array) =>
  String.fromCharCode(...icc.subarray(36, 40));

test('can successfully decode image', async (t) => {
  const [testImage, decodeWasmModule] = await Promise.all([
    getFixturesImage('test.png'),
    importWasmModule('node_modules/@jsquash/png/codec/pkg/squoosh_png_bg.wasm'),
  ]);
  initDecode(decodeWasmModule);
  const data = await decode(testImage, { bitDepth: 8 });
  t.is(data.width, 50);
  t.is(data.height, 50);
  t.is(data.data.length, 4 * 50 * 50);
  t.assert(data.data instanceof Uint8ClampedArray);
});

test('can successfully decode png with invalid ICC profile checksum', async (t) => {
  const [testImage, decodeWasmModule] = await Promise.all([
    getFixturesImage('bad-icc-profile.png'),
    importWasmModule('node_modules/@jsquash/png/codec/pkg/squoosh_png_bg.wasm'),
  ]);
  initDecode(decodeWasmModule);
  const data = await decode(testImage);
  t.is(data.width, 16);
  t.is(data.height, 16);
  t.is(data.data.length, 4 * 16 * 16);
  t.assert(data.data instanceof Uint8ClampedArray);
});

test('can successfully decode png with no alpha', async (t) => {
  const [testImage, decodeWasmModule] = await Promise.all([
    getFixturesImage('test-rgb.png'),
    importWasmModule('node_modules/@jsquash/png/codec/pkg/squoosh_png_bg.wasm'),
  ]);
  initDecode(decodeWasmModule);
  const data = await decode(testImage);
  t.is(data.width, 50);
  t.is(data.height, 50);
  t.is(data.data.length, 4 * 50 * 50);
  t.assert(data.data instanceof Uint8ClampedArray);
});

test('can successfully decode grayscale png with no alpha', async (t) => {
  const [testImage, decodeWasmModule] = await Promise.all([
    getFixturesImage('test-grayscale.png'),
    importWasmModule('node_modules/@jsquash/png/codec/pkg/squoosh_png_bg.wasm'),
  ]);
  initDecode(decodeWasmModule);
  const data = await decode(testImage);
  t.is(data.width, 50);
  t.is(data.height, 50);
  t.is(data.data.length, 4 * 50 * 50);
  t.assert(data.data instanceof Uint8ClampedArray);
});

test('can successfully decode grayscale png with alpha', async (t) => {
  const [testImage, decodeWasmModule] = await Promise.all([
    getFixturesImage('test-grayscale-alpha.png'),
    importWasmModule('node_modules/@jsquash/png/codec/pkg/squoosh_png_bg.wasm'),
  ]);
  initDecode(decodeWasmModule);
  const data = await decode(testImage);
  t.is(data.width, 50);
  t.is(data.height, 50);
  t.is(data.data.length, 4 * 50 * 50);
  t.assert(data.data instanceof Uint8ClampedArray);
});

test('can successfully encode image', async (t) => {
  const encodeWasmModule = await importWasmModule(
    'node_modules/@jsquash/png/codec/pkg/squoosh_png_bg.wasm',
  );
  await initEncode(encodeWasmModule);
  const data = await encode({
    data: new Uint8ClampedArray(4 * 50 * 50),
    height: 50,
    width: 50,
    colorSpace: 'srgb',
  });
  t.assert(data instanceof ArrayBuffer);
});

test('can successfully decode 16bit image to RGB8', async (t) => {
  const [testImage, decodeWasmModule] = await Promise.all([
    getFixturesImage('test-16bit.png'),
    importWasmModule('node_modules/@jsquash/png/codec/pkg/squoosh_png_bg.wasm'),
  ]);
  initDecode(decodeWasmModule);
  const data = await decode(testImage);
  t.is(data.width, 50);
  t.is(data.height, 50);
  t.is(data.data.length, 4 * 50 * 50);
  t.is(data.data.byteLength, 4 * 50 * 50);
  t.assert(data.data instanceof Uint8ClampedArray);
});

test('can successfully decode 8bit image to RGB16', async (t) => {
  const [testImage, decodeWasmModule] = await Promise.all([
    getFixturesImage('test.png'),
    importWasmModule('node_modules/@jsquash/png/codec/pkg/squoosh_png_bg.wasm'),
  ]);
  initDecode(decodeWasmModule);
  const data = await decode(testImage, { bitDepth: 16 });
  t.is(data.width, 50);
  t.is(data.height, 50);
  t.is(data.data.length, 4 * 50 * 50);
  t.is(data.data.byteLength, 8 * 50 * 50);
  t.assert(data.data instanceof Uint16Array);
});

test('can successfully decode 16bit image to RGB16', async (t) => {
  const [testImage, decodeWasmModule] = await Promise.all([
    getFixturesImage('test-16bit.png'),
    importWasmModule('node_modules/@jsquash/png/codec/pkg/squoosh_png_bg.wasm'),
  ]);
  initDecode(decodeWasmModule);
  const data = await decode(testImage, { bitDepth: 16 });
  t.is(data.width, 50);
  t.is(data.height, 50);
  t.is(data.data.length, 4 * 50 * 50);
  t.is(data.data.byteLength, 8 * 50 * 50);
  t.assert(data.data instanceof Uint16Array);
});

test('can successfully decode 16bit rgb image to RGB16', async (t) => {
  const [testImage, decodeWasmModule] = await Promise.all([
    getFixturesImage('test-rgb-16bit.png'),
    importWasmModule('node_modules/@jsquash/png/codec/pkg/squoosh_png_bg.wasm'),
  ]);
  initDecode(decodeWasmModule);
  const data = await decode(testImage, { bitDepth: 16 });
  t.is(data.width, 50);
  t.is(data.height, 50);
  t.is(data.data.length, 4 * 50 * 50);
  t.is(data.data.byteLength, 8 * 50 * 50);
  t.assert(data.data instanceof Uint16Array);
});

test('can successfully decode 16bit grayscale image to RGB16', async (t) => {
  const [testImage, decodeWasmModule] = await Promise.all([
    getFixturesImage('test-grayscale-16bit.png'),
    importWasmModule('node_modules/@jsquash/png/codec/pkg/squoosh_png_bg.wasm'),
  ]);
  initDecode(decodeWasmModule);
  const data = await decode(testImage, { bitDepth: 16 });
  t.is(data.width, 50);
  t.is(data.height, 50);
  t.is(data.data.length, 4 * 50 * 50);
  t.is(data.data.byteLength, 8 * 50 * 50);
  t.assert(data.data instanceof Uint16Array);
});

test('can successfully decode 16bit grayscale alpha image to RGB16', async (t) => {
  const [testImage, decodeWasmModule] = await Promise.all([
    getFixturesImage('test-grayscale-alpha-16bit.png'),
    importWasmModule('node_modules/@jsquash/png/codec/pkg/squoosh_png_bg.wasm'),
  ]);
  initDecode(decodeWasmModule);
  const data = await decode(testImage, { bitDepth: 16 });
  t.is(data.width, 50);
  t.is(data.height, 50);
  t.is(data.data.length, 4 * 50 * 50);
  t.is(data.data.byteLength, 8 * 50 * 50);
  t.assert(data.data instanceof Uint16Array);
});

test('can successfully encode 16bit image', async (t) => {
  const encodeWasmModule = await importWasmModule(
    'node_modules/@jsquash/png/codec/pkg/squoosh_png_bg.wasm',
  );
  await initEncode(encodeWasmModule);
  const data = await encode(
    {
      data: new Uint16Array(4 * 50 * 50),
      height: 50,
      width: 50,
    },
    { bitDepth: 16 },
  );
  t.assert(data instanceof ArrayBuffer);
});

test('throws error if bitDepth is not 8 or 16', async (t) => {
  const encodeWasmModule = await importWasmModule(
    'node_modules/@jsquash/png/codec/pkg/squoosh_png_bg.wasm',
  );
  await initEncode(encodeWasmModule);
  const error = await t.throwsAsync(() =>
    // @ts-expect-error - we're testing invalid bit depths
    encode(
      {
        data: new Uint8ClampedArray(4 * 50 * 50),
        height: 50,
        width: 50,
        colorSpace: 'srgb',
      },
      { bitDepth: 32 },
    ),
  );
  if (!error) {
    t.fail('Expected error to be thrown');
    return;
  }
  t.is(error.message, 'Invalid bit depth. Must be either 8 or 16.');
});

test('throws error if array is Uint16Array and bitDepth is 8', async (t) => {
  const encodeWasmModule = await importWasmModule(
    'node_modules/@jsquash/png/codec/pkg/squoosh_png_bg.wasm',
  );
  await initEncode(encodeWasmModule);
  const error = await t.throwsAsync(() =>
    // @ts-expect-error - we're testing incorrect data type
    encode(
      {
        data: new Uint16Array(4 * 50 * 50),
        height: 50,
        width: 50,
      },
      { bitDepth: 8 },
    ),
  );
  if (!error) {
    t.fail('Expected error to be thrown');
    return;
  }
  t.is(
    error.message,
    'Invalid bit depth, must be 16 for Uint16Array or manually convert to RGB8 values with Uint8Array.',
  );
});

test('throws error if array is Uint8Array and bitDepth is 16', async (t) => {
  const encodeWasmModule = await importWasmModule(
    'node_modules/@jsquash/png/codec/pkg/squoosh_png_bg.wasm',
  );
  await initEncode(encodeWasmModule);
  const error = await t.throwsAsync(() =>
    // @ts-expect-error - we're testing incorrect data type
    encode(
      {
        data: new Uint8ClampedArray(4 * 50 * 50),
        height: 50,
        width: 50,
      },
      { bitDepth: 16 },
    ),
  );
  if (!error) {
    t.fail('Expected error to be thrown');
    return;
  }
  t.is(
    error.message,
    'Invalid bit depth, must be 8 for Uint8Array or manually convert to RGB16 values with Uint16Array.',
  );
});

test('decodeWithMetadata returns the embedded ICC profile', async (t) => {
  const [testImage, wasmModule] = await Promise.all([
    getFixturesImage('test-icc-profile.png'),
    importWasmModule(PNG_WASM),
  ]);
  await initDecode(wasmModule);

  const { image, metadata } = await decodeWithMetadata(testImage);

  t.is(image.width, 50);
  t.is(image.height, 50);
  t.is(image.data.length, 4 * 50 * 50);
  t.assert(image.data instanceof Uint8ClampedArray);

  t.assert(metadata.icc instanceof Uint8Array);
  // The fixture carries a Display P3 matrix-shaper profile.
  t.is(metadata.icc?.byteLength, 544);
  t.is(signatureOf(metadata.icc!), 'acsp');
  // The size the profile declares in its own header must match what came back,
  // which catches truncation in the inflate path.
  t.is(
    new DataView(metadata.icc!.buffer, metadata.icc!.byteOffset).getUint32(0),
    544,
  );
});

test('decodeWithMetadata omits icc when the image carries no profile', async (t) => {
  const [testImage, wasmModule] = await Promise.all([
    getFixturesImage('test.png'),
    importWasmModule(PNG_WASM),
  ]);
  await initDecode(wasmModule);

  const { image, metadata } = await decodeWithMetadata(testImage);

  t.is(image.width, 50);
  t.is(metadata.icc, undefined);
  t.is(metadata.exif, undefined);
});

test('decodeWithMetadata supports 16 bit output', async (t) => {
  const [testImage, wasmModule] = await Promise.all([
    getFixturesImage('test-icc-profile.png'),
    importWasmModule(PNG_WASM),
  ]);
  await initDecode(wasmModule);

  const { image, metadata } = await decodeWithMetadata(testImage, {
    bitDepth: 16,
  });

  t.is(image.width, 50);
  t.is(image.data.byteLength, 8 * 50 * 50);
  t.assert(image.data instanceof Uint16Array);
  t.is(metadata.icc?.byteLength, 544);
});

test('readIccProfile reads the profile without decoding pixels', async (t) => {
  const [withProfile, withoutProfile, wasmModule] = await Promise.all([
    getFixturesImage('test-icc-profile.png'),
    getFixturesImage('test.png'),
    importWasmModule(PNG_WASM),
  ]);
  await initDecode(wasmModule);

  const icc = await readIccProfile(withProfile);
  t.is(icc?.byteLength, 544);
  t.is(signatureOf(icc!), 'acsp');

  t.is(await readIccProfile(withoutProfile), undefined);
});

test('an ICC profile survives a decode/encode round trip byte for byte', async (t) => {
  const [testImage, wasmModule] = await Promise.all([
    getFixturesImage('test-icc-profile.png'),
    importWasmModule(PNG_WASM),
  ]);
  await initDecode(wasmModule);

  const { image, metadata } = await decodeWithMetadata(testImage);
  const encoded = await encode(image, { icc: metadata.icc });

  t.assert(encoded instanceof ArrayBuffer);
  t.assert(findChunk(encoded, 'iCCP') !== undefined, 'expected an iCCP chunk');

  const roundTripped = await readIccProfile(encoded);
  t.deepEqual(
    Array.from(roundTripped!),
    Array.from(metadata.icc!),
    'the profile should come back unchanged',
  );
});

test('encode writes no iCCP chunk when no profile is supplied', async (t) => {
  const wasmModule = await importWasmModule(PNG_WASM);
  await initEncode(wasmModule);

  const encoded = await encode({
    data: new Uint8ClampedArray(4 * 50 * 50),
    height: 50,
    width: 50,
    colorSpace: 'srgb',
  });

  t.is(findChunk(encoded, 'iCCP'), undefined);
  t.is(await readIccProfile(encoded), undefined);
});

test('encode embeds a profile alongside 16 bit pixels', async (t) => {
  const [testImage, wasmModule] = await Promise.all([
    getFixturesImage('test-icc-profile.png'),
    importWasmModule(PNG_WASM),
  ]);
  await initDecode(wasmModule);

  const { image, metadata } = await decodeWithMetadata(testImage, {
    bitDepth: 16,
  });
  const encoded = await encode(image, { bitDepth: 16, icc: metadata.icc });

  t.deepEqual(
    Array.from((await readIccProfile(encoded))!),
    Array.from(metadata.icc!),
  );
});

test('encode accepts a profile as a plain ArrayBuffer', async (t) => {
  const [testImage, wasmModule] = await Promise.all([
    getFixturesImage('test-icc-profile.png'),
    importWasmModule(PNG_WASM),
  ]);
  await initDecode(wasmModule);

  const { image, metadata } = await decodeWithMetadata(testImage);
  const asArrayBuffer = metadata.icc!.slice().buffer;
  const encoded = await encode(image, { icc: asArrayBuffer });

  t.is((await readIccProfile(encoded))?.byteLength, 544);
});

test('encode rejects data that is not an ICC profile', async (t) => {
  const wasmModule = await importWasmModule(PNG_WASM);
  await initEncode(wasmModule);

  const image = {
    data: new Uint8ClampedArray(4 * 50 * 50),
    height: 50,
    width: 50,
    colorSpace: 'srgb' as const,
  };

  const tooShort = await t.throwsAsync(() =>
    encode(image, { icc: new Uint8Array(16) }),
  );
  t.is(
    tooShort?.message,
    'Invalid ICC profile. Expected at least 132 bytes, got 16.',
  );

  // Long enough, but without the signature every ICC profile must carry.
  const noSignature = await t.throwsAsync(() =>
    encode(image, { icc: new Uint8Array(200) }),
  );
  t.is(
    noSignature?.message,
    'Invalid ICC profile. Expected an "acsp" signature at byte 36, got "\0\0\0\0".',
  );
});

test('a png with an invalid iCCP checksum still yields its profile', async (t) => {
  const [testImage, wasmModule] = await Promise.all([
    getFixturesImage('bad-icc-profile.png'),
    importWasmModule(PNG_WASM),
  ]);
  await initDecode(wasmModule);

  // The fixture's iCCP chunk has a corrupt CRC (GH issue #44). Pixels must keep
  // decoding, and the profile itself is intact, so it should come back too.
  const { image, metadata } = await decodeWithMetadata(testImage);

  t.is(image.width, 16);
  t.is(image.height, 16);
  t.is(image.data.length, 4 * 16 * 16);
  t.is(metadata.icc?.byteLength, 672);
  t.is(signatureOf(metadata.icc!), 'acsp');
});
