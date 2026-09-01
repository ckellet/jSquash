import type { WorkerResizeOptions } from './meta.js';
import type { InitInput as InitResizeInput } from './lib/resize/pkg/squoosh_resize.js';
import type { InitInput as InitHqxInput } from './lib/hqx/pkg/squooshhqx.js';
import type { InitInput as InitMagicKernelInput } from './lib/magic-kernel/pkg/jsquash_magic_kernel.js';
export declare function initResize(moduleOrPath?: InitResizeInput): Promise<unknown>;
export declare function initHqx(moduleOrPath?: InitHqxInput): Promise<unknown>;
export declare function initMagicKernel(moduleOrPath?: InitMagicKernelInput): Promise<unknown>;
/**
 * Release every instantiated module so its WebAssembly.Memory can be garbage
 * collected. Subsequent resizes re-instantiate on demand.
 *
 * Safe to call with resizes outstanding: the reclaim waits for the last of
 * them to finish. Any ImageData handed back before it runs is a copy, and
 * stays valid.
 */
export declare function dispose(): void;
export default function resize(data: ImageData, overrideOptions: Partial<WorkerResizeOptions> & {
    width: number;
    height: number;
}): Promise<ImageData>;
//# sourceMappingURL=index.d.ts.map