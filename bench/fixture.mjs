/**
 * Deterministic synthetic test image.
 *
 * Benchmarks need an image large enough for codec time to dominate startup
 * cost, which would mean committing a multi-megabyte binary. Generating one
 * from a seeded PRNG keeps the repository small and the numbers reproducible
 * across machines and runs.
 *
 * The content deliberately mixes smooth gradients, hard edges, saturated
 * colour and fine noise, because encoders behave very differently on each.
 */

/** mulberry32 - small, fast, and stable across engines. */
function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeImage(width = 1024, height = 768, seed = 1) {
  const rand = prng(seed);
  const data = new Uint8ClampedArray(width * height * 4);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const o = (y * width + x) * 4;

      // Smooth two-axis gradient: what chroma subsampling and DCT do well.
      let r = (x / width) * 255;
      let g = (y / height) * 255;
      let b = 128;

      // Hard-edged saturated blocks: ringing and colour bleed show up here.
      if ((x >> 6) % 3 === 0 && (y >> 6) % 3 === 0) {
        r = 220;
        g = 20;
        b = 30;
      }

      // A diagonal edge, to exercise directional prediction.
      if (Math.abs(x - y * (width / height)) < 3) {
        r = 250;
        g = 250;
        b = 250;
      }

      // Fine noise, which is expensive to code and where quality loss shows.
      const n = (rand() - 0.5) * 24;

      data[o] = r + n;
      data[o + 1] = g + n;
      data[o + 2] = b + n;
      // Alpha ramp so premultiply paths are actually exercised.
      data[o + 3] = 128 + Math.round((x / width) * 127);
    }
  }

  return { data, width, height };
}
