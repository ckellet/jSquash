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
import type { EncodeOptions } from './codec/enc/jxl_enc.js';

export { EncodeOptions };

/**
 * Metadata carried alongside the pixels rather than inside them.
 *
 * The shape is deliberately shared across the jSquash codecs so a profile read
 * from one format can be handed straight to another's encoder. See
 * `docs/colour-management.md`.
 */
export interface ImageMetadata {
  /**
   * Raw ICC profile describing **the pixels you were handed**, starting at the
   * profile header.
   *
   * For JXL that is always sRGB, because the decoder converts: libjxl hands
   * back the image in whatever space it chose and skcms transforms it to sRGB
   * before it crosses the wasm boundary. Reporting the source profile here
   * would describe these pixels wrongly. To find out what space the *file* was
   * authored in, use `readIccProfile`.
   */
  icc?: Uint8Array;
  /**
   * Raw EXIF payload, starting at the TIFF header ("II"/"MM"), without any
   * container-specific prefix.
   *
   * Not populated by `@jsquash/jxl`: reading it needs `JXL_DEC_BOX` in the
   * decoder's subscription mask. The field is declared so the type does not
   * change when it is.
   */
  exif?: Uint8Array;
}

/** An image plus whatever metadata travelled with it. */
export interface DecodedImage<T = ImageData> {
  image: T;
  metadata: ImageMetadata;
}

export const label = 'JPEG XL (beta)';
export const mimeType = 'image/jxl';
export const extension = 'jxl';
export const defaultOptions: EncodeOptions = {
  effort: 7,
  quality: 75,
  progressive: false,
  epf: -1,
  lossyPalette: false,
  decodingSpeedTier: 0,
  photonNoiseIso: 0,
  lossyModular: false,
  lossless: false,
};
