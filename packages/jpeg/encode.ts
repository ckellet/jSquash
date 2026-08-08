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
 * Updated to support a partial subset of Jpeg encoding options to be provided.
 * The jpeg options are defaulted to defaults from the meta.ts file.
 */
import type { IccProfileInput, JpegEncodeOptions } from './meta.js';
import type { MozJPEGModule } from './codec/enc/mozjpeg_enc.js';

import mozjpeg_enc from './codec/enc/mozjpeg_enc.js';
import { defaultOptions, toIccProfileBytes } from './meta.js';
import {
  disposeEmscriptenModule,
  initEmscriptenModule,
  withPixelBuffer,
} from './utils.js';

export type { IccProfileInput, JpegEncodeOptions };

let emscriptenModule: Promise<MozJPEGModule> | undefined;

export async function init(
  moduleOptionOverrides?: Partial<EmscriptenWasm.ModuleOpts>,
): Promise<MozJPEGModule>;
export async function init(
  module?: WebAssembly.Module,
  moduleOptionOverrides?: Partial<EmscriptenWasm.ModuleOpts>,
): Promise<MozJPEGModule> {
  let actualModule: WebAssembly.Module | undefined = module;
  let actualOptions: Partial<EmscriptenWasm.ModuleOpts> | undefined =
    moduleOptionOverrides;

  // If only one argument is provided and it's not a WebAssembly.Module
  if (arguments.length === 1 && !(module instanceof WebAssembly.Module)) {
    actualModule = undefined;
    actualOptions = module as unknown as Partial<EmscriptenWasm.ModuleOpts>;
  }

  emscriptenModule = initEmscriptenModule(
    mozjpeg_enc,
    actualModule,
    actualOptions,
  );
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
  options: Partial<JpegEncodeOptions> = {},
): Promise<ArrayBuffer> {
  // `icc` is jSquash's own option rather than a MozJPEG parameter, so it is
  // separated out before the rest cross the embind boundary. Validated up here
  // so a bad profile is a caller error that costs nothing: it throws before the
  // module is awaited and before a pixel is copied anywhere.
  const { icc: iccInput, ...encodeOptions } = options;
  const icc = iccInput === undefined ? undefined : toIccProfileBytes(iccInput);

  if (!emscriptenModule) emscriptenModule = init();

  const module = await emscriptenModule;
  const _options = { ...defaultOptions, ...encodeOptions };

  const resultView = withPixelBuffer(module, data.data, (pointer) =>
    icc === undefined
      ? module.encode(pointer, data.width, data.height, _options)
      : withPixelBuffer(module, icc, (iccPointer) =>
          module.encode_with_icc_profile(
            pointer,
            data.width,
            data.height,
            _options,
            iccPointer,
            icc.byteLength,
          ),
        ),
  );

  if (!resultView) throw new Error('Encoding error.');

  // wasm can't run on SharedArrayBuffers, so we hard-cast to ArrayBuffer.
  return resultView.buffer as ArrayBuffer;
}
