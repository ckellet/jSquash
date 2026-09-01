/**
 * The encoder, minus the decision about which build to run it on.
 *
 * `encode.js` picks a build at runtime, which is the right default but means
 * a bundler sees every variant and emits every `.wasm` - including the 3.3 MB
 * threaded build, which cannot load at all unless the page is cross-origin
 * isolated. The `encode-simd.js`, `encode-mt.js` and `encode-scalar.js` entry
 * points bind one build statically instead, so an application that already
 * knows its target pays for one binary. Both routes share this implementation
 * so they cannot drift apart.
 */
import type { AVIFModule } from './codec/enc/avif_enc.js';
import type { EncodeOptions, ImageData16bit } from './meta.js';
/** Resolves the Emscripten factory for whichever build was selected. */
export type CodecLoader = () => Promise<EmscriptenWasm.ModuleFactory<AVIFModule>>;
export declare function createEncoder(loadCodec: CodecLoader): {
    init: (module?: WebAssembly.Module | Partial<EmscriptenWasm.ModuleOpts> | null | undefined, moduleOptionOverrides?: Partial<EmscriptenWasm.ModuleOpts> | undefined) => Promise<AVIFModule>;
    dispose: () => void;
    encode: {
        (data: ImageData): Promise<ArrayBuffer>;
        (data: ImageData, options: Partial<EncodeOptions> & {
            bitDepth?: 8;
        }): Promise<ArrayBuffer>;
        (data: ImageData16bit, options: Partial<EncodeOptions> & {
            bitDepth: 10 | 12;
        }): Promise<ArrayBuffer>;
    };
};
//# sourceMappingURL=encode-core.d.ts.map