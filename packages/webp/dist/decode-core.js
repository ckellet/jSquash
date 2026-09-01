import { createModuleCache } from './utils.js';
export function createDecoder(loadCodec) {
    const codecModule = createModuleCache(loadCodec);
    /**
     * Instantiate the module up front, optionally from wasm you supply.
     *
     * The module and options are remembered, so a `dispose()` and the
     * re-instantiation that follows it stay on the same binary.
     */
    const init = codecModule.init;
    /** See the note on the encoder's dispose(). */
    const dispose = codecModule.dispose;
    function decode(buffer) {
        return codecModule.use((codec) => {
            const result = codec.decode(buffer);
            if (!result)
                throw new Error('Decoding error');
            return result;
        });
    }
    /**
     * Decode an image and return it together with its embedded metadata.
     *
     * Separate from `decode` rather than an option on it because it returns
     * something else. Switching a return type on a flag makes the common call -
     * `const image = await decode(buf)` - depend on a value TypeScript can only
     * narrow when the flag is a literal, so anyone building an options object
     * dynamically ends up with a union to unpick. `decode` stays exactly as it
     * was, and callers who want metadata reach for a different name.
     *
     * WebP's `ICCP` chunk is the only metadata surfaced today; `metadata.exif`
     * is always absent. See `docs/colour-management.md`.
     */
    function decodeWithMetadata(buffer) {
        return codecModule.use((codec) => {
            const image = codec.decode(buffer);
            if (!image)
                throw new Error('Decoding error');
            // A second pass over the same input, demuxing the container rather than
            // decoding anything. That costs one more copy of the *compressed* bytes
            // across the wasm boundary and buys a pixel path that is untouched for
            // callers who never ask for metadata.
            const icc = codec.read_icc_profile(buffer);
            const metadata = {};
            if (icc && icc.length > 0)
                metadata.icc = icc;
            return { image, metadata };
        });
    }
    /**
     * Read an image's ICC profile without decoding any pixels.
     *
     * Returns `undefined` when the image carries no profile, or when the profile
     * is there but unreadable - metadata is advisory, and a file whose pixels
     * decode perfectly well should not fail over a malformed ancillary chunk.
     */
    function readIccProfile(buffer) {
        return codecModule.use((codec) => {
            const icc = codec.read_icc_profile(buffer);
            return icc && icc.length > 0 ? icc : undefined;
        });
    }
    return { init, dispose, decode, decodeWithMetadata, readIccProfile };
}
