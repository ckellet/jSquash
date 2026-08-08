use magic_kernel::{magic_resize, ImageF64, Version};
use wasm_bindgen::prelude::*;
use wasm_bindgen::Clamped;

const RGBA_CHANNEL_SIZE: u8 = 4;

// Custom ImageData bindings to allow construction with
// a JS-owned copy of the data.
#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(typescript_type = ImageData)]
    pub type ImageData;

    #[wasm_bindgen(constructor)]
    fn new_with_owned_u8_clamped_array_and_sh(
        data: Clamped<Vec<u8>>,
        sw: u32,
        sh: u32,
    ) -> ImageData;
}

fn srgb_to_linear(v: f64) -> f64 {
    if v < 0.04045 {
        v / 12.92
    } else {
        ((v + 0.055) / 1.055).powf(2.4).clamp(0.0, 1.0)
    }
}

fn linear_to_srgb(v: f64) -> f64 {
    if v < 0.0031308 {
        v * 12.92
    } else {
        (1.055 * v.powf(1.0 / 2.4) - 0.055).clamp(0.0, 1.0)
    }
}

// Resampling happens on 0..=255 values, so the sRGB transfer function is
// applied over a 256-entry table rather than once per subpixel.
fn srgb_to_linear_lut() -> [f64; 256] {
    let mut lut = [0.0f64; 256];
    for (i, entry) in lut.iter_mut().enumerate() {
        *entry = srgb_to_linear(i as f64 / 255.0) * 255.0;
    }
    lut
}

/// Convert interleaved RGBA bytes into the f64 image the magic kernel
/// resampler operates on, optionally converting to linear light and
/// premultiplying alpha so that the resample is performed in the same space
/// as the `resize` module.
fn convert_from_rgba_u8_slice(
    data: &[u8],
    width: usize,
    height: usize,
    premultiply: bool,
    linear_rgb: bool,
) -> ImageF64 {
    let data_f64: Vec<f64> = if !premultiply && !linear_rgb {
        data.iter().map(|x| *x as f64).collect()
    } else {
        let lut = srgb_to_linear_lut();
        let to_linear = |v: u8| if linear_rgb { lut[v as usize] } else { v as f64 };

        let mut out = vec![0.0f64; data.len()];
        for (pixel, chunk) in data.chunks_exact(4).enumerate() {
            let alpha = chunk[3] as f64;
            let alpha_scale = if premultiply { alpha / 255.0 } else { 1.0 };
            let base = pixel * 4;
            for channel in 0..3 {
                out[base + channel] = to_linear(chunk[channel]) * alpha_scale;
            }
            out[base + 3] = alpha;
        }
        out
    };

    ImageF64::new(data_f64, RGBA_CHANNEL_SIZE, width as u32, height as u32)
}

/// Convert the resampled f64 image back to RGBA bytes, undoing the
/// premultiply and linear-light conversions applied on the way in.
///
/// Values are rounded rather than truncated. A bare `as u8` cast truncates
/// toward zero, which biases every channel down by ~0.5 levels and visibly
/// darkens the result.
fn convert_to_rgba_u8_vec(buf: Vec<f64>, premultiply: bool, linear_rgb: bool) -> Vec<u8> {
    if !premultiply && !linear_rgb {
        return buf
            .into_iter()
            .map(|x| x.round().clamp(0.0, 255.0) as u8)
            .collect();
    }

    let mut out = vec![0u8; buf.len()];
    for (pixel, chunk) in buf.chunks_exact(4).enumerate() {
        let alpha = chunk[3].clamp(0.0, 255.0);
        let alpha_scale = alpha / 255.0;
        let base = pixel * 4;

        for channel in 0..3 {
            // A fully transparent pixel carries no recoverable colour.
            let demultiplied = if premultiply {
                if alpha_scale > 0.0 {
                    chunk[channel] / alpha_scale
                } else {
                    0.0
                }
            } else {
                chunk[channel]
            };

            let value = if linear_rgb {
                linear_to_srgb((demultiplied / 255.0).clamp(0.0, 1.0)) * 255.0
            } else {
                demultiplied
            };

            out[base + channel] = value.round().clamp(0.0, 255.0) as u8;
        }

        out[base + 3] = alpha.round() as u8;
    }

    out
}

fn get_version_from_string(version: String) -> Version {
    if version == "magicKernelSharp2021" {
        return Version::MagicKernelSharp2021;
    }

    if version == "magicKernelSharp2013" {
        return Version::MagicKernelSharp2013;
    }

    if version == "magicKernel" {
        return Version::MagicKernel;
    }

    panic!("Version not recognized: {}", version);
}

#[wasm_bindgen]
pub fn resize(
    data: &[u8],
    input_width: usize,
    input_height: usize,
    output_width: usize,
    output_height: usize,
    version: String,
    premultiply: bool,
    linear_rgb: bool,
) -> ImageData {
    let resized = magic_resize(
        &convert_from_rgba_u8_slice(
            data,
            input_width,
            input_height,
            premultiply,
            linear_rgb,
        ),
        get_version_from_string(version),
        Some(output_width as u32),
        Some(output_height as u32),
    );

    let buf: Vec<f64> = resized.into();
    let buf = convert_to_rgba_u8_vec(buf, premultiply, linear_rgb);

    ImageData::new_with_owned_u8_clamped_array_and_sh(
        wasm_bindgen::Clamped(buf),
        output_width as u32,
        output_height as u32,
    )
}
