/**
 * The encoder and decoder are bindings over a single wasm-bindgen module, so
 * the instance and its lifecycle live here rather than in either one. Keeping
 * separate caches in encode.ts and decode.ts would let one of them tear down
 * an instance the other still believed it held.
 */
import type { InitInput, InitOutput as PngModule } from './codec/pkg/squoosh_png.js';
export type { InitInput, PngModule };
export declare function init(moduleOrPath?: InitInput): Promise<PngModule>;
/**
 * Release the module so its WebAssembly.Memory can be garbage collected.
 * Affects both encoding and decoding; the next call re-instantiates.
 *
 * Safe to call with work outstanding: the reclaim waits for the last call
 * using the module to finish, rather than pulling the heap out from under it.
 */
export declare function dispose(): void;
/**
 * Run `job` against the module, instantiating it if there is none, and
 * keeping it alive until the job settles.
 *
 * @internal - the lifecycle plumbing behind encode/decode, not public API.
 */
export declare function use<T>(job: () => T | Promise<T>): Promise<T>;
//# sourceMappingURL=init.d.ts.map