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
export declare function initEmscriptenModule<T extends EmscriptenWasm.Module>(moduleFactory: EmscriptenWasm.ModuleFactory<T>, wasmModule?: WebAssembly.Module, moduleOptionOverrides?: Partial<EmscriptenWasm.ModuleOpts>): Promise<T>;
/**
 * Drop a cached module so its WebAssembly.Memory can be garbage collected.
 *
 * Emscripten heaps grow but never shrink, so a long-lived worker that has
 * processed a single large image holds that peak allocation for the rest of
 * its life. Any threads the module spawned hold a reference to that memory
 * too, so they have to be torn down before it can be reclaimed.
 */
export declare function disposeEmscriptenModule(modulePromise: Promise<EmscriptenWasm.Module> | undefined): void;
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
export declare function createModuleCache<T extends EmscriptenWasm.Module>(loadFactory: () => EmscriptenWasm.ModuleFactory<T> | Promise<EmscriptenWasm.ModuleFactory<T>>): {
    init: (module?: WebAssembly.Module | Partial<EmscriptenWasm.ModuleOpts> | null, moduleOptionOverrides?: Partial<EmscriptenWasm.ModuleOpts>) => Promise<T>;
    dispose: () => void;
    use: <R>(job: (module: T) => R | Promise<R>) => Promise<R>;
};
export interface PixelBufferModule extends EmscriptenWasm.Module {
    /** Allocate `size` bytes inside the module heap; returns a pointer. */
    create_buffer(size: number): number;
    /** Release a pointer previously returned by create_buffer. */
    destroy_buffer(pointer: number): void;
}
/**
 * Copy pixels into the module's heap and run `run` against the pointer.
 *
 * The encoders take a pointer rather than a typed array because embind's
 * std::string binding copies typed arrays into the heap one byte at a time
 * from JS. On a multi-megapixel image that copy dominates encode time; going
 * through the heap directly makes it a single memcpy.
 */
export declare function withPixelBuffer<T>(module: PixelBufferModule, pixels: Uint8Array | Uint8ClampedArray, run: (pointer: number) => T): T;
//# sourceMappingURL=utils.d.ts.map