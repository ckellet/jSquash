import test from 'ava';
import { importWasmModule, getFixturesImage, decoded } from './utils.js';

import decode, {
  decodeWithMetadata,
  readIccProfile,
  init as initDecode,
} from '@jsquash/avif/decode.js';
import encode, { init as initEncode } from '@jsquash/avif/encode.js';
import encodeSimd, {
  init as initEncodeSimd,
} from '@jsquash/avif/encode-simd.js';
import {
  init as initPngDecode,
  readIccProfile as readPngIccProfile,
} from '@jsquash/png/decode.js';

const AVIF_ENC_WASM = 'node_modules/@jsquash/avif/codec/enc/avif_enc_simd.wasm';
const AVIF_DEC_WASM = 'node_modules/@jsquash/avif/codec/dec/avif_dec.wasm';
const PNG_WASM = 'node_modules/@jsquash/png/codec/pkg/squoosh_png_bg.wasm';

const signatureOf = (icc: Uint8Array) =>
  String.fromCharCode(...icc.subarray(36, 40));

/**
 * A real ICC profile to pass around, borrowed from the PNG fixture.
 *
 * The point of the canonical metadata shape is that a profile read from one
 * format can be handed straight to another's encoder, so the AVIF tests
 * exercise exactly that rather than inventing their own bytes.
 */
async function displayP3Profile(): Promise<Uint8Array> {
  const [png, pngWasm] = await Promise.all([
    getFixturesImage('test-icc-profile.png'),
    importWasmModule(PNG_WASM),
  ]);
  await initPngDecode(pngWasm);
  const icc = await readPngIccProfile(png);
  if (!icc) throw new Error('Fixture is missing its ICC profile');
  return icc;
}

const solidImage = (width = 16, height = 16) => {
  const data = new Uint8ClampedArray(4 * width * height);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = i % 256;
    data[i + 1] = (i + 64) % 256;
    data[i + 2] = (i + 128) % 256;
    data[i + 3] = 255;
  }
  return { data, width, height, colorSpace: 'srgb' as const };
};

test('can successfully decode image', async (t) => {
  const [testImage, decodeWasmModule] = await Promise.all([
    getFixturesImage('test.avif'),
    importWasmModule('node_modules/@jsquash/avif/codec/dec/avif_dec.wasm'),
  ]);
  initDecode(decodeWasmModule);
  const data = await decode(testImage);
  if (!data) {
    t.fail('Failed to decode image');
    return;
  }
  t.is(data.width, 50);
  t.is(data.height, 50);
  t.is(data.data.length, 4 * 50 * 50);
});

test('can successfully decode 10-bit image', async (t) => {
  const [testImage, decodeWasmModule] = await Promise.all([
    getFixturesImage('test-10bit.avif'),
    importWasmModule('node_modules/@jsquash/avif/codec/dec/avif_dec.wasm'),
  ]);
  initDecode(decodeWasmModule);
  const data = decoded(await decode(testImage, { bitDepth: 10 }));
  t.is(data.width, 128);
  t.is(data.height, 128);
  t.is(data.data.length, 4 * 128 * 128);

  for (let i = 0; i < data.data.length; i++) {
    const pixelValue = data.data[i];
    t.true(
      pixelValue >= 0 && pixelValue <= 1023,
      `Pixel value at index ${i} (value: ${pixelValue}) should be in the 0-1023 range.`,
    );
  }

  // Additionally, check that some pixel values are greater than 255 (greater than 8-bit)
  t.true(data.data.some((value) => value > 255));
});

