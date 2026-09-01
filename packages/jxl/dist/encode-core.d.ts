/**
 * The encoder, minus the decision about which build to run it on.
 *
 * `encode.js` picks a build at runtime, which is the right default but means
 * a bundler sees every variant and emits every `.wasm`. The `encode-simd.js`,
 * `encode-mt.js` and `encode-scalar.js` entry points bind one build statically
 * instead, so an application that already knows its target pays for one
 * binary. That matters more here than anywhere else in this repo: JXL ships
 * four encoder builds totalling over 6 MB of wasm, half of which cannot even
 * load unless the page is cross-origin isolated. Both routes share this
 * implementation so they cannot drift apart.
 */
import type { EncodeOptions } from './meta.js';
import type { JXLModule } from './codec/enc/jxl_enc.js';
/** Resolves the Emscripten factory for whichever build was selected. */
export type CodecLoader = () => Promise<EmscriptenWasm.ModuleFactory<JXLModule>>;
export declare function createEncoder(loadCodec: CodecLoader): {
    init: (module?: WebAssembly.Module | Partial<EmscriptenWasm.ModuleOpts> | null | undefined, moduleOptionOverrides?: Partial<EmscriptenWasm.ModuleOpts> | undefined) => Promise<JXLModule>;
    dispose: () => void;
    encode: (data: ImageData, options?: Partial<EncodeOptions>) => Promise<ArrayBuffer>;
};
//# sourceMappingURL=encode-core.d.ts.map