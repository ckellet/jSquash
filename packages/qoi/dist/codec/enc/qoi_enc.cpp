#include <emscripten/bind.h>
#include <emscripten/val.h>

#define QOI_IMPLEMENTATION
#include "qoi.h"

using namespace emscripten;

#include <stdint.h>
#include <stdlib.h>

thread_local const val Uint8Array = val::global("Uint8Array");

// Hand the caller a region of the wasm heap to write pixels into.
//
// Pixels used to arrive through embind's std::string binding, which copies a
// typed array into the heap one byte at a time from JS. On a multi-megapixel
// image that is tens of millions of individually bounds-checked writes and it
// dominates encode time. Taking a pointer lets the caller use HEAPU8.set(),
// which is a single memcpy.
uintptr_t create_buffer(int size) {
  return reinterpret_cast<uintptr_t>(malloc(size));
}

void destroy_buffer(uintptr_t pointer) {
  free(reinterpret_cast<void*>(pointer));
}

val encode(uintptr_t pointer, int width, int height) {
  int compressedSizeInBytes;
  qoi_desc desc;
  desc.width = width;
  desc.height = height;
  desc.channels = 4;
  desc.colorspace = QOI_SRGB;

  uint8_t* encodedData = (uint8_t*)qoi_encode(reinterpret_cast<const void*>(pointer), &desc, &compressedSizeInBytes);
  if (encodedData == NULL)
    return val::null();

  auto js_result =
      Uint8Array.new_(typed_memory_view(compressedSizeInBytes, (const uint8_t*)encodedData));
  free(encodedData);

  return js_result;
}

EMSCRIPTEN_BINDINGS(my_module) {
  function("encode", &encode);
  function("create_buffer", &create_buffer);
  function("destroy_buffer", &destroy_buffer);
}
