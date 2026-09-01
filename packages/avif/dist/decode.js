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
import { simd } from 'wasm-feature-detect';
import { createDecoder } from './decode-core.js';
// libaom is built for a generic target, so the SIMD build is autovectorisation
// of the portable C rather than hand-written intrinsics - but it is still
// worth 4% on decode. Import './decode-simd.js' to commit to that build and
// avoid shipping the baseline one alongside it.
const { init, dispose, decode, decodeWithMetadata, readIccProfile } = createDecoder(async () => (await simd())
    ? (await import('./codec/dec/avif_dec_simd.js')).default
    : (await import('./codec/dec/avif_dec.js')).default);
export { init, dispose, decodeWithMetadata, readIccProfile };
export default decode;
