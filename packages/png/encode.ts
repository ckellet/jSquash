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

import {
  encode as pngEncode,
  encode_with_icc_profile as pngEncodeWithIccProfile,
} from './codec/pkg/squoosh_png.js';
import { init, dispose, use } from './init.js';
import { toIccProfileBytes } from './meta.js';
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
export type CompressionLevel =
  'none' | 'fastest' | 'fast' | 'balanced' | 'high';

/** Boundary encoding: `png`'s preset order, weakest first. */
const COMPRESSION_LEVELS: Record<CompressionLevel, number> = {
  none: 0,
  fastest: 1,
  fast: 2,
  balanced: 3,
  high: 4,
};

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

export default async function encode(
  data: ImageDataRGBA16,
  options: EncodeOptions & { bitDepth: 16 },
): Promise<ArrayBuffer>;
export default async function encode(
  data: ImageData,
  options?: EncodeOptions & { bitDepth?: 8 },
): Promise<ArrayBuffer>;
export default async function encode(
  data: ImageData | ImageDataRGBA16,
  options: EncodeOptions = {},
): Promise<ArrayBuffer> {
  const bitDepth = options?.bitDepth ?? 8;

  if (bitDepth !== 8 && bitDepth !== 16) {
    throw new Error('Invalid bit depth. Must be either 8 or 16.');
  }

  const compressionName = options?.compression ?? 'fastest';
  const compression = COMPRESSION_LEVELS[compressionName];
  // Validated here so the error names the option, rather than reaching the
  // codec as an out-of-range integer and panicking.
  if (compression === undefined) {
    throw new Error(
      `Invalid compression '${compressionName}'. Expected one of: ${Object.keys(
        COMPRESSION_LEVELS,
      ).join(', ')}.`,
    );
  }

  const isUint16Array = data.data instanceof Uint16Array;
  if (isUint16Array && bitDepth !== 16) {
    throw new Error(
      'Invalid bit depth, must be 16 for Uint16Array or manually convert to RGB8 values with Uint8Array.',
    );
  }
  if (!isUint16Array && bitDepth === 16) {
    throw new Error(
      'Invalid bit depth, must be 8 for Uint8Array or manually convert to RGB16 values with Uint16Array.',
    );
  }

  // `data` may be a view into a larger buffer, so the offset and length
  // have to be carried across rather than reading `.buffer` wholesale.
  const encodeData = new Uint8Array(
    data.data.buffer,
    data.data.byteOffset,
    data.data.byteLength,
  );

  // Validated on this side of the boundary so the error names the actual
  // problem, and kept out of the no-profile path so that call stays exactly
  // what it was.
  const icc =
    options.icc === undefined ? undefined : toIccProfileBytes(options.icc);

  return use(async () => {
    const output =
      icc === undefined
        ? await pngEncode(
            encodeData,
            data.width,
            data.height,
            bitDepth,
            compression,
          )
        : await pngEncodeWithIccProfile(
            encodeData,
            data.width,
            data.height,
            bitDepth,
            compression,
            icc,
          );
    if (!output) throw new Error('Encoding error.');

    return output.buffer;
  });
}
