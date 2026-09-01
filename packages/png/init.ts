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
let inFlight = 0;
let retiring = false;

/** A reclaim that has started but not finished. See `init`. */
let teardown: Promise<void> | undefined;

/**
 * The wasm the caller supplied, kept for the next instantiation.
 *
 * Re-instantiating after a `dispose()` needs a binary, and a runtime that
 * cannot fetch its own - Cloudflare Workers being the one this matters for -
 * has no other way to come by one. It has to be something usable more than
 * once: a compiled `WebAssembly.Module` or the bytes, not a `Response`.
 */
let retainedInput: InitInput | undefined;

export async function init(moduleOrPath?: InitInput): Promise<PngModule> {
  if (moduleOrPath !== undefined) retainedInput = moduleOrPath;

  if (!pngModule) {
    // Sequenced behind a reclaim that is still running: the generated glue
    // keeps one slot for the module, so an instantiation overlapping a
    // teardown would have its instance torn out from under it.
    const reclaiming = teardown;
    pngModule = reclaiming
      ? reclaiming.then(() => initPngModule(retainedInput))
      : initPngModule(retainedInput);
  }

  return pngModule;
}

/** Tear down what dispose() retired, now that nothing is using it. */
function reclaim(): void {
  if (!retiring) return;

  const pending = pngModule;
  retiring = false;
  pngModule = undefined;
  if (!pending) return;

  // Chained rather than fired straight away: an init() still in flight would
  // otherwise install its instance after the teardown had run. The promise is
  // kept so the next init() can sequence itself behind it.
  const done = pending.then(
    () => {
      disposePngWasm();
    },
    () => {
      // Never instantiated, so there is nothing to tear down.
    },
  );

  teardown = done;
  void done.then(() => {
    if (teardown === done) teardown = undefined;
  });
}

/**
 * Release the module so its WebAssembly.Memory can be garbage collected.
 * Affects both encoding and decoding; the next call re-instantiates.
 *
 * Safe to call with work outstanding: the reclaim waits for the last call
 * using the module to finish, rather than pulling the heap out from under it.
 */
export function dispose(): void {
  if (!pngModule) return;

  retiring = true;
  if (inFlight === 0) reclaim();
}

/**
 * Run `job` against the module, instantiating it if there is none, and
 * keeping it alive until the job settles.
 *
 * @internal - the lifecycle plumbing behind encode/decode, not public API.
 */
export async function use<T>(job: () => T | Promise<T>): Promise<T> {
  inFlight++;
  try {
    await init();
    return await job();
  } finally {
    inFlight--;
    if (inFlight === 0) reclaim();
  }
}
