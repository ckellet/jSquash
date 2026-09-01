#include <emscripten/bind.h>
#include <emscripten/val.h>
#include "jpeglib.h"
#include <setjmp.h>
#include <stdlib.h>
#include <string.h>
#include <vector>

extern "C" {
#include "cdjpeg.h"
#include "jerror.h"
}

using namespace emscripten;

thread_local const val Uint8Array = val::global("Uint8Array");
thread_local const val Uint8ClampedArray = val::global("Uint8ClampedArray");
thread_local const val ImageData = val::global("ImageData");

constexpr uint16_t EXIF_ORIENTATION_TAG = 0x0112;

/** APP1 carries EXIF, APP2 carries the ICC profile. */
constexpr int EXIF_MARKER = JPEG_APP0 + 1;
constexpr int ICC_MARKER = JPEG_APP0 + 2;

/**
 * EXIF payloads sit behind an "Exif\0\0" prefix inside APP1. The canonical
 * jSquash shape starts at the TIFF header, so the prefix is stripped on the way
 * out and callers get the same bytes they would from any other container.
 */
constexpr unsigned int EXIF_PREFIX_LEN = 6;

inline uint16_t get_exif_short(const uint8_t *data, int offset, bool is_motorola)
{
  return is_motorola
             ? (data[offset] << 8) | data[offset + 1]
             : (data[offset + 1] << 8) | data[offset];
}

inline uint32_t get_exif_long(const uint8_t *data, int offset, bool is_motorola)
{
  return is_motorola
             ? (data[offset] << 24) | (data[offset + 1] << 16) |
                   (data[offset + 2] << 8) | data[offset + 3]
             : (data[offset + 3] << 24) | (data[offset + 2] << 16) |
                   (data[offset + 1] << 8) | data[offset];
}

int parse_exif_orientation(const uint8_t *exif_data, unsigned int data_length)
{
  if (data_length < 12)
    return 0;

  constexpr int tiff_header_offset = 6; // Skip "Exif\0\0" header

  // Check byte alignment (II=Intel, MM=Motorola)
  bool is_motorola = (exif_data[tiff_header_offset] == 'M' &&
                      exif_data[tiff_header_offset + 1] == 'M');

  if (!is_motorola && (exif_data[tiff_header_offset] != 'I' ||
                       exif_data[tiff_header_offset + 1] != 'I'))
    return 0; // Invalid byte alignment

  if (get_exif_short(exif_data, tiff_header_offset + 2, is_motorola) != 0x002A)
    return 0;

  uint32_t offset = get_exif_long(exif_data, tiff_header_offset + 4, is_motorola);

  if (offset < 8 || offset > data_length - 2)
    return 0;

  offset += tiff_header_offset;

  uint16_t number_of_tags = get_exif_short(exif_data, offset, is_motorola);
  offset += 2;

  // Scan for orientation tag
  for (uint16_t i = 0; i < number_of_tags && offset + 12 <= data_length; i++, offset += 12)
  {
    if (get_exif_short(exif_data, offset, is_motorola) == EXIF_ORIENTATION_TAG)
    {
      return get_exif_short(exif_data, offset + 8, is_motorola);
    }
  }

  return 0;
}

int extract_orientation(struct jpeg_decompress_struct *cinfo)
{
  for (jpeg_saved_marker_ptr marker = cinfo->marker_list; marker != nullptr; marker = marker->next)
  {
    if (marker->marker == EXIF_MARKER &&
        marker->data_length >= EXIF_PREFIX_LEN &&
        memcmp(marker->data, "Exif\0\0", EXIF_PREFIX_LEN) == 0)
    {

      int orient = parse_exif_orientation(
          reinterpret_cast<const uint8_t *>(marker->data),
          marker->data_length);

      if (orient > 0)
      {
        return orient;
      }
    }
  }
  return 0;
}

