#include <emscripten/bind.h>
#include <emscripten/val.h>
#include "avif/avif.h"

using namespace emscripten;

thread_local const val Uint8ClampedArray = val::global("Uint8ClampedArray");
thread_local const val Uint8Array = val::global("Uint8Array");
thread_local const val Uint16Array = val::global("Uint16Array");
thread_local const val ImageData = val::global("ImageData");
thread_local const val Object = val::global("Object");

// Read the embedded ICC profile without decoding any pixels.
//
// avifDecoderParse walks the ISOBMFF boxes and fills decoder->image's metadata
// but never touches AV1, so "what colour space is this file in?" costs a header
// parse rather than a full decode.
//
// Returns undefined rather than throwing when there is no profile or the file
// cannot be parsed: metadata is advisory, and an image whose pixels decode
// perfectly well should not fail over it.
val read_icc_profile(std::string avifimage) {
  avifDecoder* decoder = avifDecoderCreate();
  if (decoder == nullptr) {
    return val::undefined();
  }

  val result = val::undefined();
  if (avifDecoderSetIOMemory(decoder, (const uint8_t*)avifimage.data(), avifimage.size()) ==
          AVIF_RESULT_OK &&
      avifDecoderParse(decoder) == AVIF_RESULT_OK && decoder->image != nullptr &&
      decoder->image->icc.size > 0) {
    // Constructing from the memory view copies, so this survives the destroy.
    result = Uint8Array.new_(
        typed_memory_view(decoder->image->icc.size, decoder->image->icc.data));
  }

  avifDecoderDestroy(decoder);
  return result;
}

val decode(std::string avifimage, uint32_t bitDepth = 8) {
  avifImage* image = avifImageCreateEmpty();
  avifDecoder* decoder = avifDecoderCreate();
  avifResult decodeResult =
      avifDecoderReadMemory(decoder, image, (uint8_t*)avifimage.c_str(), avifimage.length());

  // image is an independent copy of decoded data, decoder may be destroyed here
  avifDecoderDestroy(decoder);

  val result = val::null();
  if (decodeResult == AVIF_RESULT_OK) {
    avifRGBImage rgb;
    avifRGBImageSetDefaults(&rgb, image);

    rgb.depth = bitDepth;

    avifRGBImageAllocatePixels(&rgb);
    avifImageYUVToRGB(image, &rgb);

    if (bitDepth != 8) {
      const size_t pixelCount = rgb.width * rgb.height;
      const size_t channelCount = 4;
      const size_t totalElements = pixelCount * channelCount;

      auto pixelData = Uint16Array.new_(typed_memory_view(totalElements,
                                        reinterpret_cast<uint16_t*>(rgb.pixels)));

      auto pixelArray = pixelData.call<val>("slice");

      result = Object.new_();
      result.set("data", pixelArray);
      result.set("width", rgb.width);
      result.set("height", rgb.height);
    } else {
      result = ImageData.new_(
          Uint8ClampedArray.new_(typed_memory_view(rgb.rowBytes * rgb.height, rgb.pixels)),
          rgb.width,
          rgb.height);
    }

    // Now we can safely free the RGB pixels:
    avifRGBImageFreePixels(&rgb);
  }

  avifImageDestroy(image);
  return result;
}

EMSCRIPTEN_BINDINGS(my_module) {
  function("decode", &decode);
  function("read_icc_profile", &read_icc_profile);
}