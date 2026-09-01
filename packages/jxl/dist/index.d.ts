export { default as encode, init as initEncode, dispose as disposeEncoder, } from './encode.js';
export { default as decode, init as initDecode, dispose as disposeDecoder, decodeWithMetadata, readIccProfile, } from './decode.js';
export { EncodeOptions } from './meta.js';
export type { DecodedImage, ImageMetadata } from './meta.js';
/** Release both the encoder and decoder modules. See their docs for caveats. */
export declare function dispose(): void;
//# sourceMappingURL=index.d.ts.map