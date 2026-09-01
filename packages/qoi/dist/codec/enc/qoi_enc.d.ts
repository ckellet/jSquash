export interface QOIModule extends EmscriptenWasm.Module {
  /** Allocate `size` bytes inside the module heap; returns a pointer. */
  create_buffer(size: number): number;
  /** Release a pointer previously returned by create_buffer. */
  destroy_buffer(pointer: number): void;
    encode(
        pointer: number,
        width: number,
        height: number
    ): Uint8Array;
}

declare var moduleFactory: EmscriptenWasm.ModuleFactory<QOIModule>;

export default moduleFactory;
