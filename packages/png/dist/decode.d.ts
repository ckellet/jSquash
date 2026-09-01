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
 * and modified it to decode PNG images.
 */
import type { ImageDataRGBA16 } from './codec/pkg/squoosh_png.js';
import { init, dispose } from './init.js';
import type { DecodedImage, ImageMetadata } from './meta.js';
export { init, dispose };
export type { DecodedImage, ImageMetadata };
export interface DecodeOptions {
    bitDepth?: 8 | 16;
}
export declare function decode(data: ArrayBuffer, options: {
    bitDepth: 16;
}): Promise<ImageDataRGBA16>;
export declare function decode(data: ArrayBuffer, options?: {
    bitDepth?: 8;
}): Promise<ImageData>;
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
 * PNG's `iCCP` chunk is the only metadata surfaced today; `metadata.exif` is
 * always absent. See `docs/colour-management.md`.
 */
export declare function decodeWithMetadata(data: ArrayBuffer, options: {
    bitDepth: 16;
}): Promise<DecodedImage<ImageDataRGBA16>>;
export declare function decodeWithMetadata(data: ArrayBuffer, options?: {
    bitDepth?: 8;
}): Promise<DecodedImage<ImageData>>;
/**
 * Read an image's ICC profile without decoding any pixels.
 *
 * Returns `undefined` when the image carries no profile, or when the profile
 * is there but unreadable - metadata is advisory, and a file whose pixels
 * decode perfectly well should not fail over a malformed ancillary chunk.
 */
export declare function readIccProfile(data: ArrayBuffer): Promise<Uint8Array | undefined>;
export default decode;
//# sourceMappingURL=decode.d.ts.map