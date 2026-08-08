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
 * WebP decoder bound to the SIMD build. See './encode-simd.js' for the
 * rationale; decoding benefits from SIMD more than encoding does.
 */
import codec from './codec/dec/webp_dec_simd.js';
import { createDecoder } from './decode-core.js';

const { init, dispose, decode, decodeWithMetadata, readIccProfile } =
  createDecoder(async () => codec);

export { init, dispose, decodeWithMetadata, readIccProfile };
export type { DecodedImage, ImageMetadata } from './meta.js';
export default decode;
