export { default as encode, init as initEncode, dispose as disposeEncoder, } from './encode.js';
export { default as decode, init as initDecode, dispose as disposeDecoder, decodeWithMetadata, readIccProfile, } from './decode.js';
import { dispose as disposeEncoderFn } from './encode.js';
import { dispose as disposeDecoderFn } from './decode.js';
/** Release both the encoder and decoder modules. See their docs for caveats. */
export function dispose() {
    disposeEncoderFn();
    disposeDecoderFn();
}
