/**
 * The encoder, minus the decision about which build to run it on.
 *
 * `encode.js` picks a build at runtime, which is the right default but means
 * a bundler sees every variant and emits every `.wasm` - including the 3.3 MB
 * threaded build, which cannot load at all unless the page is cross-origin
 * isolated. The `encode-simd.js`, `encode-mt.js` and `encode-scalar.js` entry
 * points bind one build statically instead, so an application that already
 * knows its target pays for one binary. Both routes share this implementation
 * so they cannot drift apart.
 */
import type { AVIFModule } from './codec/enc/avif_enc.js';
import type { EncodeOptions, ImageData16bit } from './meta.js';

import { defaultOptions } from './meta.js';
import { disposeEmscriptenModule, initEmscriptenModule } from './utils.js';

/** Resolves the Emscripten factory for whichever build was selected. */
export type CodecLoader = () => Promise<
  EmscriptenWasm.ModuleFactory<AVIFModule>
>;

export function createEncoder(loadCodec: CodecLoader) {
  let emscriptenModule: Promise<AVIFModule> | undefined;

  function init(
    module?: WebAssembly.Module | Partial<EmscriptenWasm.ModuleOpts>,
    moduleOptionOverrides?: Partial<EmscriptenWasm.ModuleOpts>,
  ): Promise<AVIFModule> {
    let actualModule =
      module instanceof WebAssembly.Module ? module : undefined;
    let actualOptions = moduleOptionOverrides;

    // If only one argument is provided and it's not a WebAssembly.Module
    if (arguments.length === 1 && !(module instanceof WebAssembly.Module)) {
      actualOptions = module as Partial<EmscriptenWasm.ModuleOpts>;
    }

    // Assign synchronously, before the first await. Callers are documented to
    // be able to fire init(module) without awaiting it, and two concurrent
    // calls must share one module rather than each building their own - both
    // of which stop working the moment this function awaits before assigning.
    emscriptenModule = (async () =>
      initEmscriptenModule(await loadCodec(), actualModule, actualOptions))();

    return emscriptenModule;
  }

  /**
   * Release the module so its WebAssembly.Memory can be garbage collected.
   *
   * Emscripten heaps grow but never shrink, so a long-lived worker that has
   * encoded a single large image holds that peak allocation for the rest of
   * its life. The next call re-instantiates the module on demand.
   */
  function dispose(): void {
    const pending = emscriptenModule;
    emscriptenModule = undefined;
    disposeEmscriptenModule(pending);
  }

  function encode(data: ImageData): Promise<ArrayBuffer>;
  function encode(
    data: ImageData,
    options: Partial<EncodeOptions> & { bitDepth?: 8 },
  ): Promise<ArrayBuffer>;
  function encode(
    data: ImageData16bit,
    options: Partial<EncodeOptions> & { bitDepth: 10 | 12 },
  ): Promise<ArrayBuffer>;
  async function encode(
    data: ImageData | ImageData16bit,
    options: Partial<EncodeOptions> = {},
  ): Promise<ArrayBuffer> {
    if (!emscriptenModule) emscriptenModule = init();
    const _options = { ...defaultOptions, ...options };

    if (
      _options.bitDepth !== 8 &&
      _options.bitDepth !== 10 &&
      _options.bitDepth !== 12
    ) {
      throw new Error('Invalid bit depth. Supported values are 8, 10, or 12.');
    }

    if (!(data.data instanceof Uint16Array) && _options.bitDepth !== 8) {
      throw new Error(
        'Invalid image data for bit depth. Must use Uint16Array for bit depths greater than 8.',
      );
    }

    if (_options.lossless) {
      if (options.quality !== undefined && options.quality !== 100) {
        console.warn(
          'AVIF lossless: Quality setting is ignored when lossless is enabled (quality must be 100).',
        );
      }
      if (
        options.qualityAlpha !== undefined &&
        options.qualityAlpha !== 100 &&
        options.qualityAlpha !== -1
      ) {
        console.warn(
          'AVIF lossless: QualityAlpha setting is ignored when lossless is enabled (qualityAlpha must be 100 or -1).',
        );
      }
      if (options.subsample !== undefined && options.subsample !== 3) {
        console.warn(
          'AVIF lossless: Subsample setting is ignored when lossless is enabled (subsample must be 3 for YUV444).',
        );
      }

      _options.quality = 100;
      _options.qualityAlpha = -1;
      _options.subsample = 3;
    }

    const module = await emscriptenModule;
    const output = module.encode(
      // `data` may be a view into a larger buffer, so the offset and length
      // have to be carried across rather than reading `.buffer` wholesale.
      new Uint8Array(
        data.data.buffer,
        data.data.byteOffset,
        data.data.byteLength,
      ),
      data.width,
      data.height,
      _options,
    );

    if (!output) {
      throw new Error('Encoding error.');
    }

    return output.buffer;
  }

  return { init, dispose, encode };
}
