/* tslint:disable */
/* eslint-disable */
/**
* @param {Uint8Array} data
* @param {number} width
* @param {number} height
* @param {number} bit_depth
* @param {number} compression
* @returns {Uint8Array}
*/
export function encode(data: Uint8Array, width: number, height: number, bit_depth: number, compression: number): Uint8Array;
/**
* @param {Uint8Array} data
* @returns {ImageDataRGBA16}
*/
export function decode_rgba16(data: Uint8Array): ImageDataRGBA16;
/**
* As `encode`, but embeds `icc_profile` as an `iCCP` chunk.
*
* Kept separate from `encode` rather than added as an optional argument so the
* common path keeps its exact signature and does no extra work.
* @param {Uint8Array} data
* @param {number} width
* @param {number} height
* @param {number} bit_depth
* @param {number} compression
* @param {Uint8Array} icc_profile
* @returns {Uint8Array}
*/
export function encode_with_icc_profile(data: Uint8Array, width: number, height: number, bit_depth: number, compression: number, icc_profile: Uint8Array): Uint8Array;
/**
* Read the `iCCP` chunk without decoding any pixels.
*
* Decoding stops at the first `IDAT`, so this is a header parse plus one small
* inflate rather than a second decode. Keeping it separate from `decode` is
* what lets the pixel path stay byte-for-byte unchanged for callers who never
* ask for metadata.
*
* Returns `None` rather than throwing whenever the profile cannot be read.
* Metadata is advisory: a file whose pixels decode perfectly well should not
* start failing because an ancillary chunk is malformed.
* @param {Uint8Array} data
* @returns {Uint8Array | undefined}
*/
export function read_icc_profile(data: Uint8Array): Uint8Array | undefined;
/**
* @param {Uint8Array} data
* @returns {ImageData}
*/
export function decode(data: Uint8Array): ImageData;
/**
*/
export class ImageDataRGBA16 {
  free(): void;
/**
*/
  readonly data: Uint16Array;
/**
*/
  readonly height: number;
/**
*/
  readonly width: number;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly __wbg_imagedatargba16_free: (a: number) => void;
  readonly decode: (a: number, b: number) => number;
  readonly decode_rgba16: (a: number, b: number) => number;
  readonly encode: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => void;
  readonly encode_with_icc_profile: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => void;
  readonly imagedatargba16_data: (a: number) => number;
  readonly imagedatargba16_height: (a: number) => number;
  readonly imagedatargba16_width: (a: number) => number;
  readonly read_icc_profile: (a: number, b: number, c: number) => void;
  readonly __wbindgen_free: (a: number, b: number, c: number) => void;
  readonly __wbindgen_add_to_stack_pointer: (a: number) => number;
  readonly __wbindgen_malloc: (a: number, b: number) => number;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;
/**
* Instantiates the given `module`, which can either be bytes or
* a precompiled `WebAssembly.Module`.
*
* @param {SyncInitInput} module
*
* @returns {InitOutput}
*/
export function initSync(module: SyncInitInput): InitOutput;

/**
* If `module_or_path` is {RequestInfo} or {URL}, makes a request and
* for everything else, calls `WebAssembly.instantiate` directly.
*
* @param {InitInput | Promise<InitInput>} module_or_path
*
* @returns {Promise<InitOutput>}
*/
export default function __wbg_init (module_or_path?: InitInput | Promise<InitInput>): Promise<InitOutput>;
/**
* Release the instantiated module so its WebAssembly.Memory can be
* garbage collected. The next init() call instantiates a fresh one.
*/
export function dispose(): void;
