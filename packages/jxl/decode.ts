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
 * Notice: I (Jamie Sinclair) have copied this code from the @jsquash/webp decode module
 * and modified it to decode JPEG XL images.
 */

import { simd } from 'wasm-feature-detect';
import { createDecoder } from './decode-core.js';
import type { DecodedImage, ImageMetadata } from './meta.js';

export type { DecodedImage, ImageMetadata };

// libjxl leans on highway for the inverse transforms and colour conversion,
// and the decoder was previously linked against the build with SIMD disabled
// - so no environment got it, browser or otherwise. Import './decode-simd.js'
// to commit to that build and avoid shipping the baseline one alongside it.
const { init, dispose, decode, decodeWithMetadata, readIccProfile } =
  createDecoder(async () =>
    (await simd())
      ? (await import('./codec/dec/jxl_dec_simd.js')).default
      : (await import('./codec/dec/jxl_dec.js')).default,
  );

export { init, dispose, decodeWithMetadata, readIccProfile };
export default decode;