void apply_orientation(uint8_t *buffer, int width, int height, int orientation)
{
  if (orientation <= 1)
    return; // No change needed

  const bool dimensions_swapped = (orientation >= 5 && orientation <= 8);
  const int dst_width = dimensions_swapped ? height : width;
  const int dst_height = dimensions_swapped ? width : height;

  std::vector<uint8_t> temp(width * height * 4);
  std::memcpy(temp.data(), buffer, width * height * 4);

  std::vector<uint8_t> rotated(dst_width * dst_height * 4, 0);

  for (int dst_y = 0; dst_y < dst_height; dst_y++)
  {
    for (int dst_x = 0; dst_x < dst_width; dst_x++)
    {
      int src_x = dst_x;
      int src_y = dst_y;

      // Apply transformation based on orientation
      switch (orientation)
      {
      case 2: // Flip horizontally
        src_x = width - 1 - dst_x;
        break;
      case 3: // Rotate 180°
        src_x = width - 1 - dst_x;
        src_y = height - 1 - dst_y;
        break;
      case 4: // Flip vertically
        src_y = height - 1 - dst_y;
        break;
      case 5: // Transpose
        src_x = dst_y;
        src_y = dst_x;
        break;
      case 6: // Rotate 90° clockwise
        src_x = dst_y;
        src_y = height - 1 - dst_x;
        break;
      case 7: // Transverse
        src_x = width - 1 - dst_y;
        src_y = height - 1 - dst_x;
        break;
      case 8: // Rotate 270° clockwise
        src_x = width - 1 - dst_y;
        src_y = dst_x;
        break;
      }

      // Check bounds and copy pixel
      if (src_x >= 0 && src_x < width && src_y >= 0 && src_y < height)
      {
        const int dst_offset = (dst_y * dst_width + dst_x) * 4;
        const int src_offset = (src_y * width + src_x) * 4;
        std::memcpy(rotated.data() + dst_offset, temp.data() + src_offset, 4);
      }
    }
  }

  std::memcpy(buffer, rotated.data(), dst_width * dst_height * 4);
}

/**
 * Collect the metadata the file carried alongside its pixels.
 *
 * Must run while the decompressor is alive: `marker_list` lives in its memory
 * pool and dies with `jpeg_destroy_decompress`. Both payloads are copied into
 * JS here rather than referenced, for that reason.
 *
 * Metadata is advisory, so nothing in here fails an image. MozJPEG's
 * `jpeg_read_icc_profile` returns FALSE for an absent profile and equally for a
 * malformed one - inconsistent marker counts, gaps in the sequence, empty
 * markers - and either way the field is simply left off.
 */
val extract_metadata(struct jpeg_decompress_struct *cinfo)
{
  val metadata = val::object();

  JOCTET *icc_data = nullptr;
  unsigned int icc_len = 0;
  if (jpeg_read_icc_profile(cinfo, &icc_data, &icc_len) && icc_len > 0)
  {
    metadata.set("icc", Uint8Array.new_(typed_memory_view(icc_len, icc_data)));
  }
  // jdicc.c allocates with plain malloc and documents the caller as the owner.
  free(icc_data);

  for (jpeg_saved_marker_ptr marker = cinfo->marker_list; marker != nullptr; marker = marker->next)
  {
    if (marker->marker == EXIF_MARKER &&
        marker->data_length > EXIF_PREFIX_LEN &&
        memcmp(marker->data, "Exif\0\0", EXIF_PREFIX_LEN) == 0)
    {
      metadata.set("exif", Uint8Array.new_(typed_memory_view(
                               marker->data_length - EXIF_PREFIX_LEN,
                               marker->data + EXIF_PREFIX_LEN)));
      break;
    }
  }

  return metadata;
}

/**
 * The body shared by `decode` and `decode_with_metadata`.
 *
 * `metadata_out` is filled only when it is non-null, so the plain decode path
 * neither asks the library to save APP2 markers nor walks the marker list. It
 * runs exactly the code it ran before this function existed.
 */
val decode_impl(const std::string &image_in, bool preserve_orientation, val *metadata_out)
{
  const uint8_t *image_buffer = reinterpret_cast<const uint8_t *>(image_in.c_str());

  jpeg_decompress_struct cinfo;
  jpeg_error_mgr jerr;
  cinfo.err = jpeg_std_error(&jerr);
  jpeg_create_decompress(&cinfo);

  jpeg_mem_src(&cinfo, image_buffer, image_in.length());
  jpeg_save_markers(&cinfo, EXIF_MARKER, 0xFFFF);
  if (metadata_out != nullptr)
  {
    jpeg_save_markers(&cinfo, ICC_MARKER, 0xFFFF);
  }
  jpeg_read_header(&cinfo, TRUE);

  if (metadata_out != nullptr)
  {
    *metadata_out = extract_metadata(&cinfo);
  }

  int orientation = preserve_orientation ? extract_orientation(&cinfo) : 1;

  cinfo.out_color_space = JCS_EXT_RGBA;
  jpeg_start_decompress(&cinfo);

  const int width = cinfo.output_width;
  const int height = cinfo.output_height;

  // Determine final dimensions based on orientation
  const int final_width = (orientation >= 5 && orientation <= 8) ? height : width;
  const int final_height = (orientation >= 5 && orientation <= 8) ? width : height;

  const size_t buffer_size = width * height * 4;
  std::vector<uint8_t> buffer(buffer_size);

  while (cinfo.output_scanline < cinfo.output_height)
  {
    uint8_t *scanline = &buffer[cinfo.output_width * 4 * cinfo.output_scanline];
    jpeg_read_scanlines(&cinfo, &scanline, 1);
  }

  jpeg_finish_decompress(&cinfo);
  jpeg_destroy_decompress(&cinfo);

  if (orientation > 1)
  {
    apply_orientation(buffer.data(), width, height, orientation);
  }

  auto data = Uint8ClampedArray.new_(typed_memory_view(buffer_size, buffer.data()));
  auto result = ImageData.new_(data, final_width, final_height);

  return result;
}

