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
    function decode(buffer, options) {
        var _a;
        const bitDepth = (_a = options === null || options === void 0 ? void 0 : options.bitDepth) !== null && _a !== void 0 ? _a : 8;
        return codecModule.use((codec) => {
            const result = codec.decode(buffer, bitDepth);
            if (!result)
                throw new Error('Decoding error');
            return result;
        });
    }
    function decodeWithMetadata(buffer, options) {
        var _a;
        const bitDepth = (_a = options === null || options === void 0 ? void 0 : options.bitDepth) !== null && _a !== void 0 ? _a : 8;
        return codecModule.use((codec) => {
            const image = codec.decode(buffer, bitDepth);
            if (!image)
                throw new Error('Decoding error');
            // A second pass over the same input, which parses the container's boxes
            // rather than decoding anything. That costs one more copy of the
            // *compressed* bytes across the wasm boundary and buys a pixel path that
            // is untouched for callers who never ask for metadata.
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
     * decode perfectly well should not fail over it.
     */
    function readIccProfile(buffer) {
        return codecModule.use((codec) => {
            const icc = codec.read_icc_profile(buffer);
            return icc && icc.length > 0 ? icc : undefined;
        });
    }
    return { init, dispose, decode, decodeWithMetadata, readIccProfile };
}
