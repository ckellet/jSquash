export interface DecodedWithMetadata {
  image: ImageData;
  /**
   * The profile the returned pixels are in, which for JXL is always sRGB -
   * the decoder converts. Absent only if libjxl could not generate it.
   */
  icc?: Uint8Array;
}

export interface JXLModule extends EmscriptenWasm.Module {
  decode(data: BufferSource): ImageData | null;
  decode_with_metadata(data: BufferSource): DecodedWithMetadata | null;
  /** The profile the file declares, or null. Never throws. */
  read_icc_profile(data: BufferSource): Uint8Array | null;
}

declare var moduleFactory: EmscriptenWasm.ModuleFactory<JXLModule>;

export default moduleFactory;
