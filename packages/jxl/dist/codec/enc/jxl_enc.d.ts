export interface EncodeOptions {
  effort: number;
  quality: number;
  progressive: boolean;
  epf: number;
  lossyPalette: boolean;
  decodingSpeedTier: number;
  photonNoiseIso: number;
  lossyModular: boolean;
  lossless: boolean;
}

export interface JXLModule extends EmscriptenWasm.Module {
  /** Allocate `size` bytes inside the module heap; returns a pointer. */
  create_buffer(size: number): number;
  /** Release a pointer previously returned by create_buffer. */
  destroy_buffer(pointer: number): void;
  encode(
    pointer: number,
    width: number,
    height: number,
    options: EncodeOptions,
  ): Uint8Array | null;
}

declare var moduleFactory: EmscriptenWasm.ModuleFactory<JXLModule>;

export default moduleFactory;
