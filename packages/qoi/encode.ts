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
 * Notice: I (Jamie Sinclair) have copied this code from the original and modified
 * to align with the jSquash project structure.
 */
import type { QOIModule } from './codec/enc/qoi_enc.js';

import qoi_enc from './codec/enc/qoi_enc.js';
import {
  disposeEmscriptenModule,
  initEmscriptenModule,
  withPixelBuffer,
} from './utils.js';

let emscriptenModule: Promise<QOIModule> | undefined;

export async function init(
  moduleOptionOverrides?: Partial<EmscriptenWasm.ModuleOpts>,
): Promise<QOIModule>;
export async function init(
  module?: WebAssembly.Module,
  moduleOptionOverrides?: Partial<EmscriptenWasm.ModuleOpts>,
): Promise<QOIModule> {
  let actualModule: WebAssembly.Module | undefined = module;
  let actualOptions: Partial<EmscriptenWasm.ModuleOpts> | undefined =
    moduleOptionOverrides;

  // If only one argument is provided and it's not a WebAssembly.Module
  if (arguments.length === 1 && !(module instanceof WebAssembly.Module)) {
    actualModule = undefined;
    actualOptions = module as unknown as Partial<EmscriptenWasm.ModuleOpts>;
  }

  emscriptenModule = initEmscriptenModule(qoi_enc, actualModule, actualOptions);
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

export default async function encode(data: ImageData): Promise<ArrayBuffer> {
  if (!emscriptenModule) emscriptenModule = init();

  const module = await emscriptenModule;

  const resultView = withPixelBuffer(module, data.data, (pointer) =>
    module.encode(pointer, data.width, data.height),
  );

  if (!resultView) throw new Error('Encoding error.');

  // wasm can't run on SharedArrayBuffers, so we hard-cast to ArrayBuffer.
  return resultView.buffer as ArrayBuffer;
}
