/**
 * The decoder, minus the decision about which build to run it on.
 * See `encode-core.ts` for why this split exists.
 */
import type { AVIFModule } from './codec/dec/avif_dec.js';
import type { DecodedImage, ImageData16bit, ImageMetadata } from './meta.js';

import { disposeEmscriptenModule, initEmscriptenModule } from './utils.js';

export type CodecLoader = () => Promise<
  EmscriptenWasm.ModuleFactory<AVIFModule>
>;

type DecodeOptions = {
  bitDepth?: 8 | 10 | 12 | 16;
};

export function createDecoder(loadCodec: CodecLoader) {
  let emscriptenModule: Promise<AVIFModule> | undefined;

  function init(
    module?: WebAssembly.Module | Partial<EmscriptenWasm.ModuleOpts>,
    moduleOptionOverrides?: Partial<EmscriptenWasm.ModuleOpts>,
  ): Promise<AVIFModule> {
    let actualModule =
      module instanceof WebAssembly.Module ? module : undefined;
    let actualOptions = moduleOptionOverrides;

    if (arguments.length === 1 && !(module instanceof WebAssembly.Module)) {
      actualOptions = module as Partial<EmscriptenWasm.ModuleOpts>;
    }

    // Assigned synchronously; see the note in encode-core.ts.
    emscriptenModule = (async () =>
      initEmscriptenModule(await loadCodec(), actualModule, actualOptions))();

    return emscriptenModule;
  }

  /** See the note on the encoder's dispose(). */
  function dispose(): void {
    const pending = emscriptenModule;
    emscriptenModule = undefined;
    disposeEmscriptenModule(pending);
  }

  function decode(buffer: ArrayBuffer): Promise<ImageData | null>;
  function decode(
    buffer: ArrayBuffer,
    options: { bitDepth?: 8 },
  ): Promise<ImageData | null>;
  function decode(
    buffer: ArrayBuffer,
    options: { bitDepth: 10 | 12 | 16 },
  ): Promise<ImageData16bit | null>;
  async function decode(
    buffer: ArrayBuffer,
    options?: DecodeOptions,
  ): Promise<ImageData | ImageData16bit | null> {
    if (!emscriptenModule) emscriptenModule = init();

    const module = await emscriptenModule;
    const bitDepth = options?.bitDepth ?? 8;
    const result = module.decode(buffer, bitDepth);
    if (!result) throw new Error('Decoding error');
    return result;
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
  async function decodeWithMetadata(
    buffer: ArrayBuffer,
    options?: DecodeOptions,
  ): Promise<DecodedImage<ImageData | ImageData16bit>> {
    if (!emscriptenModule) emscriptenModule = init();

    const module = await emscriptenModule;
    const bitDepth = options?.bitDepth ?? 8;

    const image = module.decode(buffer, bitDepth);
    if (!image) throw new Error('Decoding error');

    // A second pass over the same input, which parses the container's boxes
    // rather than decoding anything. That costs one more copy of the
    // *compressed* bytes across the wasm boundary and buys a pixel path that
    // is untouched for callers who never ask for metadata.
    const icc = module.read_icc_profile(buffer);

    const metadata: ImageMetadata = {};
    if (icc && icc.length > 0) metadata.icc = icc;

    return { image, metadata };
  }

  /**
   * Read an image's ICC profile without decoding any pixels.
   *
   * Returns `undefined` when the image carries no profile, or when the profile
   * is there but unreadable - metadata is advisory, and a file whose pixels
   * decode perfectly well should not fail over it.
   */
  async function readIccProfile(
    buffer: ArrayBuffer,
  ): Promise<Uint8Array | undefined> {
    if (!emscriptenModule) emscriptenModule = init();

    const module = await emscriptenModule;
    const icc = module.read_icc_profile(buffer);
    return icc && icc.length > 0 ? icc : undefined;
  }

  return { init, dispose, decode, decodeWithMetadata, readIccProfile };
}
