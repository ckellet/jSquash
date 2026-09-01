/**
 * The decoder, minus the decision about which build to run it on.
 * See `encode-core.ts` for why this split exists.
 */
import type { AVIFModule } from './codec/dec/avif_dec.js';
import type { DecodedImage, ImageData16bit } from './meta.js';
export type CodecLoader = () => Promise<EmscriptenWasm.ModuleFactory<AVIFModule>>;
export declare function createDecoder(loadCodec: CodecLoader): {
    init: (module?: WebAssembly.Module | Partial<EmscriptenWasm.ModuleOpts> | null | undefined, moduleOptionOverrides?: Partial<EmscriptenWasm.ModuleOpts> | undefined) => Promise<AVIFModule>;
    dispose: () => void;
    decode: {
        (buffer: ArrayBuffer): Promise<ImageData>;
        (buffer: ArrayBuffer, options: {
            bitDepth?: 8;
        }): Promise<ImageData>;
        (buffer: ArrayBuffer, options: {
            bitDepth: 10 | 12 | 16;
        }): Promise<ImageData16bit>;
    };
    decodeWithMetadata: {
        (buffer: ArrayBuffer): Promise<DecodedImage<ImageData>>;
        (buffer: ArrayBuffer, options: {
            bitDepth?: 8;
        }): Promise<DecodedImage<ImageData>>;
        (buffer: ArrayBuffer, options: {
            bitDepth: 10 | 12 | 16;
        }): Promise<DecodedImage<ImageData16bit>>;
    };
    readIccProfile: (buffer: ArrayBuffer) => Promise<Uint8Array | undefined>;
};
//# sourceMappingURL=decode-core.d.ts.map