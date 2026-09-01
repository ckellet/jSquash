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
 * Changes from source code:
 * - Added defaultOptions
 * - Added `optimiseAlpha` option
 */
export interface OptimiseOptions {
  level: number;
  interlace: boolean;
  optimiseAlpha: boolean;
  /**
   * Compress the image data with Zopfli rather than libdeflate.
   *
   * Zopfli emits an ordinary deflate stream that every PNG decoder already
   * reads - the output is a normal PNG, not a variant - but it searches much
   * harder for a short one. That buys a few percent off the file at a large
   * cost in time, so it is off by default and worth reaching for on assets
   * compressed once and served many times.
   *
   * `level` still applies: it chooses which filters and reductions oxipng
   * tries, and this only changes how the result is compressed.
   */
  zopfli: boolean;
  /**
   * How many Zopfli iterations to run, 1-255. Ignored unless `zopfli` is set.
   *
   * More iterations means a longer search for diminishing gains. 15 is what
   * oxipng's own `--zopfli` uses, and is a reasonable ceiling for small files;
   * large ones want fewer, because the cost grows with the data.
   */
  zopfliIterations: number;
}

export const label = 'OXIPNG';
export const mimeType = 'image/png';
export const extension = 'png';
export const defaultOptions: OptimiseOptions = {
  level: 2,
  interlace: false,
  optimiseAlpha: false,
  zopfli: false,
  zopfliIterations: 15,
};
