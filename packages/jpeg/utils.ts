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

export function initEmscriptenModule<T extends EmscriptenWasm.Module>(
  moduleFactory: EmscriptenWasm.ModuleFactory<T>,
  wasmModule?: WebAssembly.Module,
  moduleOptionOverrides: Partial<EmscriptenWasm.ModuleOpts> = {},
): Promise<T> {
  let instantiateWasm;

  if (wasmModule) {
    instantiateWasm = (
      imports: WebAssembly.Imports,
      callback: (instance: WebAssembly.Instance) => void,
    ) => {
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
export function disposeEmscriptenModule(
  modulePromise: Promise<EmscriptenWasm.Module> | undefined,
): void {
  if (!modulePromise) return;

  void modulePromise.then(
    (module) => {
      const pthread = (
        module as { PThread?: { terminateAllThreads?: () => void } }
      ).PThread;
      pthread?.terminateAllThreads?.();
    },
    () => {
      // The module never instantiated, so there is nothing to tear down.
    },
  );
}

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
export function withPixelBuffer<T>(
  module: PixelBufferModule,
  pixels: Uint8Array | Uint8ClampedArray,
  run: (pointer: number) => T,
): T {
  const pointer = module.create_buffer(pixels.byteLength);

  // malloc returns null on failure, and writing to offset 0 would silently
  // corrupt the heap rather than fail. Large images do hit this in memory
  // constrained runtimes such as Cloudflare Workers.
  if (!pointer) {
    throw new Error(
      `Could not allocate ${pixels.byteLength} bytes for the input image.`,
    );
  }

  try {
    // Read HEAPU8 after allocating: growing the heap detaches the old view.
    module.HEAPU8.set(pixels, pointer);
    return run(pointer);
  } finally {
    module.destroy_buffer(pointer);
  }
}
