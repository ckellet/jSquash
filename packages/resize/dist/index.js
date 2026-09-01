import { getContainOffsets } from './util.js';
import initResizeWasm, { resize as wasmResize, dispose as disposeResizeWasm, } from './lib/resize/pkg/squoosh_resize.js';
import initHqxWasm, { resize as wasmHqx, dispose as disposeHqxWasm, } from './lib/hqx/pkg/squooshhqx.js';
import initMagicKernelWasm, { resize as wasmMagicKernel, dispose as disposeMagicKernelWasm, } from './lib/magic-kernel/pkg/jsquash_magic_kernel.js';
import { defaultOptions } from './meta.js';
const MAGIC_KERNEL_METHODS = [
    'magicKernel',
    'magicKernelSharp2013',
    'magicKernelSharp2021',
];
/**
 * One module's slot: the instance, the wasm it was built from, and the
 * teardown that gives it back.
 *
 * The input is kept rather than only used, because re-instantiating after a
 * `dispose()` needs a binary and a runtime that cannot fetch its own -
 * Cloudflare Workers being the one this matters for - has no other way to
 * come by one. It has to be usable more than once: a compiled
 * `WebAssembly.Module` or the bytes, not a `Response`.
 */
function createSlot(initWasm, disposeWasm) {
    let ready;
    let retained;
    let retiring = false;
    /** A reclaim that has started but not finished. */
    let teardown;
    return {
        init(moduleOrPath) {
            if (moduleOrPath !== undefined)
                retained = moduleOrPath;
            if (!ready) {
                // Sequenced behind a reclaim that is still running: the generated glue
                // keeps one slot for the module, so an instantiation overlapping a
                // teardown would have its instance torn out from under it.
                const reclaiming = teardown;
                ready = reclaiming
                    ? reclaiming.then(() => initWasm(retained))
                    : initWasm(retained);
            }
            return ready;
        },
        /** Mark for teardown; the reclaim itself waits for the resizes to end. */
        retire() {
            if (ready)
                retiring = true;
        },
        reclaim() {
            if (!retiring)
                return;
            const pending = ready;
            retiring = false;
            ready = undefined;
            if (!pending)
                return;
            // Chained rather than fired straight away: an init() still in flight
            // would otherwise install its instance after the teardown had run. The
            // promise is kept so the next init() can sequence itself behind it.
            const done = pending.then(() => {
                disposeWasm();
            }, () => {
                // Never instantiated, so there is nothing to tear down.
            });
            teardown = done;
            void done.then(() => {
                if (teardown === done)
                    teardown = undefined;
            });
        },
    };
}
const slots = {
    resize: createSlot(initResizeWasm, disposeResizeWasm),
    hqx: createSlot(initHqxWasm, disposeHqxWasm),
    magicKernel: createSlot(initMagicKernelWasm, disposeMagicKernelWasm),
};
/** Resizes in flight. A dispose() waits for these before reclaiming. */
let inFlight = 0;
function reclaim() {
    for (const slot of Object.values(slots))
        slot.reclaim();
}
export function initResize(moduleOrPath) {
    return slots.resize.init(moduleOrPath);
}
export function initHqx(moduleOrPath) {
    return slots.hqx.init(moduleOrPath);
}
export function initMagicKernel(moduleOrPath) {
    return slots.magicKernel.init(moduleOrPath);
}
/**
 * Release every instantiated module so its WebAssembly.Memory can be garbage
 * collected. Subsequent resizes re-instantiate on demand.
 *
 * Safe to call with resizes outstanding: the reclaim waits for the last of
 * them to finish. Any ImageData handed back before it runs is a copy, and
 * stays valid.
 */
export function dispose() {
    for (const slot of Object.values(slots))
        slot.retire();
    if (inFlight === 0)
        reclaim();
}
function optsIsHqxOpts(opts) {
    return opts.method === 'hqx';
}
function optsIsMagicKernelOpts(opts) {
    return MAGIC_KERNEL_METHODS.includes(opts.method);
}
/**
 * A Uint8Array over the same bytes as the given pixel buffer.
 *
 * `ImageData.data` is not guaranteed to start at offset 0 of its backing
 * ArrayBuffer — it may be a view into a larger allocation. Reading
 * `.buffer` alone would silently pick up the wrong bytes.
 */
