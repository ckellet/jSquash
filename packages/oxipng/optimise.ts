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
 * Notice: I (Jamie Sinclair) have modified the code
 * - Use mutli-threading only in a Worker context
 * - Use multi-threading only if the browser has hardware concurrency > 1
 */
import type { InitInput } from './codec/pkg/squoosh_oxipng.js';
import { defaultOptions, OptimiseOptions } from './meta.js';
import { threads } from 'wasm-feature-detect';

/**
 * wasm-bindgen-rayon spawns one Worker per thread up front and keeps them for
 * the module's lifetime. Past a handful of threads a single image sees little
 * further benefit, while the memory and startup cost keep growing, so the pool
 * is capped rather than tracking core count on large machines.
 */
const MAX_THREADS = 8;

async function initMT(moduleOrPath?: InitInput) {
  const {
    default: init,
    initThreadPool,
    optimise,
    optimise_raw,
    dispose: disposeWasm,
  } = await import('./codec/pkg-parallel/squoosh_oxipng.js');
  await init(moduleOrPath);
  await initThreadPool(
    Math.min(globalThis.navigator.hardwareConcurrency, MAX_THREADS),
  );
  return { optimise, optimise_raw, disposeWasm };
}

async function initST(moduleOrPath?: InitInput) {
  const {
    default: init,
    optimise,
    optimise_raw,
    dispose: disposeWasm,
  } = await import('./codec/pkg/squoosh_oxipng.js');
  await init(moduleOrPath);
  return { optimise, optimise_raw, disposeWasm };
}

let wasmReady: ReturnType<typeof initMT | typeof initST> | undefined;

export async function init(
  moduleOrPath?: InitInput,
): Promise<ReturnType<typeof initMT | typeof initST>> {
  if (!wasmReady) {
    const hasHardwareConcurrency =
      globalThis.navigator?.hardwareConcurrency > 1;
    const isWorker =
      typeof self !== 'undefined' &&
      typeof WorkerGlobalScope !== 'undefined' &&
      self instanceof WorkerGlobalScope;

    // We only use multi-threading if the browser has threads and we're in a Worker context
    // This is a caveat of threading library we use (wasm-bindgen-rayon)
    if (isWorker && hasHardwareConcurrency && (await threads())) {
      wasmReady = initMT(moduleOrPath);
    } else {
      wasmReady = initST(moduleOrPath);
    }
  }

  return wasmReady;
}

/**
 * Release the module so its WebAssembly.Memory can be garbage collected.
 *
 * Only call this once outstanding work has settled. On the threaded build the
 * rayon worker pool is not torn down, so memory is only fully reclaimed once
 * those workers are gone too.
 */
export function dispose(): void {
  const pending = wasmReady;
  wasmReady = undefined;

  void pending?.then(
    ({ disposeWasm }) => disposeWasm(),
    () => {
      // Never instantiated, so there is nothing to tear down.
    },
  );
}

export default async function optimise(
  data: ArrayBuffer | ImageData,
  options: Partial<OptimiseOptions> = {},
): Promise<ArrayBuffer> {
  const _options = { ...defaultOptions, ...options };
  const { optimise, optimise_raw } = await init();

  if (data instanceof ImageData) {
    return optimise_raw(
      data.data,
      data.width,
      data.height,
      _options.level,
      _options.interlace,
      _options.optimiseAlpha,
    ).buffer;
  }

  return optimise(
    new Uint8Array(data),
    _options.level,
    _options.interlace,
    _options.optimiseAlpha,
  ).buffer;
}