test('can successfully decode 12-bit image', async (t) => {
  const [testImage, decodeWasmModule] = await Promise.all([
    getFixturesImage('test-12bit.avif'),
    importWasmModule('node_modules/@jsquash/avif/codec/dec/avif_dec.wasm'),
  ]);
  initDecode(decodeWasmModule);
  const data = decoded(await decode(testImage, { bitDepth: 12 }));
  t.is(data.width, 128);
  t.is(data.height, 128);
  t.is(data.data.length, 4 * 128 * 128);

  for (let i = 0; i < data.data.length; i++) {
    const pixelValue = data.data[i];
    t.true(
      pixelValue >= 0 && pixelValue <= 4095,
      `Pixel value at index ${i} (value: ${pixelValue}) should be in the 0-4095 range.`,
    );
  }

  // Additionally, check that some pixel values are greater than 1023 (greater than 10-bit)
  t.true(data.data.some((value) => value > 1023));
});

test('can successfully decode 12-bit image to 10-bit precision', async (t) => {
  const [testImage, decodeWasmModule] = await Promise.all([
    getFixturesImage('test-12bit.avif'),
    importWasmModule('node_modules/@jsquash/avif/codec/dec/avif_dec.wasm'),
  ]);
  initDecode(decodeWasmModule);
  const data = decoded(await decode(testImage, { bitDepth: 10 }));
  t.is(data.width, 128);
  t.is(data.height, 128);
  t.is(data.data.length, 4 * 128 * 128);

  for (let i = 0; i < data.data.length; i++) {
    const pixelValue = data.data[i];
    t.true(
      pixelValue >= 0 && pixelValue <= 1023,
      `Pixel value at index ${i} (value: ${pixelValue}) should be in the 0-1023 range.`,
    );
  }

  // Additionally, check that some pixel values are greater than 255 (greater than 8-bit)
  t.true(data.data.some((value) => value > 255));
});

test('can successfully decode 12-bit image to 8-bit precision', async (t) => {
  const [testImage, decodeWasmModule] = await Promise.all([
    getFixturesImage('test-12bit.avif'),
    importWasmModule('node_modules/@jsquash/avif/codec/dec/avif_dec.wasm'),
  ]);
  initDecode(decodeWasmModule);
  const data = await decode(testImage);
  if (!data) {
    t.fail('Failed to decode image');
    return;
  }
  t.is(data.width, 128);
  t.is(data.height, 128);
  t.is(data.data.length, 4 * 128 * 128);

  for (let i = 0; i < data.data.length; i++) {
    const pixelValue = data.data[i];
    t.true(
      pixelValue >= 0 && pixelValue <= 255,
      `Pixel value at index ${i} (value: ${pixelValue}) should be in the 0-255 range.`,
    );
  }
});

test('can successfully decode 10-bit image to 8-bit precision', async (t) => {
  const [testImage, decodeWasmModule] = await Promise.all([
    getFixturesImage('test-10bit.avif'),
    importWasmModule('node_modules/@jsquash/avif/codec/dec/avif_dec.wasm'),
  ]);
  initDecode(decodeWasmModule);
  const data = await decode(testImage);
  if (!data) {
    t.fail('Failed to decode image');
    return;
  }
  t.is(data.width, 128);
  t.is(data.height, 128);
  t.is(data.data.length, 4 * 128 * 128);

  for (let i = 0; i < data.data.length; i++) {
    const pixelValue = data.data[i];
    t.true(
      pixelValue >= 0 && pixelValue <= 255,
      `Pixel value at index ${i} (value: ${pixelValue}) should be in the 0-255 range.`,
    );
  }
});

