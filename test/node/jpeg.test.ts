import test from 'ava';
import { importWasmModule, getFixturesImage } from './utils.js';

import decode, {
  decodeWithMetadata,
  readIccProfile,
  init as initDecode,
  dispose as disposeDecode,
} from '@jsquash/jpeg/decode.js';
import encode, { init as initEncode } from '@jsquash/jpeg/encode.js';

import { decodeWithMetadata as decodePngWithMetadata } from '@jsquash/png/decode.js';
import { init as initPngDecode } from '@jsquash/png/decode.js';

const DEC_WASM = 'node_modules/@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm';
const ENC_WASM = 'node_modules/@jsquash/jpeg/codec/enc/mozjpeg_enc.wasm';
const PNG_WASM = 'node_modules/@jsquash/png/codec/pkg/squoosh_png_bg.wasm';

const signatureOf = (icc: Uint8Array) =>
  String.fromCharCode(...icc.subarray(36, 40));

/**
 * The only real ICC profile in the fixtures lives in a PNG, so it is borrowed
 * from there. That it crosses formats is the point: the metadata shape is meant
 * to be canonical, so a profile read from one codec should be accepted by
 * another's encoder unchanged.
 */
async function borrowIccProfile(): Promise<Uint8Array> {
  const [pngImage, pngWasm] = await Promise.all([
    getFixturesImage('test-icc-profile.png'),
    importWasmModule(PNG_WASM),
  ]);
  await initPngDecode(pngWasm);
  const { metadata } = await decodePngWithMetadata(pngImage);
  if (!metadata.icc) throw new Error('fixture lost its ICC profile');
  return metadata.icc;
}

/** Walk the JPEG marker segments, so tests can assert on the bytes we emit. */
function findApp2Icc(jpeg: ArrayBuffer): Uint8Array | undefined {
  const bytes = new Uint8Array(jpeg);
  let offset = 2; // skip SOI
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) return undefined;
    const marker = bytes[offset + 1];
    if (marker === 0xda) return undefined; // start of scan; no more metadata
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (marker === 0xe2) {
      return bytes.subarray(offset + 4, offset + 2 + length);
    }
    offset += 2 + length;
  }
  return undefined;
}

test('can successfully decode image', async (t) => {
  const [testImage, decodeWasmModule] = await Promise.all([
    getFixturesImage('test.jpeg'),
    importWasmModule('node_modules/@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm'),
  ]);
  initDecode(decodeWasmModule);
  const data = await decode(testImage);
  t.is(data.width, 50);
  t.is(data.height, 50);
  t.is(data.data.length, 4 * 50 * 50);
});

test('should decode pixel data orientation as is by default', async (t) => {
  const [testImage, decodeWasmModule] = await Promise.all([
    getFixturesImage('exif-rotated-270.jpeg'),
    importWasmModule('node_modules/@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm'),
  ]);
  initDecode(decodeWasmModule);
  const data = await decode(testImage);
  t.is(data.width, 100);
  t.is(data.height, 30);
  t.is(data.data.length, 4 * 100 * 30);
  // First pixel should be red
  t.is(data.data[0], 254);
  t.is(data.data[1], 0);
  t.is(data.data[2], 0);
});

test('should decode pixel data in respect to orientation when preserveOrientation is true', async (t) => {
  const [testImage, decodeWasmModule] = await Promise.all([
    getFixturesImage('exif-rotated-270.jpeg'),
    importWasmModule('node_modules/@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm'),
  ]);
  initDecode(decodeWasmModule);
  const data = await decode(testImage, { preserveOrientation: true });
  t.is(data.width, 30);
  t.is(data.height, 100);
  t.is(data.data.length, 4 * 30 * 100);
  // First pixel should be green
  t.is(data.data[0], 0);
  t.is(data.data[1], 255);
  t.is(data.data[2], 1);
});

test('[regression] should correctly decode pixel data for jpeg with orientation 6 (90° CW)', async (t) => {
  const [testImage, decodeWasmModule] = await Promise.all([
    getFixturesImage('exif-rotated-90.jpeg'),
    importWasmModule('node_modules/@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm'),
  ]);
  initDecode(decodeWasmModule);
  const data = await decode(testImage, { preserveOrientation: true });
  t.is(data.width, 30);
  t.is(data.height, 100);
  t.is(data.data.length, 4 * 30 * 100);
  // First pixel should be red
  t.is(data.data[0], 254);
  t.is(data.data[1], 0);
  t.is(data.data[2], 0);
});

