/**
 * The decoder, minus the decision about which build to run it on.
 * See `encode-core.ts` for why this split exists.
 */
import type { JXLModule } from './codec/dec/jxl_dec.js';
import type { DecodedImage, ImageMetadata } from './meta.js';

import { disposeEmscriptenModule, initEmscriptenModule } from './utils.js';

export type CodecLoader = () => Promise<
  EmscriptenWasm.ModuleFactory<JXLModule>
>;

export function createDecoder(loadCodec: CodecLoader) {
  let emscriptenModule: Promise<JXLModule> | undefined;

  function init(
    module?: WebAssembly.Module | Partial<EmscriptenWasm.ModuleOpts>,
    moduleOptionOverrides?: Partial<EmscriptenWasm.ModuleOpts>,
  ): Promise<JXLModule> {
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

  async function decode(buffer: ArrayBuffer): Promise<ImageData> {
    if (!emscriptenModule) emscriptenModule = init();

    const module = await emscriptenModule;
    const result = module.decode(buffer);
    if (!result) throw new Error('Decoding error');
    return result;
  }

  /**
   * Decode an image and return it together with its metadata.
   *
   * Separate from `decode` rather than an option on it because it returns
   * something else; see the same note on `@jsquash/png`'s decoder.
   *
   * **`metadata.icc` describes the pixels, not the file.** JXL's decoder
   * converts to sRGB on the way out - libjxl produces the image in whatever
   * space it picked and skcms transforms it before it crosses the wasm
   * boundary - so the profile reported here is sRGB, which is what the
   * returned pixels are actually in. Tagging them with the source profile
   * would be worse than tagging them with nothing. Use `readIccProfile` to
   * find out what space the file itself declares.
   */
  async function decodeWithMetadata(
    buffer: ArrayBuffer,
  ): Promise<DecodedImage<ImageData>> {
    if (!emscriptenModule) emscriptenModule = init();

    const module = await emscriptenModule;
    const result = module.decode_with_metadata(buffer);
    if (!result) throw new Error('Decoding error');

    const metadata: ImageMetadata = {};
    if (result.icc && result.icc.length > 0) metadata.icc = result.icc;

    return { image: result.image, metadata };
  }

  /**
   * Read the ICC profile the file declares, without decoding any pixels.
   *
   * This is the *source* profile - the space the image was authored in - and
   * is deliberately not what `decodeWithMetadata` reports, because `decode`
   * does not return pixels in this space. It is the honest answer to "what
   * colour space is this file in?", and because it never travels attached to
   * pixels it cannot mislabel any.
   *
   * Returns `undefined` when the image declares no profile, or when it is
   * there but unreadable: metadata is advisory and never fails an image whose
   * pixels are perfectly good.
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
