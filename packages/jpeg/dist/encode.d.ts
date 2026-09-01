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
export type { IccProfileInput, JpegEncodeOptions };
/**
 * Instantiate the module up front, optionally from wasm you supply.
 *
 * Both the module and the option overrides are remembered, so the
 * re-instantiation after a `dispose()` uses them again rather than falling
 * back to fetching the binary - which is not something every runtime this
 * library targets can do.
 */
export declare function init(moduleOptionOverrides?: Partial<EmscriptenWasm.ModuleOpts>): Promise<MozJPEGModule>;
export declare function init(module?: WebAssembly.Module, moduleOptionOverrides?: Partial<EmscriptenWasm.ModuleOpts>): Promise<MozJPEGModule>;
/**
 * Release the module so its WebAssembly.Memory can be garbage collected.
 *
 * Emscripten heaps grow but never shrink, so a long-lived worker that has
 * encoded a single large image holds that peak allocation for the rest of
 * its life. The next call re-instantiates the module on demand.
 *
 * Safe to call with work outstanding: each call keeps the module it is
 * running on, and the reclaim happens once the last of them has finished.
 */
export declare const dispose: () => void;
export default function encode(data: ImageData, options?: Partial<JpegEncodeOptions>): Promise<ArrayBuffer>;
//# sourceMappingURL=encode.d.ts.map