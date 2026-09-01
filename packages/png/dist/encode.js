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
 * and modified it to encode PNG images and also optimise them.
 */
import { encode as pngEncode, encode_with_icc_profile as pngEncodeWithIccProfile, } from './codec/pkg/squoosh_png.js';
import { init, dispose, use } from './init.js';
import { toIccProfileBytes } from './meta.js';
export { init, dispose };
/** Boundary encoding: `png`'s preset order, weakest first. */
const COMPRESSION_LEVELS = {
    none: 0,
    fastest: 1,
    fast: 2,
    balanced: 3,
    high: 4,
};
export default async function encode(data, options = {}) {
    var _a, _b;
    const bitDepth = (_a = options === null || options === void 0 ? void 0 : options.bitDepth) !== null && _a !== void 0 ? _a : 8;
    if (bitDepth !== 8 && bitDepth !== 16) {
        throw new Error('Invalid bit depth. Must be either 8 or 16.');
    }
    const compressionName = (_b = options === null || options === void 0 ? void 0 : options.compression) !== null && _b !== void 0 ? _b : 'fastest';
    const compression = COMPRESSION_LEVELS[compressionName];
    // Validated here so the error names the option, rather than reaching the
    // codec as an out-of-range integer and panicking.
    if (compression === undefined) {
        throw new Error(`Invalid compression '${compressionName}'. Expected one of: ${Object.keys(COMPRESSION_LEVELS).join(', ')}.`);
    }
    const isUint16Array = data.data instanceof Uint16Array;
    if (isUint16Array && bitDepth !== 16) {
        throw new Error('Invalid bit depth, must be 16 for Uint16Array or manually convert to RGB8 values with Uint8Array.');
    }
    if (!isUint16Array && bitDepth === 16) {
        throw new Error('Invalid bit depth, must be 8 for Uint8Array or manually convert to RGB16 values with Uint16Array.');
    }
    // `data` may be a view into a larger buffer, so the offset and length
    // have to be carried across rather than reading `.buffer` wholesale.
    const encodeData = new Uint8Array(data.data.buffer, data.data.byteOffset, data.data.byteLength);
    // Validated on this side of the boundary so the error names the actual
    // problem, and kept out of the no-profile path so that call stays exactly
    // what it was.
    const icc = options.icc === undefined ? undefined : toIccProfileBytes(options.icc);
    return use(async () => {
        const output = icc === undefined
            ? await pngEncode(encodeData, data.width, data.height, bitDepth, compression)
            : await pngEncodeWithIccProfile(encodeData, data.width, data.height, bitDepth, compression, icc);
        if (!output)
            throw new Error('Encoding error.');
        return output.buffer;
    });
}
