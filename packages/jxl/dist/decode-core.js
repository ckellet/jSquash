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
     * Decode an image and return it together with its metadata.
     *
     * Separate from `decode` rather than an option on it because it returns
     * something else; see the same note on `@jsquash/png`'s decoder.
     *
     * **`metadata.icc` describes the pixels, not the file.** JXL's decoder
     * converts to sRGB on the way out - libjxl produces the image in whatever
     * space it picked and skcms transforms it before it crosses the wasm
     * boundary - so the profile reported here is sRGB, which is what the
     * returned pixels are actually in. Tagging them with the source profile
     * would be worse than tagging them with nothing. Use `readIccProfile` to
     * find out what space the file itself declares.
     */
    function decodeWithMetadata(buffer) {
        return codecModule.use((codec) => {
            const result = codec.decode_with_metadata(buffer);
            if (!result)
                throw new Error('Decoding error');
            const metadata = {};
            if (result.icc && result.icc.length > 0)
                metadata.icc = result.icc;
            return { image: result.image, metadata };
        });
    }
    /**
     * Read the ICC profile the file declares, without decoding any pixels.
     *
     * This is the *source* profile - the space the image was authored in - and
     * is deliberately not what `decodeWithMetadata` reports, because `decode`
     * does not return pixels in this space. It is the honest answer to "what
     * colour space is this file in?", and because it never travels attached to
     * pixels it cannot mislabel any.
     *
     * Returns `undefined` when the image declares no profile, or when it is
     * there but unreadable: metadata is advisory and never fails an image whose
     * pixels are perfectly good.
     */
    function readIccProfile(buffer) {
        return codecModule.use((codec) => {
            const icc = codec.read_icc_profile(buffer);
            return icc && icc.length > 0 ? icc : undefined;
        });
    }
    return { init, dispose, decode, decodeWithMetadata, readIccProfile };
}
