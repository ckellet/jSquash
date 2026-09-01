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
import { decode as pngDecodeWasm, decode_rgba16 as pngDecodeRgba16Wasm, read_icc_profile as pngReadIccProfileWasm, } from './codec/pkg/squoosh_png.js';
import { init, dispose, use } from './init.js';
export { init, dispose };
export async function decode(data, options = {}) {
    const { bitDepth = 8 } = options;
    return use(async () => {
        if (bitDepth === 16) {
            const imageData = await pngDecodeRgba16Wasm(new Uint8Array(data));
            if (!imageData)
                throw new Error('Encoding error.');
            return imageData;
        }
        const imageData = await pngDecodeWasm(new Uint8Array(data));
        if (!imageData)
            throw new Error('Encoding error.');
        return imageData;
    });
}
export async function decodeWithMetadata(data, options = {}) {
    const { bitDepth = 8 } = options;
    const bytes = new Uint8Array(data);
    return use(async () => {
        const image = bitDepth === 16
            ? await pngDecodeRgba16Wasm(bytes)
            : await pngDecodeWasm(bytes);
        if (!image)
            throw new Error('Encoding error.');
        // A second pass over the same input, which stops at the first IDAT rather
        // than decoding anything. That costs one more copy of the *compressed*
        // bytes across the wasm boundary and buys a pixel path that is untouched
        // for callers who never ask for metadata.
        const icc = pngReadIccProfileWasm(bytes);
        const metadata = {};
        if (icc && icc.length > 0)
            metadata.icc = icc;
        return { image, metadata };
    });
}
/**
 * Read an image's ICC profile without decoding any pixels.
 *
 * Returns `undefined` when the image carries no profile, or when the profile
 * is there but unreadable - metadata is advisory, and a file whose pixels
 * decode perfectly well should not fail over a malformed ancillary chunk.
 */
export function readIccProfile(data) {
    return use(() => {
        const icc = pngReadIccProfileWasm(new Uint8Array(data));
        return icc && icc.length > 0 ? icc : undefined;
    });
}
export default decode;
