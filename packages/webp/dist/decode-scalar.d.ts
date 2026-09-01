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
declare const init: (module?: WebAssembly.Module | Partial<EmscriptenWasm.ModuleOpts> | null | undefined, moduleOptionOverrides?: Partial<EmscriptenWasm.ModuleOpts> | undefined) => Promise<import("./codec/dec/webp_dec.js").WebPModule>, dispose: () => void, decode: (buffer: ArrayBuffer) => Promise<ImageData>, decodeWithMetadata: (buffer: ArrayBuffer) => Promise<import("./meta.js").DecodedImage<ImageData>>, readIccProfile: (buffer: ArrayBuffer) => Promise<Uint8Array | undefined>;
export { init, dispose, decodeWithMetadata, readIccProfile };
export type { DecodedImage, ImageMetadata } from './meta.js';
export default decode;
//# sourceMappingURL=decode-scalar.d.ts.map