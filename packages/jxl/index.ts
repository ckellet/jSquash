export {
  default as encode,
  init as initEncode,
  dispose as disposeEncoder,
} from './encode.js';
export {
  default as decode,
  init as initDecode,
  dispose as disposeDecoder,
} from './decode.js';
export { EncodeOptions } from './meta.js';
import { dispose as disposeEncoderFn } from './encode.js';
import { dispose as disposeDecoderFn } from './decode.js';

/** Release both the encoder and decoder modules. See their docs for caveats. */
export function dispose(): void {
  disposeEncoderFn();
  disposeDecoderFn();
}