val decode(std::string image_in, bool preserve_orientation)
{
  return decode_impl(image_in, preserve_orientation, nullptr);
}

/**
 * Decode pixels and return them together with the file's ICC profile and EXIF.
 *
 * One pass rather than two: the markers are saved during the same
 * `jpeg_read_header` the pixels need anyway, so metadata costs a marker copy
 * and nothing more. Reading the file a second time would mean re-parsing it.
 */
val decode_with_metadata(std::string image_in, bool preserve_orientation)
{
  val metadata = val::object();
  val image = decode_impl(image_in, preserve_orientation, &metadata);

  val result = val::object();
  result.set("image", image);
  result.set("metadata", metadata);
  return result;
}

/**
 * An error manager that reports failures by unwinding instead of exiting.
 *
 * libjpeg's default `error_exit` calls `exit()`, which in wasm tears the whole
 * module down - fine for a decode that a caller already expects to succeed, but
 * not for `read_icc_profile`, whose entire job is to be pointed at an arbitrary
 * file and asked a question about it. The instrumentation setjmp costs is
 * confined to this one function; the decode path above is untouched.
 */
struct icc_error_mgr
{
  struct jpeg_error_mgr pub;
  jmp_buf setjmp_buffer;
};

METHODDEF(void)
icc_error_exit(j_common_ptr cinfo)
{
  longjmp(reinterpret_cast<icc_error_mgr *>(cinfo->err)->setjmp_buffer, 1);
}

/** Warnings about a profile we are only peeking at are noise, not diagnostics. */
METHODDEF(void)
icc_emit_message(j_common_ptr cinfo, int msg_level) {}

/**
 * Read the ICC profile without decoding any pixels.
 *
 * Stops after the header, which is all the markers need, so asking "what colour
 * space is this file in?" does not cost a full decode. Returns `undefined` for
 * a file with no profile, a profile that does not reassemble, and input that is
 * not a JPEG at all - metadata is advisory in every one of those cases.
 */
val read_icc_profile(std::string image_in)
{
  jpeg_decompress_struct cinfo;
  icc_error_mgr jerr;

  // volatile because a longjmp out of the guarded region would otherwise leave
  // these indeterminate: locals modified between setjmp and longjmp may live in
  // registers that longjmp does not restore.
  JOCTET *volatile icc_data = nullptr;
  unsigned int volatile icc_len = 0;

  cinfo.err = jpeg_std_error(&jerr.pub);
  jerr.pub.error_exit = icc_error_exit;
  jerr.pub.emit_message = icc_emit_message;
  jpeg_create_decompress(&cinfo);

  if (setjmp(jerr.setjmp_buffer) == 0)
  {
    jpeg_mem_src(&cinfo,
                 reinterpret_cast<const uint8_t *>(image_in.c_str()),
                 image_in.length());
    jpeg_save_markers(&cinfo, ICC_MARKER, 0xFFFF);
    jpeg_read_header(&cinfo, TRUE);

    JOCTET *data = nullptr;
    unsigned int length = 0;
    if (jpeg_read_icc_profile(&cinfo, &data, &length))
    {
      icc_data = data;
      icc_len = length;
    }
  }

  val result = val::undefined();
  if (icc_data != nullptr && icc_len > 0)
  {
    result = Uint8Array.new_(typed_memory_view(icc_len, icc_data));
  }

  free(icc_data);
  jpeg_destroy_decompress(&cinfo);

  return result;
}

EMSCRIPTEN_BINDINGS(my_module) {
  function("decode", &decode);
  function("decode_with_metadata", &decode_with_metadata);
  function("read_icc_profile", &read_icc_profile);
}
