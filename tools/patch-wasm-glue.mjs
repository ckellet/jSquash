#!/usr/bin/env node
/**
 * Post-processes the JS glue that wasm-pack generates for `--target web`.
 *
 * Two things happen here:
 *
 * 1. The contents of pre.js are appended. These are environment shims (an
 *    ImageData polyfill and friends) for Node and Cloudflare Workers.
 *
 * 2. A `dispose()` export is added.
 *
 *    wasm-bindgen stores the instantiated module in a module-scoped `wasm`
 *    binding and short-circuits `init()` on it, so once a module has been
 *    loaded its WebAssembly.Memory is pinned for the lifetime of the JS
 *    module - there is no way to hand it back. Appending to the generated
 *    file puts this code in that same module scope, which is the only place
 *    the binding and the cached typed-array views over its heap can be
 *    cleared. Both matter: the views hold a reference to the underlying
 *    ArrayBuffer and would keep it alive on their own.
 *
 * Usage: node patch-wasm-glue.mjs <glue.js> [pre.js]
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const MARKER = '// --- jSquash glue patch ---';

const [, , gluePath, prePath = 'pre.js'] = process.argv;

if (!gluePath) {
  console.error('usage: patch-wasm-glue.mjs <glue.js> [pre.js]');
  process.exit(1);
}

let glue = readFileSync(gluePath, 'utf8');

if (glue.includes(MARKER)) {
  console.log(`${gluePath}: already patched, skipping`);
  process.exit(0);
}

// Every `let cachedFooMemory0 = null;` holds a typed-array view over the wasm
// heap. wasm-bindgen adds and removes these depending on which types cross the
// boundary, so discover them rather than hardcoding the list.
const cachedViews = [
  ...glue.matchAll(/^let (cached\w+) = (?:null|undefined);$/gm),
].map((m) => m[1]);

if (!/^let wasm;$/m.test(glue)) {
  console.error(
    `${gluePath}: expected a module-scoped 'let wasm;' binding, found none. ` +
      `The wasm-bindgen output format has changed - review this script.`,
  );
  process.exit(1);
}

const resets = [
  '  wasm = undefined;',
  '  __wbg_init.__wbindgen_wasm_module = undefined;',
  ...cachedViews.map((name) => `  ${name} = null;`),
].join('\n');

const patch = `
${MARKER}

${prePath && existsSync(prePath) ? readFileSync(prePath, 'utf8').trim() : ''}

/**
 * Release the instantiated module so its WebAssembly.Memory can be garbage
 * collected. The next init() call instantiates a fresh one.
 *
 * Only call this once outstanding work has finished - any typed array still
 * pointing into the old heap is detached, and for the threaded builds the
 * worker pool must be idle.
 */
export function dispose() {
${resets}
}
`;

writeFileSync(gluePath, `${glue.trimEnd()}\n${patch}`);

// Keep the type declarations in step, otherwise the TS wrappers cannot see it.
const dtsPath = gluePath.replace(/\.js$/, '.d.ts');
if (existsSync(dtsPath)) {
  const dts = readFileSync(dtsPath, 'utf8');
  if (!dts.includes('export function dispose')) {
    writeFileSync(
      dtsPath,
      `${dts.trimEnd()}\n/**\n* Release the instantiated module so its WebAssembly.Memory can be\n* garbage collected. The next init() call instantiates a fresh one.\n*/\nexport function dispose(): void;\n`,
    );
  }
}

console.log(
  `${gluePath}: patched (cleared bindings: wasm, ${cachedViews.join(', ')})`,
);
