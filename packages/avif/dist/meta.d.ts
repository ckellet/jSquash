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
import { EncodeOptions as RawEncodeOptions, AVIFTune } from './codec/enc/avif_enc.js';
export { AVIFTune };
export type EncodeOptions = RawEncodeOptions & {
    lossless: boolean;
    /**
     * ICC profile to embed, as handed back by `decodeWithMetadata`. Omit it and
     * the output carries no profile, exactly as before.
     *
     * The pixels are written unchanged: this is passthrough, not conversion. The
     * profile must therefore be the one the pixels are already in.
     */
    icc?: IccProfileInput;
};
export type ImageData16bit = {
    data: Uint16Array;
    width: number;
    height: number;
};
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
     * Raw ICC profile, starting at the profile header. For AVIF this is the
     * contents of the `colr` box with colour type `prof`.
     */
    icc?: Uint8Array;
    /**
     * Raw EXIF payload, starting at the TIFF header ("II"/"MM"), without any
     * container-specific prefix.
     *
     * Not populated by `@jsquash/avif` yet. libavif already parses AVIF's Exif
     * item into `image->exif`, so surfacing it is glue only; the field is
     * declared so the type does not change when it lands.
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
export declare function toIccProfileBytes(icc: IccProfileInput): Uint8Array;
export declare const label = "AVIF";
export declare const mimeType = "image/avif";
export declare const extension = "avif";
export declare const defaultOptions: EncodeOptions;
//# sourceMappingURL=meta.d.ts.map