/**
 * The encoder and decoder are bindings over a single wasm-bindgen module, so
 * the instance and its lifecycle live here rather than in either one. Keeping
 * separate caches in encode.ts and decode.ts would let one of them tear down
 * an instance the other still believed it held.
 */
import type {
  InitInput,
  InitOutput as PngModule,
} from './codec/pkg/squoosh_png.js';
import initPngModule, {
  dispose as disposePngWasm,
} from './codec/pkg/squoosh_png.js';

export type { InitInput, PngModule };

let pngModule: Promise<PngModule> | undefined;

export async function init(moduleOrPath?: InitInput): Promise<PngModule> {
  if (!pngModule) {
    pngModule = initPngModule(moduleOrPath);
  }

  return pngModule;
}

/**
 * Release the module so its WebAssembly.Memory can be garbage collected.
 * Affects both encoding and decoding; the next call re-instantiates.
 */
export function dispose(): void {
  if (!pngModule) return;
  pngModule = undefined;
  disposePngWasm();
}
