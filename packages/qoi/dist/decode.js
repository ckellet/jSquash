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
import { createModuleCache } from './utils.js';
import qoi_dec from './codec/dec/qoi_dec.js';
const codecModule = createModuleCache(() => qoi_dec);
export function init(module, moduleOptionOverrides) {
    return codecModule.init(module, moduleOptionOverrides);
}
/**
 * Release the module so its WebAssembly.Memory can be garbage collected.
 *
 * Emscripten heaps grow but never shrink, so a long-lived worker that has
 * decoded a single large image holds that peak allocation for the rest of
 * its life. The next call re-instantiates the module on demand.
 *
 * Safe to call with work outstanding: each call keeps the module it is
 * running on, and the reclaim happens once the last of them has finished.
 */
export const dispose = codecModule.dispose;
export default function decode(buffer) {
    return codecModule.use((codec) => {
        const result = codec.decode(buffer);
        if (!result)
            throw new Error('Decoding error');
        return result;
    });
}
