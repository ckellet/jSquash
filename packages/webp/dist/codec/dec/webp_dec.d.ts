export interface WebPModule extends EmscriptenWasm.Module {
  decode(data: BufferSource): ImageData | null;
  /**
   * Raw contents of the file's ICCP chunk, or null when it has none or the
   * container cannot be parsed. Never throws.
   */
  read_icc_profile(data: BufferSource): Uint8Array | null;
}

declare var moduleFactory: EmscriptenWasm.ModuleFactory<WebPModule>;

export default moduleFactory;
