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
 * Notice: I (Jamie Sinclair) have modified this file to accept an ArrayBuffer
 * instead of a typed array, and to allow manual instantiation of the module.
 */
import { simd } from 'wasm-feature-detect';
import { createDecoder } from './decode-core.js';
// libwebp's decode path has SIMD implementations of the transforms and colour
// conversion. Import './decode-simd.js' to commit to that build and avoid
// shipping the baseline one alongside it.
const { init, dispose, decode, decodeWithMetadata, readIccProfile } = createDecoder(async () => (await simd())
    ? (await import('./codec/dec/webp_dec_simd.js')).default
    : (await import('./codec/dec/webp_dec.js')).default);
export { init, dispose, decodeWithMetadata, readIccProfile };
export default decode;
