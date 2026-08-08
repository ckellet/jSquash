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
 * JPEG XL encoder bound to the single-threaded SIMD build.
 *
 * Same API as './encode.js', but without the runtime feature check, so only
 * jxl_enc_simd.wasm is referenced and a bundler emits one binary instead of
 * four. This is what Node, Deno, Cloudflare Workers and any browser page that
 * is not cross-origin isolated end up running anyway - all of them lack
 * SharedArrayBuffer, so './encode.js' would never pick a threaded build for
 * them, yet a bundler still has to emit the 3.1 MB of threaded wasm it might.
 * If you need to support a runtime without WebAssembly SIMD, use './encode.js'
 * or './encode-scalar.js'.
 */
import codec from './codec/enc/jxl_enc_simd.js';
import { createEncoder } from './encode-core.js';

const { init, dispose, encode } = createEncoder(async () => codec);

export { init, dispose };
export default encode;
