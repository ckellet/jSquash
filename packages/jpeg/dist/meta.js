/** Offset of the mandatory "acsp" signature in an ICC profile header. */
const ICC_SIGNATURE_OFFSET = 36;
/** An ICC profile is a 128-byte header plus at least a 4-byte tag count. */
const ICC_MIN_LENGTH = 132;
/**
 * Normalise caller-supplied profile bytes, rejecting anything that is not one.
 *
 * Validating here rather than in the wasm keeps the error messages useful and
 * costs no binary size. The check is deliberately shallow - a signature and a
 * length, not a tag-table walk - because the contract is passthrough: profiles
 * this library does not understand should still survive a round trip.
 */
export function toIccProfileBytes(icc) {
    let bytes;
    if (icc instanceof Uint8Array) {
        bytes = icc;
    }
    else if (icc instanceof ArrayBuffer) {
        bytes = new Uint8Array(icc);
    }
    else if (ArrayBuffer.isView(icc)) {
        bytes = new Uint8Array(icc.buffer, icc.byteOffset, icc.byteLength);
    }
    else {
        throw new Error('Invalid ICC profile. Expected a Uint8Array, ArrayBuffer or ArrayBufferView.');
    }
    if (bytes.byteLength < ICC_MIN_LENGTH) {
        throw new Error(`Invalid ICC profile. Expected at least ${ICC_MIN_LENGTH} bytes, got ${bytes.byteLength}.`);
    }
    const signature = String.fromCharCode(...bytes.subarray(ICC_SIGNATURE_OFFSET, ICC_SIGNATURE_OFFSET + 4));
    if (signature !== 'acsp') {
        throw new Error(`Invalid ICC profile. Expected an "acsp" signature at byte ${ICC_SIGNATURE_OFFSET}, got "${signature}".`);
    }
    return bytes;
}
export const label = 'MozJPEG';
export const mimeType = 'image/jpeg';
export const extension = 'jpg';
export const defaultOptions = {
    quality: 75,
    baseline: false,
    arithmetic: false,
    progressive: true,
    optimize_coding: true,
    smoothing: 0,
    color_space: 3 /* MozJpegColorSpace.YCbCr */,
    quant_table: 3,
    trellis_multipass: false,
    trellis_opt_zero: false,
    trellis_opt_table: false,
    trellis_loops: 1,
    auto_subsample: true,
    chroma_subsample: 2,
    separate_chroma_quality: false,
    chroma_quality: 75,
};
export const defaultEncodeOptions = defaultOptions;
export const defaultDecodeOptions = {
    preserveOrientation: false,
};
