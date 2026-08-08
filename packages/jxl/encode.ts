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
 * Notice: I (Jamie Sinclair) have modified this file.
 * Updated to support a partial subset of JPEG XL encoding options to be provided.
 * The options are defaulted to defaults from the meta.ts file.
 */
import type { EncodeOptions } from './meta.js';
import type { JXLModule } from './codec/enc/jxl_enc.js';

import { defaultOptions } from './meta.js';
import { simd, threads } from 'wasm-feature-detect';
import { disposeEmscriptenModule, initEmscriptenModule } from './utils.js';

let emscriptenModule: Promise<JXLModule> | undefined;

const isRunningInNode = () =>
  typeof process !== 'undefined' &&
  process.release &&
  process.release.name === 'node';
const isRunningInCloudflareWorker = () =>
  (globalThis.caches as any)?.default !== undefined;

export async function init(
  moduleOptionOverrides?: Partial<EmscriptenWasm.ModuleOpts>,
): Promise<JXLModule>;
export async function init(
  module?: WebAssembly.Module,
  moduleOptionOverrides?: Partial<EmscriptenWasm.ModuleOpts>,
) {
  let actualModule: WebAssembly.Module | undefined = module;
  let actualOptions: Partial<EmscriptenWasm.ModuleOpts> | undefined =
    moduleOptionOverrides;

  // If only one argument is provided and it's not a WebAssembly.Module
  if (arguments.length === 1 && !(module instanceof WebAssembly.Module)) {
    actualModule = undefined;
    actualOptions = module as unknown as Partial<EmscriptenWasm.ModuleOpts>;
  }

  // Assign synchronously, before the first await. Callers are documented to
  // be able to fire init(module) without awaiting it, and two concurrent
  // calls must share one module rather than each building their own - both
  // of which stop working the moment this function awaits before assigning.
  emscriptenModule = (async () => {
    // Threads need SharedArrayBuffer, so they are unavailable under Node, in
    // Cloudflare Workers, and on any page that is not cross-origin isolated.
    // SIMD carries no such requirement, so it is selected independently:
    // those environments used to fall back to the build with neither, which
    // is the slowest encoder here by a wide margin.
    const useThreads =
      !isRunningInNode() && !isRunningInCloudflareWorker() && (await threads());
    const useSimd = await simd();

    const jxlEncoder = useThreads
      ? useSimd
        ? await import('./codec/enc/jxl_enc_mt_simd.js')
        : await import('./codec/enc/jxl_enc_mt.js')
      : useSimd
        ? await import('./codec/enc/jxl_enc_simd.js')
        : await import('./codec/enc/jxl_enc.js');

    return initEmscriptenModule(
      jxlEncoder.default,
      actualModule,
      actualOptions,
    );
  })();

  return emscriptenModule;
}

/**
 * Release the module so its WebAssembly.Memory can be garbage collected.
 *
 * Emscripten heaps grow but never shrink, so a long-lived worker that has
 * encoded a single large image holds that peak allocation for the rest of
 * its life. The next call re-instantiates the module on demand.
 */
export function dispose(): void {
  const pending = emscriptenModule;
  emscriptenModule = undefined;
  disposeEmscriptenModule(pending);
}

export default async function encode(
  data: ImageData,
  options: Partial<EncodeOptions> = {},
): Promise<ArrayBuffer> {
  if (!emscriptenModule) emscriptenModule = init();

  const module = await emscriptenModule;
  const _options = { ...defaultOptions, ...options };

  if (_options.lossless) {
    if (options.quality !== undefined && options.quality !== 100) {
      console.warn(
        'JXL lossless: Quality setting is ignored when lossless is enabled (quality must be 100).',
      );
    }

    if (options.lossyModular) {
      console.warn(
        'JXL lossless: LossyModular setting is ignored when lossless is enabled (lossyModular must be false).',
      );
    }

    if (options.lossyPalette) {
      console.warn(
        'JXL lossless: LossyPalette setting is ignored when lossless is enabled (lossyPalette must be false).',
      );
    }

    _options.quality = 100;
    _options.lossyModular = false;
    _options.lossyPalette = false;
  }

  const resultView = module.encode(
    data.data,
    data.width,
    data.height,
    _options,
  );
  if (!resultView) {
    throw new Error('Encoding error.');
  }

  return resultView.buffer as ArrayBuffer;
}
