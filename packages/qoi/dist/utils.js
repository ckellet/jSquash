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
/**
 * Notice: I (Jamie Sinclair) have modified this file to allow manual instantiation of the Wasm Module.
 */
export function initEmscriptenModule(moduleFactory, wasmModule, moduleOptionOverrides = {}) {
    let instantiateWasm;
    if (wasmModule) {
        instantiateWasm = (imports, callback) => {
            const instance = new WebAssembly.Instance(wasmModule, imports);
            callback(instance);
            return instance.exports;
        };
    }
    return moduleFactory({
        // Just to be safe, don't automatically invoke any wasm functions
        noInitialRun: true,
        instantiateWasm,
        ...moduleOptionOverrides,
    });
}
/**
 * Drop a cached module so its WebAssembly.Memory can be garbage collected.
 *
 * Emscripten heaps grow but never shrink, so a long-lived worker that has
 * processed a single large image holds that peak allocation for the rest of
 * its life. Any threads the module spawned hold a reference to that memory
 * too, so they have to be torn down before it can be reclaimed.
 */
export function disposeEmscriptenModule(modulePromise) {
    if (!modulePromise)
        return;
    void modulePromise.then((module) => {
        var _a;
        const pthread = module.PThread;
        (_a = pthread === null || pthread === void 0 ? void 0 : pthread.terminateAllThreads) === null || _a === void 0 ? void 0 : _a.call(pthread);
    }, () => {
        // The module never instantiated, so there is nothing to tear down.
    });
}
/**
 * Instantiate-once storage for a codec module, with the lifecycle every entry
 * point needs: built on first use, replaceable through `init()`, and handed
 * back to the runtime by `dispose()`.
 *
 * Two of those details are easy to get wrong in ways that only surface in
 * production, so they live here rather than at each call site:
 *
 * - `init(module)` remembers the module it was given, rather than only using
 *   it. Re-instantiating after a `dispose()` needs the same binary, and a
 *   runtime that cannot fetch its own `.wasm` - Cloudflare Workers being the
 *   one this matters for - has no other way to get it back. What is held is
 *   the compiled `WebAssembly.Module`, which is code rather than heap, so it
 *   does not pin the memory `dispose()` just released.
 *
 * - Work in flight pins the instance it is running on, and `dispose()`
 *   reclaims at the next idle moment rather than immediately. That is what
 *   makes it safe to call while calls are outstanding: it cannot pull the
 *   heap out from under a decode that is halfway through, and it does not
 *   leave a second heap alive by re-instantiating alongside one still in use.
 */
export function createModuleCache(loadFactory) {
    let instance;
    let inFlight = 0;
    /** Instances a dispose() is waiting on. Empty unless one is outstanding. */
    const retiring = [];
    let retainedModule;
    let retainedOptions;
    function instantiate() {
        // Assigned synchronously, before the first await. Callers are documented
        // to be able to fire init(module) without awaiting it, and two concurrent
        // calls must share one module rather than each building their own - both
        // of which stop working the moment this function awaits before assigning.
        instance = (async () => initEmscriptenModule(await loadFactory(), retainedModule, retainedOptions))();
        return instance;
    }
    /** Tear down whatever dispose() retired, now that nothing is using it. */
    function reclaim() {
        for (const pending of retiring.splice(0)) {
            // An init() since the dispose() has already moved new callers onto a
            // different instance, which stays.
            if (instance === pending)
                instance = undefined;
            disposeEmscriptenModule(pending);
        }
    }
    function init(module, moduleOptionOverrides) {
        var _a;
        if (module instanceof WebAssembly.Module) {
            retainedModule = module;
            retainedOptions = moduleOptionOverrides;
        }
        else {
            // `init(options)` and `init(null, options)` are both documented, so the
            // options can arrive in either position.
            retainedModule = undefined;
            retainedOptions = (_a = moduleOptionOverrides !== null && moduleOptionOverrides !== void 0 ? moduleOptionOverrides : module) !== null && _a !== void 0 ? _a : undefined;
        }
        return instantiate();
    }
    function dispose() {
        if (!instance || retiring.includes(instance))
            return;
        retiring.push(instance);
        if (inFlight === 0)
            reclaim();
    }
    /**
     * Run `job` against the module, instantiating one if there is none, and
     * keeping it alive until the job settles.
     */
    async function use(job) {
        inFlight++;
        try {
            return await job(await (instance !== null && instance !== void 0 ? instance : instantiate()));
        }
        finally {
            inFlight--;
            if (inFlight === 0)
                reclaim();
        }
    }
    return { init, dispose, use };
}
/**
 * Copy pixels into the module's heap and run `run` against the pointer.
 *
 * The encoders take a pointer rather than a typed array because embind's
 * std::string binding copies typed arrays into the heap one byte at a time
 * from JS. On a multi-megapixel image that copy dominates encode time; going
 * through the heap directly makes it a single memcpy.
 */
export function withPixelBuffer(module, pixels, run) {
    const pointer = module.create_buffer(pixels.byteLength);
    // malloc returns null on failure, and writing to offset 0 would silently
    // corrupt the heap rather than fail. Large images do hit this in memory
    // constrained runtimes such as Cloudflare Workers.
    if (!pointer) {
        throw new Error(`Could not allocate ${pixels.byteLength} bytes for the input image.`);
    }
    try {
        // Read HEAPU8 after allocating: growing the heap detaches the old view.
        module.HEAPU8.set(pixels, pointer);
        return run(pointer);
    }
    finally {
        module.destroy_buffer(pointer);
    }
}
