#include <string>
#include "emscripten/bind.h"
#include "emscripten/val.h"
#include "src/webp/decode.h"
#include "src/webp/demux.h"

using namespace emscripten;

int version() {
  return WebPGetDecoderVersion();
}

thread_local const val Uint8Array = val::global("Uint8Array");
thread_local const val Uint8ClampedArray = val::global("Uint8ClampedArray");
thread_local const val ImageData = val::global("ImageData");

val decode(std::string buffer) {
  int width, height;
  std::unique_ptr<uint8_t[]> rgba(
      WebPDecodeRGBA((const uint8_t*)buffer.c_str(), buffer.size(), &width, &height));
  return rgba ? ImageData.new_(
                    Uint8ClampedArray.new_(typed_memory_view(width * height * 4, rgba.get())),
                    width, height)
              : val::null();
}

// Return the raw ICC profile from the file's ICCP chunk, or null.
//
// WebPDecodeRGBA above cannot see this: it is handed the VP8/VP8L bitstream and
// knows nothing about the RIFF chunks wrapped around it. Metadata belongs to
// the demuxer, which is why libwebpdemux is on the link line.
//
// Nothing here throws. A profile is advisory - an image whose pixels decode
// perfectly well should not fail over a malformed ancillary chunk - so an
// unparseable container, a file with no profile, and an empty ICCP chunk all
// come back the same way, as null.
val read_icc_profile(std::string buffer) {
  const WebPData webp_data = {(const uint8_t*)buffer.c_str(), buffer.size()};
  WebPDemuxer* demux = WebPDemux(&webp_data);
  if (demux == nullptr) return val::null();

  val result = val::null();
  // Files in the simple (VP8/VP8L-only) format carry no flags word at all, so
  // this is also the cheap way to skip the ones that cannot have a profile.
  if (WebPDemuxGetI(demux, WEBP_FF_FORMAT_FLAGS) & ICCP_FLAG) {
    WebPChunkIterator chunk_iter;
    if (WebPDemuxGetChunk(demux, "ICCP", 1, &chunk_iter)) {
      if (chunk_iter.chunk.size > 0) {
        // new Uint8Array(view) copies, so the result does not alias either the
        // demuxer's memory or the heap it is about to hand back.
        result = Uint8Array.new_(
            typed_memory_view(chunk_iter.chunk.size, chunk_iter.chunk.bytes));
      }
      WebPDemuxReleaseChunkIterator(&chunk_iter);
    }
  }
  WebPDemuxDelete(demux);
  return result;
}

EMSCRIPTEN_BINDINGS(my_module) {
  function("decode", &decode);
  function("read_icc_profile", &read_icc_profile);
  function("version", &version);
}
