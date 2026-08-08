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

export const label = 'PNG';
export const mimeType = 'image/png';
export const extension = 'png';

/**
 * Metadata carried alongside the pixels rather than inside them.
 *
 * Every field is optional and holds the payload exactly as it was embedded -
 * nothing here is parsed or rewritten. A field is absent when the source did
 * not carry it, which is different from carrying an empty one.
 *
 * The shape is deliberately shared across the jSquash codecs so a profile read
 * from one format can be handed straight to another's encoder. See
 * `docs/colour-management.md`.
 */
export interface ImageMetadata {
  /**
   * Raw ICC profile, starting at the profile header. For PNG this is the
   * inflated contents of the `iCCP` chunk.
   */
  icc?: Uint8Array;
  /**
   * Raw EXIF payload, starting at the TIFF header ("II"/"MM"), without any
   * container-specific prefix.
   *
   * Not populated by `@jsquash/png`: reading PNG's `eXIf` chunk needs a `png`
   * crate bump. The field is declared so the type does not change when it is.
   */
  exif?: Uint8Array;
}

/** An image plus whatever metadata travelled with it. */
export interface DecodedImage<T = ImageData> {
  image: T;
  metadata: ImageMetadata;
}

/**
 * Bytes accepted wherever a caller supplies a profile. Matches what the
 * decoders hand back, plus the `ArrayBuffer` a `fetch` gives you.
 */
export type IccProfileInput = Uint8Array | ArrayBuffer | ArrayBufferView;

/** Offset of the mandatory "acsp" signature in an ICC profile header. */
const ICC_SIGNATURE_OFFSET = 36;
/** An ICC profile is a 128-byte header plus at least a 4-byte tag count. */
const ICC_MIN_LENGTH = 132;

/**
 * Normalise caller-supplied profile bytes, rejecting anything that is not one.
 *
 * Validating here rather than in the wasm keeps the error messages useful and
 * costs no binary size; it also mirrors how this package already checks
 * `bitDepth` before calling across the boundary. The check is deliberately
 * shallow - a signature and a length, not a tag-table walk - because the
 * contract is passthrough: profiles this library does not understand should
 * still survive a round trip.
 */
export function toIccProfileBytes(icc: IccProfileInput): Uint8Array {
  let bytes: Uint8Array;
  if (icc instanceof Uint8Array) {
    bytes = icc;
  } else if (icc instanceof ArrayBuffer) {
    bytes = new Uint8Array(icc);
  } else if (ArrayBuffer.isView(icc)) {
    bytes = new Uint8Array(icc.buffer, icc.byteOffset, icc.byteLength);
  } else {
    throw new Error(
      'Invalid ICC profile. Expected a Uint8Array, ArrayBuffer or ArrayBufferView.',
    );
  }

  if (bytes.byteLength < ICC_MIN_LENGTH) {
    throw new Error(
      `Invalid ICC profile. Expected at least ${ICC_MIN_LENGTH} bytes, got ${bytes.byteLength}.`,
    );
  }

  const signature = String.fromCharCode(
    ...bytes.subarray(ICC_SIGNATURE_OFFSET, ICC_SIGNATURE_OFFSET + 4),
  );
  if (signature !== 'acsp') {
    throw new Error(
      `Invalid ICC profile. Expected an "acsp" signature at byte ${ICC_SIGNATURE_OFFSET}, got "${signature}".`,
    );
  }

  return bytes;
}
