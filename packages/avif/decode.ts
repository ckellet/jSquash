/**
 * Copyright 2020 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * Notice: I (Jamie Sinclair) have copied this code from the JPEG encode module
 * and modified it to decode JPEG images.
 */

import type { AVIFModule } from './codec/dec/avif_dec.js';
import { disposeEmscriptenModule, initEmscriptenModule } from './utils.js';

import avif_dec from './codec/dec/avif_dec.js';
import type { DecodedImage, ImageData16bit, ImageMetadata } from './meta.js';

export type { DecodedImage, ImageMetadata };

let emscriptenModule: Promise<AVIFModule> | undefined;

export async function init(
  moduleOptionOverrides?: Partial<EmscriptenWasm.ModuleOpts>,
): Promise<AVIFModule>;
export async function init(
  module?: WebAssembly.Module,
  moduleOptionOverrides?: Partial<EmscriptenWasm.ModuleOpts>,
): Promise<AVIFModule> {
  let actualModule: WebAssembly.Module | undefined = module;
  let actualOptions: Partial<EmscriptenWasm.ModuleOpts> | undefined =
    moduleOptionOverrides;

  // If only one argument is provided and it's not a WebAssembly.Module
  if (arguments.length === 1 && !(module instanceof WebAssembly.Module)) {
    actualModule = undefined;
    actualOptions = module as unknown as Partial<EmscriptenWasm.ModuleOpts>;
  }

  emscriptenModule = initEmscriptenModule(
    avif_dec,
    actualModule,
    actualOptions,
  );
  return emscriptenModule;
}

type DecodeOptions = {
  bitDepth?: 8 | 10 | 12 | 16;
};

/**
 * Release the module so its WebAssembly.Memory can be garbage collected.
 *
 * Emscripten heaps grow but never shrink, so a long-lived worker that has
 * decoded a single large image holds that peak allocation for the rest of
 * its life. The next call re-instantiates the module on demand.
 */
export function dispose(): void {
  const pending = emscriptenModule;
  emscriptenModule = undefined;
  disposeEmscriptenModule(pending);
}

export default async function decode(
  buffer: ArrayBuffer,
): Promise<ImageData | null>;
export default async function decode(
  buffer: ArrayBuffer,
  options: { bitDepth?: 8 },
): Promise<ImageData | null>;
export default async function decode(
  buffer: ArrayBuffer,
  options: { bitDepth: 10 | 12 | 16 },
): Promise<ImageData16bit | null>;
export default async function decode(
  buffer: ArrayBuffer,
  options?: DecodeOptions,
): Promise<ImageData | ImageData16bit | null> {
  if (!emscriptenModule) {
    emscriptenModule = init();
  }

  const module = await emscriptenModule;
  const bitDepth = options?.bitDepth ?? 8;
  const result = module.decode(buffer, bitDepth);
  if (!result) throw new Error('Decoding error');
  return result;
}

/**
 * Decode an image and return it together with its embedded metadata.
 *
 * Separate from `decode` rather than an option on it because it returns
 * something else. Switching a return type on a flag makes the common call -
 * `const image = await decode(buf)` - depend on a value TypeScript can only
 * narrow when the flag is a literal, so anyone building an options object
 * dynamically ends up with a union to unpick. `decode` stays exactly as it was,
 * and callers who want metadata reach for a different name.
 *
 * The wrapper shape is the same whichever bit depth is asked for, even though
 * `decode` itself returns a real `ImageData` at 8 bits and a plain object above
 * it.
 *
 * The ICC profile is the only metadata surfaced today; `metadata.exif` is
 * always absent. See `docs/colour-management.md`.
 */
export async function decodeWithMetadata(
  buffer: ArrayBuffer,
): Promise<DecodedImage<ImageData>>;
export async function decodeWithMetadata(
  buffer: ArrayBuffer,
  options: { bitDepth?: 8 },
): Promise<DecodedImage<ImageData>>;
export async function decodeWithMetadata(
  buffer: ArrayBuffer,
  options: { bitDepth: 10 | 12 | 16 },
): Promise<DecodedImage<ImageData16bit>>;
export async function decodeWithMetadata(
  buffer: ArrayBuffer,
  options?: DecodeOptions,
): Promise<DecodedImage<ImageData | ImageData16bit>> {
  if (!emscriptenModule) {
    emscriptenModule = init();
  }

  const module = await emscriptenModule;
  const bitDepth = options?.bitDepth ?? 8;

  const image = module.decode(buffer, bitDepth);
  if (!image) throw new Error('Decoding error');

  // A second pass over the same input, which parses the container's boxes
  // rather than decoding anything. That costs one more copy of the
  // *compressed* bytes across the wasm boundary and buys a pixel path that is
  // untouched for callers who never ask for metadata.
  const icc = module.read_icc_profile(buffer);

  const metadata: ImageMetadata = {};
  if (icc && icc.length > 0) metadata.icc = icc;

  return { image, metadata };
}

/**
 * Read an image's ICC profile without decoding any pixels.
 *
 * Returns `undefined` when the image carries no profile, or when the profile
 * is there but unreadable - metadata is advisory, and a file whose pixels
 * decode perfectly well should not fail over it.
 */
export async function readIccProfile(
  buffer: ArrayBuffer,
): Promise<Uint8Array | undefined> {
  if (!emscriptenModule) {
    emscriptenModule = init();
  }

  const module = await emscriptenModule;
  const icc = module.read_icc_profile(buffer);
  return icc && icc.length > 0 ? icc : undefined;
}
