#[cfg(feature = "parallel")]
pub use wasm_bindgen_rayon::init_thread_pool;

use std::num::NonZeroU64;

use oxipng::{BitDepth, ColorType, Deflater, ZopfliOptions};
use wasm_bindgen::prelude::*;
use wasm_bindgen::Clamped;

/// Build the oxipng options shared by both entry points.
///
/// `zopfli_iterations` is a plain `u8` rather than an `Option` so the wasm
/// boundary stays a scalar: 0 means "leave the preset's libdeflate deflater
/// alone", and any other value swaps in Zopfli with that iteration count.
/// Zopfli searches much harder for a shorter deflate stream than libdeflate
/// does. What that is worth depends on the image - from a fraction of a
/// percent on noisy content to tens of percent on smooth content - and it
/// always costs an order of magnitude or more in time, so it is opt-in and the
/// presets are untouched without it.
fn build_options(
    level: u8,
    interlace: bool,
    optimize_alpha: bool,
    zopfli_iterations: u8,
) -> oxipng::Options {
    let mut options = oxipng::Options::from_preset(level);
    options.interlace = Some(interlace);
    options.optimize_alpha = optimize_alpha;
    if let Some(iteration_count) = NonZeroU64::new(u64::from(zopfli_iterations)) {
        // `iterations_without_improvement` is left at its default, which is
        // `NonZeroU64::MAX` - i.e. never give up early. Exposing it would be a
        // second knob that only matters at iteration counts far above anything
        // this boundary can express.
        options.deflater = Deflater::Zopfli(ZopfliOptions {
            iteration_count,
            ..Default::default()
        });
    }
    options
}

#[wasm_bindgen]
pub fn optimise(
    data: &[u8],
    level: u8,
    interlace: bool,
    optimize_alpha: bool,
    zopfli_iterations: u8,
) -> Vec<u8> {
    let options = build_options(level, interlace, optimize_alpha, zopfli_iterations);

    oxipng::optimize_from_memory(data, &options).unwrap_throw()
}

#[wasm_bindgen]
pub fn optimise_raw(
    data: Clamped<Vec<u8>>,
    width: u32,
    height: u32,
    level: u8,
    interlace: bool,
    optimize_alpha: bool,
    zopfli_iterations: u8,
) -> Vec<u8> {
    let options = build_options(level, interlace, optimize_alpha, zopfli_iterations);

    let raw = oxipng::RawImage::new(width, height, ColorType::RGBA, BitDepth::Eight, data.0)
        .unwrap_throw();
    raw.create_optimized_png(&options).unwrap_throw()
}
