/**
 * Structural similarity, computed on the luma plane with a sliding 8x8 window.
 *
 * This is the Wang et al. formulation with the standard constants. It is here
 * so encoder changes can be judged on quality-per-byte rather than byte count
 * alone - a change that shrinks output by degrading the image is not a win.
 */

const C1 = (0.01 * 255) ** 2;
const C2 = (0.03 * 255) ** 2;

/** BT.601 luma, matching what the JPEG/WebP encoders use internally. */
export function toLuma({ data, width, height }) {
  const luma = new Float64Array(width * height);
  for (let i = 0; i < width * height; i += 1) {
    const o = i * 4;
    luma[i] = 0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2];
  }
  return luma;
}

export function ssim(a, b) {
  if (a.width !== b.width || a.height !== b.height) {
    throw new Error(
      `ssim: dimension mismatch ${a.width}x${a.height} vs ${b.width}x${b.height}`,
    );
  }

  const { width, height } = a;
  const lumaA = toLuma(a);
  const lumaB = toLuma(b);

  const win = 8;
  const stride = 4;
  let total = 0;
  let windows = 0;

  for (let y = 0; y + win <= height; y += stride) {
    for (let x = 0; x + win <= width; x += stride) {
      let sumA = 0;
      let sumB = 0;
      let sumAA = 0;
      let sumBB = 0;
      let sumAB = 0;

      for (let wy = 0; wy < win; wy += 1) {
        let idx = (y + wy) * width + x;
        for (let wx = 0; wx < win; wx += 1, idx += 1) {
          const va = lumaA[idx];
          const vb = lumaB[idx];
          sumA += va;
          sumB += vb;
          sumAA += va * va;
          sumBB += vb * vb;
          sumAB += va * vb;
        }
      }

      const n = win * win;
      const meanA = sumA / n;
      const meanB = sumB / n;
      const varA = sumAA / n - meanA * meanA;
      const varB = sumBB / n - meanB * meanB;
      const covAB = sumAB / n - meanA * meanB;

      total +=
        ((2 * meanA * meanB + C1) * (2 * covAB + C2)) /
        ((meanA * meanA + meanB * meanB + C1) * (varA + varB + C2));
      windows += 1;
    }
  }

  return windows ? total / windows : 1;
}

export function psnr(a, b) {
  const lumaA = toLuma(a);
  const lumaB = toLuma(b);
  let mse = 0;
  for (let i = 0; i < lumaA.length; i += 1) {
    mse += (lumaA[i] - lumaB[i]) ** 2;
  }
  mse /= lumaA.length;
  return mse === 0 ? Infinity : 10 * Math.log10(255 ** 2 / mse);
}
