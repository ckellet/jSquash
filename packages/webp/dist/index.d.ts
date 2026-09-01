export { default as encode, init as initEncode, dispose as disposeEncoder, } from './encode.js';
export { default as decode, decodeWithMetadata, readIccProfile, init as initDecode, dispose as disposeDecoder, } from './decode.js';
export { toIccProfileBytes } from './meta.js';
export type { DecodedImage, IccProfileInput, ImageMetadata, WebPEncodeOptions, } from './meta.js';
/** Release both the encoder and decoder modules. See their docs for caveats. */
export declare function dispose(): void;
//# sourceMappingURL=index.d.ts.map