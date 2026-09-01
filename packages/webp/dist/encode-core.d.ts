/**
 * The encoder, minus the decision about which build to run it on.
 *
 * `encode.js` picks a build at runtime, which is the right default but means
 * a bundler sees every variant and emits every `.wasm`. The `encode-simd.js`,
 * `encode-scalar.js` entry points bind one build statically instead, so an
 * application that already knows its target pays for one binary. Both routes
 * share this implementation so they cannot drift apart.
 */
import type { WebPModule } from './codec/enc/webp_enc.js';
import type { WebPEncodeOptions } from './meta.js';
/** Resolves the Emscripten factory for whichever build was selected. */
export type CodecLoader = () => Promise<EmscriptenWasm.ModuleFactory<WebPModule>>;
export declare function createEncoder(loadCodec: CodecLoader): {
    init: (module?: WebAssembly.Module | Partial<EmscriptenWasm.ModuleOpts> | null | undefined, moduleOptionOverrides?: Partial<EmscriptenWasm.ModuleOpts> | undefined) => Promise<WebPModule>;
    dispose: () => void;
    encode: (data: ImageData, options?: WebPEncodeOptions) => Promise<ArrayBuffer>;
};
//# sourceMappingURL=encode-core.d.ts.map