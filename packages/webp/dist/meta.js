export const label = 'WebP';
export const mimeType = 'image/webp';
export const extension = 'webp';
// These come from struct WebPConfig in encode.h.
export const defaultOptions = {
    quality: 75,
    target_size: 0,
    target_PSNR: 0,
    method: 4,
    sns_strength: 50,
    filter_strength: 60,
    filter_sharpness: 0,
    filter_type: 1,
    partitions: 0,
    segments: 4,
    pass: 1,
    show_compressed: 0,
    preprocessing: 0,
    autofilter: 0,
    partition_limit: 0,
    alpha_compression: 1,
    alpha_filtering: 1,
    alpha_quality: 100,
    lossless: 0,
    exact: 0,
    image_hint: 0,
    emulate_jpeg_size: 0,
    thread_level: 0,
    low_memory: 0,
    near_lossless: 100,
    use_delta_palette: 0,
    use_sharp_yuv: 0,
};
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
