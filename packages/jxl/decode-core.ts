/**
 * The decoder, minus the decision about which build to run it on.
 * See `encode-core.ts` for why this split exists.
 */
import type { JXLModule } from './codec/dec/jxl_dec.js';

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

  return { init, dispose, decode };
}
