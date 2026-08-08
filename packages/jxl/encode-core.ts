/**
 * The encoder, minus the decision about which build to run it on.
 *
 * `encode.js` picks a build at runtime, which is the right default but means
 * a bundler sees every variant and emits every `.wasm`. The `encode-simd.js`,
 * `encode-mt.js` and `encode-scalar.js` entry points bind one build statically
 * instead, so an application that already knows its target pays for one
 * binary. That matters more here than anywhere else in this repo: JXL ships
 * four encoder builds totalling over 6 MB of wasm, half of which cannot even
 * load unless the page is cross-origin isolated. Both routes share this
 * implementation so they cannot drift apart.
 */
import type { EncodeOptions } from './meta.js';
import type { JXLModule } from './codec/enc/jxl_enc.js';

import { defaultOptions } from './meta.js';
import { disposeEmscriptenModule, initEmscriptenModule } from './utils.js';

/** Resolves the Emscripten factory for whichever build was selected. */
export type CodecLoader = () => Promise<
  EmscriptenWasm.ModuleFactory<JXLModule>
>;

export function createEncoder(loadCodec: CodecLoader) {
  let emscriptenModule: Promise<JXLModule> | undefined;

  function init(
    module?: WebAssembly.Module | Partial<EmscriptenWasm.ModuleOpts>,
    moduleOptionOverrides?: Partial<EmscriptenWasm.ModuleOpts>,
  ): Promise<JXLModule> {
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

  async function encode(
    data: ImageData,
    options: Partial<EncodeOptions> = {},
  ): Promise<ArrayBuffer> {
    if (!emscriptenModule) emscriptenModule = init();

    const module = await emscriptenModule;
    const _options = { ...defaultOptions, ...options };

    if (_options.lossless) {
      if (options.quality !== undefined && options.quality !== 100) {
        console.warn(
          'JXL lossless: Quality setting is ignored when lossless is enabled (quality must be 100).',
        );
      }

      if (options.lossyModular) {
        console.warn(
          'JXL lossless: LossyModular setting is ignored when lossless is enabled (lossyModular must be false).',
        );
      }

      if (options.lossyPalette) {
        console.warn(
          'JXL lossless: LossyPalette setting is ignored when lossless is enabled (lossyPalette must be false).',
        );
      }

      _options.quality = 100;
      _options.lossyModular = false;
      _options.lossyPalette = false;
    }

    const resultView = module.encode(
      data.data,
      data.width,
      data.height,
      _options,
    );
    if (!resultView) {
      throw new Error('Encoding error.');
    }

    return resultView.buffer as ArrayBuffer;
  }

  return { init, dispose, encode };
}
