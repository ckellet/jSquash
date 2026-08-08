/**
 * The encoder, minus the decision about which build to run it on.
 *
 * `encode.js` picks a build at runtime, which is the right default but means
 * a bundler sees every variant and emits every `.wasm`. The `encode-simd.js`,
 * `encode-scalar.js` entry points bind one build statically instead, so an
 * application that already knows its target pays for one binary. Both routes
 * share this implementation so they cannot drift apart.
 */
import type { WebPModule } from './codec/enc/webp_enc.js';
import type { EncodeOptions, WebPEncodeOptions } from './meta.js';

import { defaultOptions, toIccProfileBytes } from './meta.js';
import {
  disposeEmscriptenModule,
  initEmscriptenModule,
  withPixelBuffer,
} from './utils.js';

/** Resolves the Emscripten factory for whichever build was selected. */
export type CodecLoader = () => Promise<
  EmscriptenWasm.ModuleFactory<WebPModule>
>;

export function createEncoder(loadCodec: CodecLoader) {
  let emscriptenModule: Promise<WebPModule> | undefined;

  function init(
    module?: WebAssembly.Module | Partial<EmscriptenWasm.ModuleOpts>,
    moduleOptionOverrides?: Partial<EmscriptenWasm.ModuleOpts>,
  ): Promise<WebPModule> {
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
    options: WebPEncodeOptions = {},
  ): Promise<ArrayBuffer> {
    if (!emscriptenModule) emscriptenModule = init();

    // `icc` is jSquash's, not libwebp's, so it is peeled off before the rest
    // is handed to the WebPConfig binding.
    const { icc, ...config } = options;
    const _options: EncodeOptions = { ...defaultOptions, ...config };

    // Validated on this side of the boundary so the error names the actual
    // problem, and eagerly - a bad profile is a caller error, unlike a bad one
    // on the way in - but only when there is one, so the common call stays
    // exactly what it was.
    const profile = icc === undefined ? undefined : toIccProfileBytes(icc);

    const module = await emscriptenModule;

    const result = withPixelBuffer(module, data.data, (pointer) =>
      profile === undefined
        ? module.encode(pointer, data.width, data.height, _options)
        : module.encode_with_icc_profile(
            pointer,
            data.width,
            data.height,
            _options,
            profile,
          ),
    );

    if (!result) throw new Error('Encoding error.');

    return result.buffer;
  }

  return { init, dispose, encode };
}
