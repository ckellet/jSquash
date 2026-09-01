import { defaultOptions, toIccProfileBytes } from './meta.js';
import { createModuleCache, withPixelBuffer } from './utils.js';
export function createEncoder(loadCodec) {
    const codecModule = createModuleCache(loadCodec);
    /**
     * Instantiate the module up front, optionally from wasm you supply.
     *
     * Both the module and the option overrides are remembered, so the
     * re-instantiation after a `dispose()` uses them again rather than falling
     * back to fetching the binary - which is not something every runtime this
     * library targets can do.
     */
    const init = codecModule.init;
    /**
     * Release the module so its WebAssembly.Memory can be garbage collected.
     *
     * Emscripten heaps grow but never shrink, so a long-lived worker that has
     * encoded a single large image holds that peak allocation for the rest of
     * its life. The next call re-instantiates the module on demand.
     *
     * Safe to call with encodes outstanding: each keeps the module it is running
     * on, and the reclaim happens once the last of them has finished.
     */
    const dispose = codecModule.dispose;
    async function encode(data, options = {}) {
        // `icc` is jSquash's, not libwebp's, so it is peeled off before the rest
        // is handed to the WebPConfig binding.
        const { icc, ...config } = options;
        const _options = { ...defaultOptions, ...config };
        // Validated on this side of the boundary so the error names the actual
        // problem, and eagerly - a bad profile is a caller error, unlike a bad one
        // on the way in - but only when there is one, so the common call stays
        // exactly what it was.
        const profile = icc === undefined ? undefined : toIccProfileBytes(icc);
        return codecModule.use((codec) => {
            const result = withPixelBuffer(codec, data.data, (pointer) => profile === undefined
                ? codec.encode(pointer, data.width, data.height, _options)
                : codec.encode_with_icc_profile(pointer, data.width, data.height, _options, profile));
            if (!result)
                throw new Error('Encoding error.');
            return result.buffer;
        });
    }
    return { init, dispose, encode };
}
