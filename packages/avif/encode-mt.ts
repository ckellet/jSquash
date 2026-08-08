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
 * AVIF encoder bound to the multithreaded build.
 *
 * Same API as './encode.js'. The fastest of the three builds, but it needs
 * SharedArrayBuffer, so it only loads in a browser page served with the
 * cross-origin isolation headers (see "Activate Multithreading" in the
 * README). Node, Deno and Cloudflare Workers cannot run it at all - use
 * './encode-simd.js' there. Unlike './encode.js' there is no fallback, so
 * only reach for this if you control the headers your page is served with.
 */
import codec from './codec/enc/avif_enc_mt.js';
import { createEncoder } from './encode-core.js';

const { init, dispose, encode } = createEncoder(async () => codec);

export { init, dispose };
export default encode;
