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
 * Notice: I (Jamie Sinclair) have modified this file.
 * Updated to support a partial subset of JPEG XL encoding options to be provided.
 * The options are defaulted to defaults from the meta.ts file.
 */
import { simd, threads } from 'wasm-feature-detect';
import { createEncoder } from './encode-core.js';
const isRunningInNode = () => typeof process !== 'undefined' &&
    process.release &&
    process.release.name === 'node';
const isRunningInCloudflareWorker = () => { var _a; return ((_a = globalThis.caches) === null || _a === void 0 ? void 0 : _a.default) !== undefined; };
// Picks a build at runtime, which is why a bundler pulling this in emits all
// four .wasm files - over 6 MB, of which the two threaded builds cannot even
// load unless the page is cross-origin isolated. Import './encode-simd.js',
// './encode-mt.js' or './encode-scalar.js' instead to commit to one.
const { init, dispose, encode } = createEncoder(async () => {
    // Threads need SharedArrayBuffer, so they are unavailable under Node, in
    // Cloudflare Workers, and on any page that is not cross-origin isolated.
    // SIMD carries no such requirement, so it is selected independently:
    // those environments used to fall back to the build with neither, which
    // is the slowest encoder here by a wide margin.
    const useThreads = !isRunningInNode() && !isRunningInCloudflareWorker() && (await threads());
    const useSimd = await simd();
    const jxlEncoder = useThreads
        ? useSimd
            ? await import('./codec/enc/jxl_enc_mt_simd.js')
            : await import('./codec/enc/jxl_enc_mt.js')
        : useSimd
            ? await import('./codec/enc/jxl_enc_simd.js')
            : await import('./codec/enc/jxl_enc.js');
    return jxlEncoder.default;
});
export { init, dispose };
export default encode;
