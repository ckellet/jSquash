export const enum AVIFTune {
  auto,
  psnr,
  ssim,
}

export interface EncodeOptions {
  quality: number;
  qualityAlpha: number;
  denoiseLevel: number;
  tileRowsLog2: number;
  tileColsLog2: number;
  speed: number;
  subsample: number;
  chromaDeltaQ: boolean;
  sharpness: number;
  enableSharpYUV: boolean;
  tune: AVIFTune;
  bitDepth: number;
}

export interface AVIFModule extends EmscriptenWasm.Module {
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
  /** As `encode`, but attaches the ICC profile at `iccPointer`. */
  encode_with_icc(
    pointer: number,
    width: number,
    height: number,
    options: EncodeOptions,
    iccPointer: number,
    iccSize: number,
  ): Uint8Array | null;
}

declare var moduleFactory: EmscriptenWasm.ModuleFactory<AVIFModule>;

export default moduleFactory;
