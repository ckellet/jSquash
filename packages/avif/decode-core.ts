/**
 * The decoder, minus the decision about which build to run it on.
 * See `encode-core.ts` for why this split exists.
 */
import type { AVIFModule } from './codec/dec/avif_dec.js';
import type { DecodedImage, ImageData16bit, ImageMetadata } from './meta.js';

import { createModuleCache } from './utils.js';

export type CodecLoader = () => Promise<
  EmscriptenWasm.ModuleFactory<AVIFModule>
>;

type DecodeOptions = {
  bitDepth?: 8 | 10 | 12 | 16;
};

export function createDecoder(loadCodec: CodecLoader) {
  const codecModule = createModuleCache<AVIFModule>(loadCodec);

  /**
   * Instantiate the module up front, optionally from wasm you supply.
   *
   * The module and options are remembered, so a `dispose()` and the
   * re-instantiation that follows it stay on the same binary.
   */
  const init = codecModule.init;

  /** See the note on the encoder's dispose(). */
  const dispose = codecModule.dispose;

  /**
   * Decode an image.
   *
   * Throws on anything it cannot decode, as every other codec in the library
   * does; it never resolves to a missing image.
   */
  function decode(buffer: ArrayBuffer): Promise<ImageData>;
  function decode(
    buffer: ArrayBuffer,
    options: { bitDepth?: 8 },
  ): Promise<ImageData>;
  function decode(
    buffer: ArrayBuffer,
    options: { bitDepth: 10 | 12 | 16 },
  ): Promise<ImageData16bit>;
  function decode(
    buffer: ArrayBuffer,
    options?: DecodeOptions,
  ): Promise<ImageData | ImageData16bit> {
    const bitDepth = options?.bitDepth ?? 8;

    return codecModule.use((codec) => {
      const result = codec.decode(buffer, bitDepth);
      if (!result) throw new Error('Decoding error');
      return result;
    });
  }

  /**
   * Decode an image and return it together with its embedded metadata.
   *
   * Separate from `decode` rather than an option on it because it returns
   * something else. Switching a return type on a flag makes the common call -
   * `const image = await decode(buf)` - depend on a value TypeScript can only
   * narrow when the flag is a literal, so anyone building an options object
   * dynamically ends up with a union to unpick. `decode` stays exactly as it
   * was, and callers who want metadata reach for a different name.
   *
   * The wrapper shape is the same whichever bit depth is asked for, even though
   * `decode` itself returns a real `ImageData` at 8 bits and a plain object
   * above it.
   *
   * The ICC profile is the only metadata surfaced today; `metadata.exif` is
   * always absent. See `docs/colour-management.md`.
   */
  function decodeWithMetadata(
    buffer: ArrayBuffer,
  ): Promise<DecodedImage<ImageData>>;
  function decodeWithMetadata(
    buffer: ArrayBuffer,
    options: { bitDepth?: 8 },
  ): Promise<DecodedImage<ImageData>>;
  function decodeWithMetadata(
    buffer: ArrayBuffer,
    options: { bitDepth: 10 | 12 | 16 },
  ): Promise<DecodedImage<ImageData16bit>>;
  function decodeWithMetadata(
    buffer: ArrayBuffer,
    options?: DecodeOptions,
  ): Promise<DecodedImage<ImageData | ImageData16bit>> {
    const bitDepth = options?.bitDepth ?? 8;

    return codecModule.use((codec) => {
      const image = codec.decode(buffer, bitDepth);
      if (!image) throw new Error('Decoding error');

      // A second pass over the same input, which parses the container's boxes
      // rather than decoding anything. That costs one more copy of the
      // *compressed* bytes across the wasm boundary and buys a pixel path that
      // is untouched for callers who never ask for metadata.
      const icc = codec.read_icc_profile(buffer);

      const metadata: ImageMetadata = {};
      if (icc && icc.length > 0) metadata.icc = icc;

      return { image, metadata };
    });
  }

  /**
   * Read an image's ICC profile without decoding any pixels.
   *
   * Returns `undefined` when the image carries no profile, or when the profile
   * is there but unreadable - metadata is advisory, and a file whose pixels
   * decode perfectly well should not fail over it.
   */
  function readIccProfile(
    buffer: ArrayBuffer,
  ): Promise<Uint8Array | undefined> {
    return codecModule.use((codec) => {
      const icc = codec.read_icc_profile(buffer);
      return icc && icc.length > 0 ? icc : undefined;
    });
  }

  return { init, dispose, decode, decodeWithMetadata, readIccProfile };
}
