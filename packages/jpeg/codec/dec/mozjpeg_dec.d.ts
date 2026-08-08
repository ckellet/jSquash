/** Raw metadata as the wasm module hands it back. */
export interface RawImageMetadata {
  icc?: Uint8Array;
  exif?: Uint8Array;
}

export interface RawDecodedImage {
  image: ImageData;
  metadata: RawImageMetadata;
}

export interface MozJPEGModule extends EmscriptenWasm.Module {
  decode(data: BufferSource, preserveOrientation: boolean): ImageData | null;
  /** Decode pixels and reassemble the APP2/APP1 markers in the same pass. */
  decode_with_metadata(
    data: BufferSource,
    preserveOrientation: boolean,
  ): RawDecodedImage | null;
  /** Stops after the header, so no pixels are decoded. */
  read_icc_profile(data: BufferSource): Uint8Array | undefined;
}

declare var moduleFactory: EmscriptenWasm.ModuleFactory<MozJPEGModule>;

export default moduleFactory;
