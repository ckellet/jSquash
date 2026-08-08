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
 * Updated to support a partial subset of WebP encoding options to be provided.
 * The WebP options are defaulted to defaults from the meta.ts file.
 * Also manually allow instantiation of the Wasm Module.
 */
import type { WebPModule } from './codec/enc/webp_enc.js';
import type { EncodeOptions } from './meta.js';

import { defaultOptions } from './meta.js';
import {
  disposeEmscriptenModule,
  initEmscriptenModule,
  withPixelBuffer,
} from './utils.js';
import { simd } from 'wasm-feature-detect';

let emscriptenModule: Promise<WebPModule> | undefined;

export async function init(
  moduleOptionOverrides?: Partial<EmscriptenWasm.ModuleOpts>,
): Promise<WebPModule>;
export async function init(
  module?: WebAssembly.Module,
  moduleOptionOverrides?: Partial<EmscriptenWasm.ModuleOpts>,
): Promise<WebPModule> {
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
    const webpEncoder = (await simd())
      ? await import('./codec/enc/webp_enc_simd.js')
      : await import('./codec/enc/webp_enc.js');

    return initEmscriptenModule(
      webpEncoder.default,
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

  const _options: EncodeOptions = { ...defaultOptions, ...options };
  const module = await emscriptenModule;

  const result = withPixelBuffer(module, data.data, (pointer) =>
    module.encode(pointer, data.width, data.height, _options),
  );

  if (!result) throw new Error('Encoding error.');

  return result.buffer;
}
