import { promises as fs } from 'node:fs';
import path from 'node:path';

export async function importWasmModule(path) {
  const fileBuffer = await fs.readFile(path);
  return WebAssembly.compile(fileBuffer);
}

export function getFixturesImage(imagePath: string) {
  const filePath = path.resolve(`fixtures/${imagePath}`);
  return fs.readFile(filePath).then((buffer) => buffer.buffer as ArrayBuffer);
}

/**
 * Narrow a decoder result that is typed as possibly null.
 *
 * The decoders return `null` when they cannot make sense of their input, so
 * every call site has to deal with it. Throwing here fails the test with a
 * useful message rather than a `TypeError` on the next property access.
 */
export function decoded<T>(value: T | null | undefined, what = 'image'): T {
  if (value == null) {
    throw new Error(`Failed to decode ${what}`);
  }
  return value;
}
