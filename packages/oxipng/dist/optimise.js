/**
 * Copyright 2020 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import { defaultOptions } from './meta.js';
import { threads } from 'wasm-feature-detect';
/**
 * wasm-bindgen-rayon spawns one Worker per thread up front and keeps them for
 * the module's lifetime. Past a handful of threads a single image sees little
 * further benefit, while the memory and startup cost keep growing, so the pool
 * is capped rather than tracking core count on large machines.
 */
const MAX_THREADS = 8;
async function initMT(moduleOrPath) {
    const { default: init, initThreadPool, optimise, optimise_raw, dispose: disposeWasm, } = await import('./codec/pkg-parallel/squoosh_oxipng.js');
    await init(moduleOrPath);
    await initThreadPool(Math.min(globalThis.navigator.hardwareConcurrency, MAX_THREADS));
    return { optimise, optimise_raw, disposeWasm };
}
async function initST(moduleOrPath) {
    const { default: init, optimise, optimise_raw, dispose: disposeWasm, } = await import('./codec/pkg/squoosh_oxipng.js');
    await init(moduleOrPath);
    return { optimise, optimise_raw, disposeWasm };
}
let wasmReady;
let inFlight = 0;
let retiring = false;
/** A reclaim that has started but not finished. See `init`. */
let teardown;
/**
 * The wasm the caller supplied, kept for the next instantiation.
 *
 * Re-instantiating after a `dispose()` needs a binary, and a runtime that
 * cannot fetch its own - Cloudflare Workers being the one this matters for -
 * has no other way to come by one. It has to be something usable more than
 * once: a compiled `WebAssembly.Module` or the bytes, not a `Response`.
 */
let retainedInput;
export async function init(moduleOrPath) {
    var _a;
    if (moduleOrPath !== undefined)
        retainedInput = moduleOrPath;
    if (!wasmReady) {
        const hasHardwareConcurrency = ((_a = globalThis.navigator) === null || _a === void 0 ? void 0 : _a.hardwareConcurrency) > 1;
        const isWorker = typeof self !== 'undefined' &&
            typeof WorkerGlobalScope !== 'undefined' &&
            self instanceof WorkerGlobalScope;
        // Sequenced behind a reclaim that is still running: the generated glue
        // keeps one slot for the module, so an instantiation overlapping a
        // teardown would have its instance torn out from under it.
        const reclaiming = teardown;
        const build = async () => 
        // We only use multi-threading if the browser has threads and we're in a Worker context
        // This is a caveat of threading library we use (wasm-bindgen-rayon)
        isWorker && hasHardwareConcurrency && (await threads())
            ? initMT(retainedInput)
            : initST(retainedInput);
        wasmReady = reclaiming ? reclaiming.then(build) : build();
    }
    return wasmReady;
}
/** Tear down what dispose() retired, now that nothing is using it. */
function reclaim() {
    if (!retiring)
        return;
    const pending = wasmReady;
    retiring = false;
    wasmReady = undefined;
    if (!pending)
        return;
    // Chained rather than fired straight away: an init() still in flight would
    // otherwise install its instance after the teardown had run. The promise is
    // kept so the next init() can sequence itself behind it.
    const done = pending.then(({ disposeWasm }) => {
        disposeWasm();
    }, () => {
        // Never instantiated, so there is nothing to tear down.
    });
    teardown = done;
    void done.then(() => {
        if (teardown === done)
            teardown = undefined;
    });
}
/**
 * Release the module so its WebAssembly.Memory can be garbage collected.
 *
 * Safe to call with work outstanding: the reclaim waits for the last call
 * using the module to finish. On the threaded build the rayon worker pool is
 * not torn down, so memory is only fully reclaimed once those workers are
 * gone too.
 */
export function dispose() {
    if (!wasmReady)
        return;
    retiring = true;
    if (inFlight === 0)
        reclaim();
}
export default async function optimise(data, options = {}) {
    const _options = { ...defaultOptions, ...options };
    inFlight++;
    try {
        const { optimise, optimise_raw } = await init();
        if (data instanceof ImageData) {
            return optimise_raw(data.data, data.width, data.height, _options.level, _options.interlace, _options.optimiseAlpha).buffer;
        }
        return optimise(new Uint8Array(data), _options.level, _options.interlace, _options.optimiseAlpha).buffer;
    }
    finally {
        inFlight--;
        if (inFlight === 0)
            reclaim();
    }
}