function asUint8(data) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
}
/**
 * A Uint32Array over the same pixels as the given buffer. Uint32Array views
 * require 4-byte alignment, so an unaligned source is copied instead.
 */
function asUint32(data) {
    if (data.byteOffset % 4 === 0 && data.byteLength % 4 === 0) {
        return new Uint32Array(data.buffer, data.byteOffset, data.byteLength / 4);
    }
    return new Uint32Array(asUint8(data).slice().buffer);
}
function crop(data, sx, sy, sw, sh) {
    const source = data.data;
    const output = new Uint8ClampedArray(sw * sh * 4);
    const rowBytes = sw * 4;
    // Copy row by row into a fresh buffer. Copying within the source buffer
    // would be marginally cheaper but destroys the caller's ImageData.
    for (let y = 0; y < sh; y += 1) {
        const start = ((y + sy) * data.width + sx) * 4;
        output.set(source.subarray(start, start + rowBytes), y * rowBytes);
    }
    return new ImageData(output, sw, sh);
}
function clamp(num, { min = Number.MIN_VALUE, max = Number.MAX_VALUE }) {
    return Math.min(Math.max(num, min), max);
}
/** Resize methods by index */
const resizeMethods = [
    'triangle',
    'catrom',
    'mitchell',
    'lanczos3',
];
async function hqx(input, opts) {
    await initHqx();
    const widthRatio = opts.width / input.width;
    const heightRatio = opts.height / input.height;
    const ratio = Math.max(widthRatio, heightRatio);
    const factor = clamp(Math.ceil(ratio), { min: 1, max: 4 });
    if (factor === 1)
        return input;
    const result = wasmHqx(asUint32(input.data), input.width, input.height, factor);
    return new ImageData(new Uint8ClampedArray(result.buffer, result.byteOffset, result.byteLength), input.width * factor, input.height * factor);
}
async function magicKernel(input, opts) {
    await initMagicKernel();
    return wasmMagicKernel(asUint8(input.data), input.width, input.height, opts.width, opts.height, opts.method, opts.premultiply, opts.linearRGB);
}
export default async function resize(data, overrideOptions) {
    let options = {
        ...defaultOptions,
        ...overrideOptions,
    };
    let input = data;
    inFlight++;
    try {
        // Magic kernel resizes never touch the resize module, so only warm it up
        // when this call will actually reach it. An hqx resize still does, because
        // it falls through to catrom to make up the remaining difference.
        const resizeReady = optsIsMagicKernelOpts(options)
            ? undefined
            : initResize();
        if (optsIsHqxOpts(options)) {
            input = await hqx(input, options);
            // Regular resize to make up the difference
            options = { ...options, method: 'catrom' };
        }
        if (options.fitMethod === 'contain') {
            // Offsets must come from the image we are about to crop, which is not
            // necessarily the caller's — hqx has already upscaled it by this point.
            const { sx, sy, sw, sh } = getContainOffsets(input.width, input.height, options.width, options.height);
            const cropX = clamp(Math.round(sx), { min: 0, max: input.width });
            const cropY = clamp(Math.round(sy), { min: 0, max: input.height });
            input = crop(input, cropX, cropY, Math.min(Math.round(sw), input.width - cropX), Math.min(Math.round(sh), input.height - cropY));
        }
        if (optsIsMagicKernelOpts(options)) {
            return magicKernel(input, options);
        }
        await resizeReady;
        const result = wasmResize(asUint8(input.data), input.width, input.height, options.width, options.height, resizeMethods.indexOf(options.method), options.premultiply, options.linearRGB);
        return new ImageData(new Uint8ClampedArray(result.buffer, result.byteOffset, result.byteLength), options.width, options.height);
    }
    finally {
        inFlight--;
        if (inFlight === 0)
            reclaim();
    }
}
