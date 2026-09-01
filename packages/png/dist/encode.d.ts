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
import { init, dispose } from './init.js';
import type { IccProfileInput } from './meta.js';
export { init, dispose };
export type { IccProfileInput };
type ImageDataRGBA16 = {
    data: Uint16Array;
    width: number;
    height: number;
};
/**
 * How hard the encoder works to shrink the image data.
 *
 * These are `png`'s own presets, weakest first. `fastest` and `fast` use
 * fdeflate; `balanced` and `high` route the data through flate2, which is
 * much slower and much smaller.
 *
 * The right choice depends on what happens next. If you run the output
 * through `@jsquash/oxipng`, stay on `fastest`: oxipng recompresses the image
 * data from scratch, so anything spent here is spent twice, and it reaches a
 * smaller file than `balanced` does. If this encoder is the last step, and you
 * would rather pay time than bytes, `balanced` is the useful setting.
 *
 * Measured on the 1024x768 bench image: `fastest` is 2.03 MB in 7 ms,
 * `balanced` 1.28 MB in 238 ms, and `fastest` followed by oxipng at level 2
 * is 1.13 MB in about 810 ms.
 */
export type CompressionLevel = 'none' | 'fastest' | 'fast' | 'balanced' | 'high';
export interface EncodeOptions {
    bitDepth?: 8 | 16;
    /**
     * Defaults to `fastest`, which is what this package has always produced.
     * `png` 0.18's own default is `balanced`; taking that silently would have
     * been a 35x slowdown, so it is opt-in. See {@link CompressionLevel}.
     */
    compression?: CompressionLevel;
    /**
     * ICC profile to embed as an `iCCP` chunk, as handed back by
     * `decodeWithMetadata`. Omit it and the output carries no profile, exactly as
     * before - this encoder writes neither `iCCP` nor `sRGB` by default, so a
     * profile is never ambiguous when present.
     *
     * The pixels are written unchanged: this is passthrough, not conversion. The
     * profile must therefore be the one the pixels are already in.
     */
    icc?: IccProfileInput;
}
export default function encode(data: ImageDataRGBA16, options: EncodeOptions & {
    bitDepth: 16;
}): Promise<ArrayBuffer>;
export default function encode(data: ImageData, options?: EncodeOptions & {
    bitDepth?: 8;
}): Promise<ArrayBuffer>;
//# sourceMappingURL=encode.d.ts.map