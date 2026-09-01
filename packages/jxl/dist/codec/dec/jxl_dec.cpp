#include <emscripten/bind.h>
#include <emscripten/val.h>

#include <jxl/decode.h>
#include "lib/jxl/color_encoding_internal.h"

#include "skcms.h"

using namespace emscripten;

// Looked up per call rather than cached in a thread_local - see the note in
// enc/jxl_enc.cpp. A build without -pthread never runs TLS initialisers, so a
// cached val stays undefined and .new_() on it fails.

// R, G, B, A
#define COMPONENTS_PER_PIXEL 4

#ifndef JXL_DEBUG_ON_ALL_ERROR
#define JXL_DEBUG_ON_ALL_ERROR 0
#endif

#if JXL_DEBUG_ON_ALL_ERROR
#define EXPECT_TRUE(a)                                             \
  if (!(a)) {                                                      \
    fprintf(stderr, "Assertion failure (%d): %s\n", __LINE__, #a); \
    return val::null();                                            \
  }
#define EXPECT_EQ(a, b)                                                                          \
  {                                                                                              \
    int a_ = a;                                                                                  \
    int b_ = b;                                                                                  \
    if (a_ != b_) {                                                                              \
      fprintf(stderr, "Assertion failure (%d): %s (%d) != %s (%d)\n", __LINE__, #a, a_, #b, b_); \
      return val::null();                                                                        \
    }                                                                                            \
  }
#else
#define EXPECT_TRUE(a)  \
  if (!(a)) {           \
    return val::null(); \
  }

#define EXPECT_EQ(a, b) EXPECT_TRUE((a) == (b));
#endif

using JxlDecoderPtr =
    std::unique_ptr<JxlDecoder,
                    std::integral_constant<decltype(&JxlDecoderDestroy), JxlDecoderDestroy>>;

// Read the profile the *file* declares, without decoding a single pixel.
//
// This is JXL_COLOR_PROFILE_TARGET_ORIGINAL - the space the image was authored
// in - and deliberately not the space `decode` returns pixels in. The two are
// different here, which is the whole difficulty with JXL and colour management:
// see the comment above decode_impl. Because this profile never travels
// alongside pixels it cannot mislabel any, so it is safe to hand back as-is.
//
// Never throws: metadata is advisory, and a file whose pixels decode perfectly
// well should not fail over an unreadable colour profile. Returns null, which
// the wrapper turns into undefined.
val read_icc_profile(std::string data) {
  JxlDecoderPtr dec(JxlDecoderCreate(nullptr));
  if (JxlDecoderSubscribeEvents(dec.get(), JXL_DEC_BASIC_INFO | JXL_DEC_COLOR_ENCODING) !=
      JXL_DEC_SUCCESS) {
    return val::null();
  }

  JxlDecoderSetInput(dec.get(), (const uint8_t*)data.c_str(), data.size());
  if (JxlDecoderProcessInput(dec.get()) != JXL_DEC_BASIC_INFO) return val::null();
  if (JxlDecoderProcessInput(dec.get()) != JXL_DEC_COLOR_ENCODING) return val::null();

  // format is only consulted for JXL_COLOR_PROFILE_TARGET_DATA, so nullptr is
  // correct here and means no pixel format has to be invented to ask.
  size_t icc_size;
  if (JxlDecoderGetICCProfileSize(dec.get(), nullptr, JXL_COLOR_PROFILE_TARGET_ORIGINAL,
                                  &icc_size) != JXL_DEC_SUCCESS) {
    return val::null();
  }
  if (icc_size == 0) return val::null();

  std::vector<uint8_t> icc_profile(icc_size);
  if (JxlDecoderGetColorAsICCProfile(dec.get(), nullptr, JXL_COLOR_PROFILE_TARGET_ORIGINAL,
                                     icc_profile.data(), icc_profile.size()) != JXL_DEC_SUCCESS) {
    return val::null();
  }

  return val::global("Uint8Array")
      .new_(typed_memory_view(icc_profile.size(), icc_profile.data()));
}

// `decode` and `decode_with_metadata` share this; only what they return of it
// differs. `decode`'s behaviour is unchanged.
//
// The pixels handed back are always sRGB. libjxl gives us the image in
// whatever space it chose (JXL_COLOR_PROFILE_TARGET_DATA) and skcms converts
// that to sRGB below, so reporting the file's own profile alongside these
// pixels would describe them wrongly - they are not in that space any more.
// What `want_metadata` adds is therefore the sRGB profile, which is what the
// returned pixels are actually in. Callers who want the source profile ask
// read_icc_profile for it, where it is not attached to converted pixels.
//
// Note also that TARGET_DATA is frequently *not* the file's profile: for a
// lossy (XYB) image whose original space is an arbitrary ICC profile, this
// version of libjxl decodes to linear sRGB and offers no way to ask for the
// original space back (JxlDecoderSetPreferredColorProfile only speaks
// JxlColorEncoding enums). Handing back "untransformed" pixels would mean
// handing back linear light quantised to 8 bits, which bands badly.
val decode_impl(std::string data, bool want_metadata) {
  JxlDecoderPtr dec(JxlDecoderCreate(nullptr));
  EXPECT_EQ(JXL_DEC_SUCCESS,
            JxlDecoderSubscribeEvents(
                dec.get(), JXL_DEC_BASIC_INFO | JXL_DEC_COLOR_ENCODING | JXL_DEC_FULL_IMAGE));

  auto next_in = (const uint8_t*)data.c_str();
  auto avail_in = data.size();
  JxlDecoderSetInput(dec.get(), next_in, avail_in);
  EXPECT_EQ(JXL_DEC_BASIC_INFO, JxlDecoderProcessInput(dec.get()));
  JxlBasicInfo info;
  EXPECT_EQ(JXL_DEC_SUCCESS, JxlDecoderGetBasicInfo(dec.get(), &info));
  size_t pixel_count = info.xsize * info.ysize;
  size_t component_count = pixel_count * COMPONENTS_PER_PIXEL;

  EXPECT_EQ(JXL_DEC_COLOR_ENCODING, JxlDecoderProcessInput(dec.get()));
  static const JxlPixelFormat format = {COMPONENTS_PER_PIXEL, JXL_TYPE_FLOAT, JXL_LITTLE_ENDIAN, 0};
  size_t icc_size;
  EXPECT_EQ(JXL_DEC_SUCCESS, JxlDecoderGetICCProfileSize(dec.get(), &format,
                                                         JXL_COLOR_PROFILE_TARGET_DATA, &icc_size));
  std::vector<uint8_t> icc_profile(icc_size);
  EXPECT_EQ(JXL_DEC_SUCCESS,
            JxlDecoderGetColorAsICCProfile(dec.get(), &format, JXL_COLOR_PROFILE_TARGET_DATA,
                                           icc_profile.data(), icc_profile.size()));

  EXPECT_EQ(JXL_DEC_NEED_IMAGE_OUT_BUFFER, JxlDecoderProcessInput(dec.get()));
  size_t buffer_size;
  EXPECT_EQ(JXL_DEC_SUCCESS, JxlDecoderImageOutBufferSize(dec.get(), &format, &buffer_size));
  EXPECT_EQ(buffer_size, component_count * sizeof(float));

  auto float_pixels = std::make_unique<float[]>(component_count);
  EXPECT_EQ(JXL_DEC_SUCCESS, JxlDecoderSetImageOutBuffer(dec.get(), &format, float_pixels.get(),
                                                         component_count * sizeof(float)));
  EXPECT_EQ(JXL_DEC_FULL_IMAGE, JxlDecoderProcessInput(dec.get()));

  auto byte_pixels = std::make_unique<uint8_t[]>(component_count);
  // Convert to sRGB.
  skcms_ICCProfile jxl_profile;
  EXPECT_TRUE(skcms_Parse(icc_profile.data(), icc_profile.size(), &jxl_profile));
  EXPECT_TRUE(skcms_Transform(
      float_pixels.get(), skcms_PixelFormat_RGBA_ffff,
      info.alpha_premultiplied ? skcms_AlphaFormat_PremulAsEncoded : skcms_AlphaFormat_Unpremul,
      &jxl_profile, byte_pixels.get(), skcms_PixelFormat_RGBA_8888, skcms_AlphaFormat_Unpremul,
      skcms_sRGB_profile(), pixel_count));

  auto image = val::global("ImageData")
                   .new_(val::global("Uint8ClampedArray")
                             .new_(typed_memory_view(component_count, byte_pixels.get())),
                         info.xsize, info.ysize);

  if (!want_metadata) return image;

  // The profile the pixels above are in, generated from libjxl's own fields
  // rather than embedded as a constant - the code that builds it is already
  // linked, so this costs no binary size.
  const jxl::PaddedBytes& srgb_icc = jxl::ColorEncoding::SRGB(/*is_gray=*/false).ICC();

  auto result = val::object();
  result.set("image", image);
  if (!srgb_icc.empty()) {
    result.set("icc", val::global("Uint8Array")
                          .new_(typed_memory_view(srgb_icc.size(), srgb_icc.data())));
  }
  return result;
}

val decode(std::string data) {
  return decode_impl(std::move(data), /*want_metadata=*/false);
}

val decode_with_metadata(std::string data) {
  return decode_impl(std::move(data), /*want_metadata=*/true);
}

EMSCRIPTEN_BINDINGS(my_module) {
  function("decode", &decode);
  function("decode_with_metadata", &decode_with_metadata);
  function("read_icc_profile", &read_icc_profile);
}
