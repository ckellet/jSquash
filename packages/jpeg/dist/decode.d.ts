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
 * Notice: I (Jamie Sinclair) have copied this code from the JPEG encode module
 * and modified it to decode JPEG images.
 */
import type { MozJPEGModule } from './codec/dec/mozjpeg_dec.js';
import { DecodeOptions } from './meta.js';
import type { DecodedImage, ImageMetadata } from './meta.js';
export type { DecodedImage, ImageMetadata };
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
 * decoded a single large image holds that peak allocation for the rest of
 * its life. The next call re-instantiates the module on demand.
 *
 * Safe to call with work outstanding: each call keeps the module it is
 * running on, and the reclaim happens once the last of them has finished.
 */
export declare const dispose: () => void;
export default function decode(buffer: ArrayBuffer, options?: Partial<DecodeOptions>): Promise<ImageData>;
/**
 * Decode an image and return it together with its embedded metadata.
 *
 * Separate from `decode` rather than an option on it because it returns
 * something else. Switching a return type on a flag makes the common call -
 * `const image = await decode(buf)` - depend on a value TypeScript can only
 * narrow when the flag is a literal, so anyone building an options object
 * dynamically ends up with a union to unpick. `decode` stays exactly as it was,
 * and callers who want metadata reach for a different name.
 *
 * Both the ICC profile (APP2) and the raw EXIF payload (APP1) come back, in the
 * same pass that decodes the pixels. Fields are absent rather than empty when
 * the file carried nothing, so `if (metadata.icc)` is the natural test.
 */
export declare function decodeWithMetadata(buffer: ArrayBuffer, options?: Partial<DecodeOptions>): Promise<DecodedImage<ImageData>>;
/**
 * Read an image's ICC profile without decoding any pixels.
 *
 * Stops after the JPEG header, which is where the APP2 markers already are, so
 * asking what colour space a file is in does not cost a full decode.
 *
 * Returns `undefined` when the image carries no profile, when the profile is
 * there but does not reassemble, and when the input is not a JPEG at all -
 * metadata is advisory, and a file whose pixels decode perfectly well should
 * not fail over a malformed ancillary marker.
 */
export declare function readIccProfile(buffer: ArrayBuffer): Promise<Uint8Array | undefined>;
//# sourceMappingURL=decode.d.ts.map