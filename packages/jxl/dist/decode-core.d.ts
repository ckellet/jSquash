/**
 * The decoder, minus the decision about which build to run it on.
 * See `encode-core.ts` for why this split exists.
 */
import type { JXLModule } from './codec/dec/jxl_dec.js';
import type { DecodedImage } from './meta.js';
export type CodecLoader = () => Promise<EmscriptenWasm.ModuleFactory<JXLModule>>;
export declare function createDecoder(loadCodec: CodecLoader): {
    init: (module?: WebAssembly.Module | Partial<EmscriptenWasm.ModuleOpts> | null | undefined, moduleOptionOverrides?: Partial<EmscriptenWasm.ModuleOpts> | undefined) => Promise<JXLModule>;
    dispose: () => void;
    decode: (buffer: ArrayBuffer) => Promise<ImageData>;
    decodeWithMetadata: (buffer: ArrayBuffer) => Promise<DecodedImage<ImageData>>;
    readIccProfile: (buffer: ArrayBuffer) => Promise<Uint8Array | undefined>;
};
//# sourceMappingURL=decode-core.d.ts.map