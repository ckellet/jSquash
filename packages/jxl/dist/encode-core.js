import { defaultOptions } from './meta.js';
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
    function encode(data, options = {}) {
        return codecModule.use((codec) => {
            const _options = { ...defaultOptions, ...options };
            if (_options.lossless) {
                if (options.quality !== undefined && options.quality !== 100) {
                    console.warn('JXL lossless: Quality setting is ignored when lossless is enabled (quality must be 100).');
                }
                if (options.lossyModular) {
                    console.warn('JXL lossless: LossyModular setting is ignored when lossless is enabled (lossyModular must be false).');
                }
                if (options.lossyPalette) {
                    console.warn('JXL lossless: LossyPalette setting is ignored when lossless is enabled (lossyPalette must be false).');
                }
                _options.quality = 100;
                _options.lossyModular = false;
                _options.lossyPalette = false;
            }
            const resultView = withPixelBuffer(codec, data.data, (pointer) => codec.encode(pointer, data.width, data.height, _options));
            if (!resultView) {
                throw new Error('Encoding error.');
            }
            return resultView.buffer;
        });
    }
    return { init, dispose, encode };
}
