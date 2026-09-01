/**
 * The encoder, minus the decision about which build to run it on.
 *
 * `encode.js` picks a build at runtime, which is the right default but means
 * a bundler sees every variant and emits every `.wasm` - including the 3.3 MB
 * threaded build, which cannot load at all unless the page is cross-origin
 * isolated. The `encode-simd.js`, `encode-mt.js` and `encode-scalar.js` entry
 * points bind one build statically instead, so an application that already
 * knows its target pays for one binary. Both routes share this implementation
 * so they cannot drift apart.
 */
import type { AVIFModule } from './codec/enc/avif_enc.js';
import type { EncodeOptions, ImageData16bit } from './meta.js';

import { defaultOptions, toIccProfileBytes } from './meta.js';
import { createModuleCache, withPixelBuffer } from './utils.js';

/** Resolves the Emscripten factory for whichever build was selected. */
export type CodecLoader = () => Promise<
  EmscriptenWasm.ModuleFactory<AVIFModule>
>;

export function createEncoder(loadCodec: CodecLoader) {
  const codecModule = createModuleCache<AVIFModule>(loadCodec);

  /**
   * Instantiate the module up front, optionally from wasm you supply.
   *
   * Both the module and the option overrides are remembered, so the
   * re-instantiation after a `dispose()` uses them again rather than falling
   * back to fetching the binary - which is not something every runtime this
   * library targets can do.
   */
  const init = codecModule.init;

  /**
   * Release the module so its WebAssembly.Memory can be garbage collected.
   *
   * Emscripten heaps grow but never shrink, so a long-lived worker that has
   * encoded a single large image holds that peak allocation for the rest of
   * its life. The next call re-instantiates the module on demand.
   *
   * Safe to call with encodes outstanding: each keeps the module it is running
   * on, and the reclaim happens once the last of them has finished.
   */
  const dispose = codecModule.dispose;

  function encode(data: ImageData): Promise<ArrayBuffer>;
  function encode(
    data: ImageData,
    options: Partial<EncodeOptions> & { bitDepth?: 8 },
  ): Promise<ArrayBuffer>;
  function encode(
    data: ImageData16bit,
    options: Partial<EncodeOptions> & { bitDepth: 10 | 12 },
  ): Promise<ArrayBuffer>;
  async function encode(
    data: ImageData | ImageData16bit,
    options: Partial<EncodeOptions> = {},
  ): Promise<ArrayBuffer> {
    const _options = { ...defaultOptions, ...options };

    if (
      _options.bitDepth !== 8 &&
      _options.bitDepth !== 10 &&
      _options.bitDepth !== 12
    ) {
      throw new Error('Invalid bit depth. Supported values are 8, 10, or 12.');
    }

    if (!(data.data instanceof Uint16Array) && _options.bitDepth !== 8) {
      throw new Error(
        'Invalid image data for bit depth. Must use Uint16Array for bit depths greater than 8.',
      );
    }

    if (_options.lossless) {
      if (options.quality !== undefined && options.quality !== 100) {
        console.warn(
          'AVIF lossless: Quality setting is ignored when lossless is enabled (quality must be 100).',
        );
      }
      if (
        options.qualityAlpha !== undefined &&
        options.qualityAlpha !== 100 &&
        options.qualityAlpha !== -1
      ) {
        console.warn(
          'AVIF lossless: QualityAlpha setting is ignored when lossless is enabled (qualityAlpha must be 100 or -1).',
        );
      }
      if (options.subsample !== undefined && options.subsample !== 3) {
        console.warn(
          'AVIF lossless: Subsample setting is ignored when lossless is enabled (subsample must be 3 for YUV444).',
        );
      }

      _options.quality = 100;
      _options.qualityAlpha = -1;
      _options.subsample = 3;
    }

    // Validated on this side of the boundary so the error names the actual
    // problem, and thrown before any encoding work is done. Kept out of the
    // no-profile path so that call stays exactly what it was.
    const icc =
      _options.icc === undefined ? undefined : toIccProfileBytes(_options.icc);

    // `data` may be a view into a larger buffer, so the offset and length have
    // to be carried across rather than reading `.buffer` wholesale. Going via
    // byteLength rather than the element count is also what makes this work
    // for both depths: 4 bytes per pixel at 8-bit, 8 at 10/12-bit.
    const pixels = new Uint8Array(
      data.data.buffer,
      data.data.byteOffset,
      data.data.byteLength,
    );

    return codecModule.use((codec) => {
      const output = withPixelBuffer(codec, pixels, (pointer) =>
        icc === undefined
          ? codec.encode(pointer, data.width, data.height, _options)
          : withPixelBuffer(codec, icc, (iccPointer) =>
              codec.encode_with_icc(
                pointer,
                data.width,
                data.height,
                _options,
                iccPointer,
                icc.byteLength,
              ),
            ),
      );

      if (!output) {
        throw new Error('Encoding error.');
      }

      return output.buffer;
    });
  }

  return { init, dispose, encode };
}
