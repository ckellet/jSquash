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
 * Updated to support a partial subset of Avif encoding options to be provided.
 * The avif options are defaulted to defaults from the meta.ts file.
 */
import { simd, threads } from 'wasm-feature-detect';
import { createEncoder } from './encode-core.js';

const isRunningInNode = () =>
  typeof process !== 'undefined' &&
  process.release &&
  process.release.name === 'node';
const isRunningInCloudflareWorker = () =>
  (globalThis.caches as any)?.default !== undefined;

// Picks a build at runtime, which is why a bundler pulling this in emits all
// three .wasm files. Import './encode-simd.js' instead to commit to one.
const { init, dispose, encode } = createEncoder(async () => {
  // Threads need SharedArrayBuffer, which Node, Cloudflare Workers and any
  // page that is not cross-origin isolated do not have. SIMD has no such
  // requirement, so those runtimes get the SIMD build rather than falling
  // all the way back to the build with neither.
  const useThreads =
    !isRunningInNode() && !isRunningInCloudflareWorker() && (await threads());

  const avifEncoder = useThreads
    ? await import('./codec/enc/avif_enc_mt.js')
    : (await simd())
      ? await import('./codec/enc/avif_enc_simd.js')
      : await import('./codec/enc/avif_enc.js');

  return avifEncoder.default;
});

export { init, dispose };
export default encode;
