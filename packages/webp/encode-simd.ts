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
 * WebP encoder bound to the SIMD build.
 *
 * Same API as './encode.js', but without the runtime feature check, so only
 * webp_enc_simd.wasm is referenced and a bundler emits one binary instead of
 * two. WebAssembly SIMD is available in every browser these packages target,
 * as well as Node, Deno and Cloudflare Workers - if you need to support a
 * runtime without it, use './encode.js' or './encode-scalar.js'.
 */
import codec from './codec/enc/webp_enc_simd.js';
import { createEncoder } from './encode-core.js';

const { init, dispose, encode } = createEncoder(async () => codec);

export { init, dispose };
export type { IccProfileInput, WebPEncodeOptions } from './meta.js';
export default encode;