test('can successfully encode image', async (t) => {
  const encodeWasmModule = await importWasmModule(
    'node_modules/@jsquash/avif/codec/enc/avif_enc_simd.wasm',
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

test('can successfully encode 10-bit image', async (t) => {
  const encodeWasmModule = await importWasmModule(
    'node_modules/@jsquash/avif/codec/enc/avif_enc_simd.wasm',
  );
  await initEncode(encodeWasmModule);
  const data = await encode(
    {
      data: new Uint16Array(4 * 50 * 50),
      height: 50,
      width: 50,
    },
    {
      bitDepth: 10,
    },
  );
  t.assert(data instanceof ArrayBuffer);
});

test('can successfully encode 12-bit image', async (t) => {
  const encodeWasmModule = await importWasmModule(
    'node_modules/@jsquash/avif/codec/enc/avif_enc_simd.wasm',
  );
  await initEncode(encodeWasmModule);
  const data = await encode(
    {
      data: new Uint16Array(4 * 50 * 50),
      height: 50,
      width: 50,
    },
    {
      bitDepth: 12,
    },
  );
  t.assert(data instanceof ArrayBuffer);
});

test('throws error when encoding 10-bit image with non-Uint16Array data', async (t) => {
  const encodeWasmModule = await importWasmModule(
    'node_modules/@jsquash/avif/codec/enc/avif_enc_simd.wasm',
  );
  await initEncode(encodeWasmModule);
  const error = await t.throwsAsync(() =>
    // @ts-expect-error - we're testing incorrect data type
    encode(
      {
        data: new Uint8ClampedArray(4 * 50 * 50),
        height: 50,
        width: 50,
        colorSpace: 'srgb' as const,
      },
      { bitDepth: 10 },
    ),
  );
  if (!error) {
    t.fail('Expected error to be thrown');
    return;
  }

  t.is(
    error.message,
    'Invalid image data for bit depth. Must use Uint16Array for bit depths greater than 8.',
  );
});

test('throws error when encoding 12-bit image with non-Uint16Array data', async (t) => {
  const encodeWasmModule = await importWasmModule(
    'node_modules/@jsquash/avif/codec/enc/avif_enc_simd.wasm',
  );
  await initEncode(encodeWasmModule);
  const error = await t.throwsAsync(() =>
    // @ts-expect-error - we're testing incorrect data type
    encode(
      {
        data: new Uint8ClampedArray(4 * 50 * 50),
        height: 50,
        width: 50,
        colorSpace: 'srgb' as const,
      },
      { bitDepth: 12 },
    ),
  );
  if (!error) {
    t.fail('Expected error to be thrown');
    return;
  }
  t.is(
    error.message,
    'Invalid image data for bit depth. Must use Uint16Array for bit depths greater than 8.',
  );
});

test('can successfully encode and decode lossless image', async (t) => {
  const [encodeWasmModule, decodeWasmModule] = await Promise.all([
    importWasmModule('node_modules/@jsquash/avif/codec/enc/avif_enc_simd.wasm'),
    importWasmModule('node_modules/@jsquash/avif/codec/dec/avif_dec.wasm'),
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
    importWasmModule('node_modules/@jsquash/avif/codec/enc/avif_enc_simd.wasm'),
    importWasmModule('node_modules/@jsquash/avif/codec/dec/avif_dec.wasm'),
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

test('encodes lossless (YUV444) even with conflicting subsample option', async (t) => {
  const [encodeWasmModule, decodeWasmModule] = await Promise.all([
    importWasmModule('node_modules/@jsquash/avif/codec/enc/avif_enc_simd.wasm'),
    importWasmModule('node_modules/@jsquash/avif/codec/dec/avif_dec.wasm'),
  ]);
  await initEncode(encodeWasmModule);
  initDecode(decodeWasmModule);

  const originalImageData = {
    width: 8,
    height: 8,
    data: new Uint8ClampedArray(4 * 8 * 8),
    colorSpace: 'srgb' as const,
  };
  // Create specific colors to check subsampling didn't occur
  for (let i = 0; i < originalImageData.data.length; i += 4) {
    originalImageData.data[i] = i % 256; // R
    originalImageData.data[i + 1] = (i + 64) % 256; // G
    originalImageData.data[i + 2] = (i + 128) % 256; // B
    originalImageData.data[i + 3] = 255; // A
  }

  // Encode with lossless true but also a chroma-subsampled setting
  const encodedData = await encode(originalImageData, {
    lossless: true,
    subsample: 1,
  }); // subsample: 1 is YUV422
  t.assert(encodedData instanceof ArrayBuffer);

  const decodedData = await decode(encodedData);
  if (!decodedData) {
    t.fail('Failed to decode image');
    return;
  }

  t.deepEqual(
    decodedData.data,
    originalImageData.data,
    'Decoded data should match original even with conflicting subsample option',
  );
});

// The single-variant entry point holds its own module, so it has to be given
// the wasm separately from encode.js - Node cannot fetch() a file: URL.
test('encode-simd.js encodes and round-trips through the decoder', async (t) => {
  const [encodeWasmModule, decodeWasmModule] = await Promise.all([
    importWasmModule('node_modules/@jsquash/avif/codec/enc/avif_enc_simd.wasm'),
    importWasmModule('node_modules/@jsquash/avif/codec/dec/avif_dec.wasm'),
  ]);
  await initEncodeSimd(encodeWasmModule);
  initDecode(decodeWasmModule);

  const originalImageData = {
    width: 16,
    height: 16,
    data: new Uint8ClampedArray(4 * 16 * 16),
    colorSpace: 'srgb' as const,
  };
  for (let i = 0; i < originalImageData.data.length; i += 4) {
    originalImageData.data[i] = i % 256; // R
    originalImageData.data[i + 1] = (i + 64) % 256; // G
    originalImageData.data[i + 2] = (i + 128) % 256; // B
    originalImageData.data[i + 3] = 255; // A
  }

  // Lossless so the round trip can be asserted exactly.
  const encodedData = await encodeSimd(originalImageData, { lossless: true });
  t.assert(encodedData instanceof ArrayBuffer);

  const decodedData = decoded(await decode(encodedData));
  t.is(decodedData.width, originalImageData.width);
  t.is(decodedData.height, originalImageData.height);
  t.deepEqual(
    decodedData.data,
    originalImageData.data,
    'Decoded data should match what encode-simd.js produced',
  );
});

test('throws error for invalid bitDepth setting', async (t) => {
  const encodeWasmModule = await importWasmModule(
    'node_modules/@jsquash/avif/codec/enc/avif_enc_simd.wasm',
  );
  await initEncode(encodeWasmModule);

  const imageData = {
    data: new Uint8ClampedArray(4 * 10 * 10),
    height: 10,
    width: 10,
    colorSpace: 'srgb' as const,
  };

  // @ts-expect-error - we're testing incorrect bit depth
  const error = await t.throwsAsync(() => encode(imageData, { bitDepth: 9 }));
  if (!error) {
    t.fail('Expected error to be thrown');
    return;
  }
  t.is(error.message, 'Invalid bit depth. Supported values are 8, 10, or 12.');
});

test('an ICC profile survives an encode/decode round trip byte for byte', async (t) => {
  const [icc, encodeWasmModule, decodeWasmModule] = await Promise.all([
    displayP3Profile(),
    importWasmModule(AVIF_ENC_WASM),
    importWasmModule(AVIF_DEC_WASM),
  ]);
  await initEncode(encodeWasmModule);
  initDecode(decodeWasmModule);

  t.is(signatureOf(icc), 'acsp');

  const encoded = await encode(solidImage(), { icc });
  t.assert(encoded instanceof ArrayBuffer);

  const roundTripped = await readIccProfile(encoded);
  t.deepEqual(
    Array.from(roundTripped!),
    Array.from(icc),
    'the profile should come back unchanged',
  );
});

test('encode writes no profile when none is supplied', async (t) => {
  const [encodeWasmModule, decodeWasmModule] = await Promise.all([
    importWasmModule(AVIF_ENC_WASM),
    importWasmModule(AVIF_DEC_WASM),
  ]);
  await initEncode(encodeWasmModule);
  initDecode(decodeWasmModule);

  const encoded = await encode(solidImage());

  t.is(await readIccProfile(encoded), undefined);

  const { metadata } = await decodeWithMetadata(encoded);
  t.is(metadata.icc, undefined);
  t.is(metadata.exif, undefined);
});

test('decodeWithMetadata returns the image alongside its profile', async (t) => {
  const [icc, encodeWasmModule, decodeWasmModule] = await Promise.all([
    displayP3Profile(),
    importWasmModule(AVIF_ENC_WASM),
    importWasmModule(AVIF_DEC_WASM),
  ]);
  await initEncode(encodeWasmModule);
  initDecode(decodeWasmModule);

  const original = solidImage();
  const encoded = await encode(original, { icc, lossless: true });

  const { image, metadata } = await decodeWithMetadata(encoded);
  t.is(image.width, original.width);
  t.is(image.height, original.height);
  t.deepEqual(
    image.data,
    original.data,
    'the pixels are passed through untouched, not converted',
  );

  t.assert(metadata.icc instanceof Uint8Array);
  t.is(metadata.icc?.byteLength, icc.byteLength);
  t.is(signatureOf(metadata.icc!), 'acsp');
});

// The >8-bit path returns a plain object rather than a real ImageData, so the
// wrapper shape has to be applied to both.
test('a profile round trips on the 10-bit path', async (t) => {
  const [icc, encodeWasmModule, decodeWasmModule] = await Promise.all([
    displayP3Profile(),
    importWasmModule(AVIF_ENC_WASM),
    importWasmModule(AVIF_DEC_WASM),
  ]);
  await initEncode(encodeWasmModule);
  initDecode(decodeWasmModule);

  const encoded = await encode(
    { data: new Uint16Array(4 * 16 * 16), width: 16, height: 16 },
    { bitDepth: 10, icc },
  );

  const { image, metadata } = await decodeWithMetadata(encoded, {
    bitDepth: 10,
  });
  t.is(image.width, 16);
  t.is(image.height, 16);
  t.assert(image.data instanceof Uint16Array);
  t.deepEqual(Array.from(metadata.icc!), Array.from(icc));
});

test('readIccProfile returns undefined for a file with no profile', async (t) => {
  const [testImage, decodeWasmModule] = await Promise.all([
    getFixturesImage('test.avif'),
    importWasmModule(AVIF_DEC_WASM),
  ]);
  initDecode(decodeWasmModule);

  t.is(await readIccProfile(testImage), undefined);
});

// Metadata is advisory on read, but a bad profile on encode is a caller error,
// so it throws eagerly rather than writing something unusable.
test('encode rejects data that is not an ICC profile', async (t) => {
  const encodeWasmModule = await importWasmModule(AVIF_ENC_WASM);
  await initEncode(encodeWasmModule);

  const tooShort = await t.throwsAsync(() =>
    encode(solidImage(), { icc: new Uint8Array(16) }),
  );
  t.is(
    tooShort?.message,
    'Invalid ICC profile. Expected at least 132 bytes, got 16.',
  );

  // Long enough, but without the signature every ICC profile must carry.
  const noSignature = await t.throwsAsync(() =>
    encode(solidImage(), { icc: new Uint8Array(200) }),
  );
  t.is(
    noSignature?.message,
    'Invalid ICC profile. Expected an "acsp" signature at byte 36, got "\0\0\0\0".',
  );
});

test('encode accepts a profile supplied as a plain ArrayBuffer', async (t) => {
  const [icc, encodeWasmModule, decodeWasmModule] = await Promise.all([
    displayP3Profile(),
    importWasmModule(AVIF_ENC_WASM),
    importWasmModule(AVIF_DEC_WASM),
  ]);
  await initEncode(encodeWasmModule);
  initDecode(decodeWasmModule);

  const encoded = await encode(solidImage(), { icc: icc.slice().buffer });
  t.is((await readIccProfile(encoded))?.byteLength, icc.byteLength);
});