test('can successfully encode image', async (t) => {
  const encodeWasmModule = await importWasmModule(
    'node_modules/@jsquash/jpeg/codec/enc/mozjpeg_enc.wasm',
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

test('an ICC profile survives an encode/decode round trip byte for byte', async (t) => {
  const [icc, encodeWasmModule, decodeWasmModule] = await Promise.all([
    borrowIccProfile(),
    importWasmModule(ENC_WASM),
    importWasmModule(DEC_WASM),
  ]);
  await initEncode(encodeWasmModule);
  await initDecode(decodeWasmModule);

  const encoded = await encode(
    {
      data: new Uint8ClampedArray(4 * 50 * 50),
      height: 50,
      width: 50,
      colorSpace: 'srgb' as const,
    },
    { icc },
  );

  t.assert(encoded instanceof ArrayBuffer);
  t.assert(findApp2Icc(encoded) !== undefined, 'expected an APP2 marker');

  const { metadata } = await decodeWithMetadata(encoded);
  t.assert(metadata.icc instanceof Uint8Array);
  t.is(metadata.icc?.byteLength, icc.byteLength);
  t.is(signatureOf(metadata.icc!), 'acsp');
  t.deepEqual(
    Array.from(metadata.icc!),
    Array.from(icc),
    'the profile should come back unchanged',
  );

  // And without decoding any pixels.
  t.deepEqual(Array.from((await readIccProfile(encoded))!), Array.from(icc));
});

test('encode writes no ICC profile when none is supplied', async (t) => {
  const [encodeWasmModule, decodeWasmModule] = await Promise.all([
    importWasmModule(ENC_WASM),
    importWasmModule(DEC_WASM),
  ]);
  await initEncode(encodeWasmModule);
  await initDecode(decodeWasmModule);

  const encoded = await encode({
    data: new Uint8ClampedArray(4 * 50 * 50),
    height: 50,
    width: 50,
    colorSpace: 'srgb' as const,
  });

  t.is(findApp2Icc(encoded), undefined, 'expected no APP2 marker');
  t.is(await readIccProfile(encoded), undefined);

  const { metadata } = await decodeWithMetadata(encoded);
  t.is(metadata.icc, undefined);
  t.is(metadata.exif, undefined);
});

test('encode accepts a profile as a plain ArrayBuffer', async (t) => {
  const [icc, encodeWasmModule, decodeWasmModule] = await Promise.all([
    borrowIccProfile(),
    importWasmModule(ENC_WASM),
    importWasmModule(DEC_WASM),
  ]);
  await initEncode(encodeWasmModule);
  await initDecode(decodeWasmModule);

  const encoded = await encode(
    {
      data: new Uint8ClampedArray(4 * 50 * 50),
      height: 50,
      width: 50,
      colorSpace: 'srgb' as const,
    },
    { icc: icc.slice().buffer },
  );

  t.is((await readIccProfile(encoded))?.byteLength, icc.byteLength);
});

test('encode rejects data that is not an ICC profile', async (t) => {
  const encodeWasmModule = await importWasmModule(ENC_WASM);
  await initEncode(encodeWasmModule);

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

test('readIccProfile is advisory and never throws', async (t) => {
  const [plainJpeg, decodeWasmModule] = await Promise.all([
    getFixturesImage('test.jpeg'),
    importWasmModule(DEC_WASM),
  ]);
  await initDecode(decodeWasmModule);

  // A JPEG that simply carries no profile.
  t.is(await readIccProfile(plainJpeg), undefined);

  // Input that is not a JPEG at all. libjpeg's default error handler would
  // exit() here and take the whole wasm module with it.
  t.is(await readIccProfile(new Uint8Array([1, 2, 3, 4]).buffer), undefined);

  // Truncated to the SOI marker and nothing else.
  t.is(await readIccProfile(plainJpeg.slice(0, 2)), undefined);

  // The module must still be usable afterwards.
  const data = await decode(plainJpeg);
  t.is(data.width, 50);
});

test('decodeWithMetadata surfaces raw EXIF and still decodes pixels', async (t) => {
  const [testImage, decodeWasmModule] = await Promise.all([
    getFixturesImage('exif-rotated-90.jpeg'),
    importWasmModule(DEC_WASM),
  ]);
  await initDecode(decodeWasmModule);

  const { image, metadata } = await decodeWithMetadata(testImage, {
    preserveOrientation: true,
  });

  // Same pixels the orientation tests assert on.
  t.is(image.width, 30);
  t.is(image.height, 100);
  t.is(image.data[0], 254);
  t.is(image.data[1], 0);
  t.is(image.data[2], 0);

  // The payload starts at the TIFF header, with JPEG's "Exif\0\0" stripped.
  t.assert(metadata.exif instanceof Uint8Array);
  const byteOrder = String.fromCharCode(...metadata.exif!.subarray(0, 2));
  t.assert(byteOrder === 'II' || byteOrder === 'MM', 'expected a TIFF header');
  t.is(metadata.icc, undefined);
});

test.serial(
  'decode survives dispose() without being re-initialised',
  async (t) => {
    const [testImage, wasm] = await Promise.all([
      getFixturesImage('test.jpeg'),
      importWasmModule(DEC_WASM),
    ]);

    // A locateFile that resolves to nothing: reaching it at all means the
    // module handed to init() was not kept, and the re-instantiation fell back
    // to fetching the binary - which is what a Cloudflare Worker cannot do.
    await initDecode(wasm, {
      locateFile: () => '/jsquash-should-never-fetch-this.wasm',
    });
    const before = await decode(testImage);

    disposeDecode();

    const after = await decode(testImage);
    t.deepEqual(after.data, before.data, 'decodes again after dispose()');
  },
);
