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
 * JPEG XL encoder bound to the multithreaded SIMD build.
 *
 * Same API as './encode.js', bound to jxl_enc_mt_simd.wasm. Note that this is
 * the mt+simd build, not the plain mt one: threads require SharedArrayBuffer,
 * which means a cross-origin-isolated browser page, and every browser that
 * ships SharedArrayBuffer also ships WebAssembly SIMD. So a caller opting into
 * threads can always have both, and the plain jxl_enc_mt build exists only as
 * a fallback './encode.js' will realistically never reach.
 *
 * Only use this if you have set the COOP/COEP headers described in the README
 * and are calling encode from a Worker. Without cross-origin isolation the
 * module will fail to instantiate - there is no runtime fallback here, which
 * is the point.
 */
import codec from './codec/enc/jxl_enc_mt_simd.js';
import { createEncoder } from './encode-core.js';

const { init, dispose, encode } = createEncoder(async () => codec);

export { init, dispose };
export default encode;
