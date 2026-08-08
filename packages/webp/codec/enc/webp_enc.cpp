#include <emscripten/bind.h>
#include <emscripten/val.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <stdexcept>
#include <string>
#include "src/webp/encode.h"
#include "src/webp/mux.h"

using namespace emscripten;

int version() {
  return WebPGetEncoderVersion();
}

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

// Rebuild the RIFF container around an encoded bitstream, with the profile in
// an ICCP chunk.
//
// WebPEncode writes the simple format: a RIFF header and a bare VP8/VP8L
// bitstream, with nowhere to put metadata. Carrying a profile means the
// extended format - a VP8X header declaring which chunks follow - and the mux
// library is what knows how to assemble one.
//
// Returns null rather than throwing on any mux failure; the caller turns that
// into an error the same way it already does for a failed encode.
static val assemble_with_icc(const WebPMemoryWriter& wrt, const uint8_t* icc,
                             size_t icc_size) {
  WebPMux* mux = WebPMuxNew();
  if (mux == nullptr) return val::null();

  const WebPData image = {wrt.mem, wrt.size};
  const WebPData profile = {icc, icc_size};
  WebPData assembled = {nullptr, 0};
  val js_result = val::null();

  // copy_data = 0: both buffers outlive WebPMuxAssemble, which is the only
  // point at which the mux reads them, so there is no reason to duplicate the
  // whole bitstream just to hand it straight back.
  if (WebPMuxSetImage(mux, &image, 0) == WEBP_MUX_OK &&
      WebPMuxSetChunk(mux, "ICCP", &profile, 0) == WEBP_MUX_OK &&
      WebPMuxAssemble(mux, &assembled) == WEBP_MUX_OK) {
    js_result = Uint8Array.new_(typed_memory_view(assembled.size, assembled.bytes));
  }

  WebPDataClear(&assembled);
  WebPMuxDelete(mux);
  return js_result;
}

// `icc == nullptr` is the original encode path, unchanged. Split this way so
// the export below keeps its exact signature and does no extra work.
static val encode_impl(uintptr_t pointer, int width, int height, WebPConfig config,
                       const uint8_t* icc, size_t icc_size) {
  auto img_in = reinterpret_cast<uint8_t*>(pointer);

  // A lot of this is duplicated from Encode in picture_enc.c
  WebPPicture pic;
  WebPMemoryWriter wrt;
  int ok;

  if (!WebPPictureInit(&pic)) {
    // shouldn't happen, except if system installation is broken
    return val::null();
  }

  // Allow quality to go higher than 0.
  config.qmax = 100;

  // Only use use_argb if we really need it, as it's slower.
  pic.use_argb = config.lossless || config.use_sharp_yuv || config.preprocessing > 0;
  pic.width = width;
  pic.height = height;
  pic.writer = WebPMemoryWrite;
  pic.custom_ptr = &wrt;

  WebPMemoryWriterInit(&wrt);

  ok = WebPPictureImportRGBA(&pic, img_in, width * 4) && WebPEncode(&config, &pic);
  WebPPictureFree(&pic);
  val js_result = val::null();
  if (ok) {
    js_result = (icc == nullptr)
                    ? Uint8Array.new_(typed_memory_view(wrt.size, wrt.mem))
                    : assemble_with_icc(wrt, icc, icc_size);
  }
  WebPMemoryWriterClear(&wrt);
  return js_result;
}

val encode(uintptr_t pointer, int width, int height, WebPConfig config) {
  return encode_impl(pointer, width, height, config, nullptr, 0);
}

// Same encode, then an ICCP chunk. The profile arrives as a std::string rather
// than through create_buffer because it is a few hundred bytes on the opt-in
// path, not megapixels of image data on the hot one.
val encode_with_icc_profile(uintptr_t pointer, int width, int height, WebPConfig config,
                            std::string icc) {
  return encode_impl(pointer, width, height, config,
                     reinterpret_cast<const uint8_t*>(icc.data()), icc.size());
}

EMSCRIPTEN_BINDINGS(my_module) {
  enum_<WebPImageHint>("WebPImageHint")
      .value("WEBP_HINT_DEFAULT", WebPImageHint::WEBP_HINT_DEFAULT)
      .value("WEBP_HINT_PICTURE", WebPImageHint::WEBP_HINT_PICTURE)
      .value("WEBP_HINT_PHOTO", WebPImageHint::WEBP_HINT_PHOTO)
      .value("WEBP_HINT_GRAPH", WebPImageHint::WEBP_HINT_GRAPH);

  value_object<WebPConfig>("WebPConfig")
      .field("lossless", &WebPConfig::lossless)
      .field("quality", &WebPConfig::quality)
      .field("method", &WebPConfig::method)
      .field("image_hint", &WebPConfig::image_hint)
      .field("target_size", &WebPConfig::target_size)
      .field("target_PSNR", &WebPConfig::target_PSNR)
      .field("segments", &WebPConfig::segments)
      .field("sns_strength", &WebPConfig::sns_strength)
      .field("filter_strength", &WebPConfig::filter_strength)
      .field("filter_sharpness", &WebPConfig::filter_sharpness)
      .field("filter_type", &WebPConfig::filter_type)
      .field("autofilter", &WebPConfig::autofilter)
      .field("alpha_compression", &WebPConfig::alpha_compression)
      .field("alpha_filtering", &WebPConfig::alpha_filtering)
      .field("alpha_quality", &WebPConfig::alpha_quality)
      .field("pass", &WebPConfig::pass)
      .field("show_compressed", &WebPConfig::show_compressed)
      .field("preprocessing", &WebPConfig::preprocessing)
      .field("partitions", &WebPConfig::partitions)
      .field("partition_limit", &WebPConfig::partition_limit)
      .field("emulate_jpeg_size", &WebPConfig::emulate_jpeg_size)
      .field("low_memory", &WebPConfig::low_memory)
      .field("near_lossless", &WebPConfig::near_lossless)
      .field("exact", &WebPConfig::exact)
      .field("use_delta_palette", &WebPConfig::use_delta_palette)
      .field("use_sharp_yuv", &WebPConfig::use_sharp_yuv);

  function("version", &version);
  function("encode", &encode);
  function("encode_with_icc_profile", &encode_with_icc_profile);
  function("create_buffer", &create_buffer);
  function("destroy_buffer", &destroy_buffer);
}
