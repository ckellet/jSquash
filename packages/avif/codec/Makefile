# using libavif from https://github.com/AOMediaCodec/libavif
LIBAVIF_URL = https://github.com/AOMediaCodec/libavif/archive/refs/tags/v1.0.1.tar.gz
LIBAVIF_PACKAGE = node_modules/libavif.tar.gz

# using libaom from https://aomedia.googlesource.com/aom
LIBAOM_URL = https://aomedia.googlesource.com/aom/+archive/v3.7.0.tar.gz
LIBAOM_PACKAGE = node_modules/libaom.tar.gz

# using dav1d from https://code.videolan.org/videolan/dav1d
# libavif's AVIF_LOCAL_DAV1D path expects the source at ext/dav1d and the
# static library at ext/dav1d/build/src, so the paths below are libavif's
# choice rather than ours.
LIBDAV1D_VERSION = 1.5.0
LIBDAV1D_URL = https://code.videolan.org/videolan/dav1d/-/archive/$(LIBDAV1D_VERSION)/dav1d-$(LIBDAV1D_VERSION).tar.gz
LIBDAV1D_PACKAGE = node_modules/dav1d.tar.gz
export LIBDAV1D_DIR = node_modules/libavif/ext/dav1d
# libavif's AVIF_LOCAL_DAV1D reads exactly one path, ext/dav1d/build, so the
# two configurations are built beside it and copied into place before each
# libavif configure - the same staging the encoder does for libsharpyuv, and
# the same reason those targets have to run in sequence.
LIBDAV1D_ST_BUILD = $(LIBDAV1D_DIR)/build_st
LIBDAV1D_SIMD_BUILD = $(LIBDAV1D_DIR)/build_simd
export LIBDAV1D_OUT = $(LIBDAV1D_DIR)/build/src/libdav1d.a

export CODEC_DIR = node_modules/libavif
export BUILD_DIR = node_modules/build
export LIBAOM_DIR = node_modules/libaom

override CFLAGS += "-Wno-unused-macros"

# We must build libsharpyuv from a specific libwebp commit
# See libavif/ext/libsharpyuv.cmd for more detail
LIBWEBP_URL_WITH_SHARPYUV = https://chromium.googlesource.com/webm/libwebp/+archive/e2c85878f6a33f29948b43d3492d9cdaf801aa54.tar.gz
LIBWEBP_DIR := $(CODEC_DIR)/ext/libwebp
LIBSHARPYUV_ST := $(LIBWEBP_DIR)/build_st/libsharpyuv.a
LIBSHARPYUV_MT := $(LIBWEBP_DIR)/build_mt/libsharpyuv.a
export LIBSHARPYUV := $(LIBWEBP_DIR)/build/libsharpyuv.a

OUT_ENC_JS = enc/avif_enc.js
OUT_ENC_SIMD_JS = enc/avif_enc_simd.js
OUT_ENC_MT_JS = enc/avif_enc_mt.js
OUT_DEC_JS = dec/avif_dec.js
OUT_DEC_SIMD_JS = dec/avif_dec_simd.js

OUT_ENC_CPP = enc/avif_enc.cpp
OUT_DEC_CPP = dec/avif_dec.cpp
ENVIRONMENT = web,worker

HELPER_MAKEFLAGS := -f helper.Makefile

.PHONY: all clean

all: $(OUT_ENC_JS) $(OUT_ENC_SIMD_JS) $(OUT_DEC_JS) $(OUT_DEC_SIMD_JS) $(OUT_ENC_MT_JS)

# ST-Encoding
$(OUT_ENC_JS): $(OUT_ENC_CPP) $(CODEC_DIR)/CMakeLists.txt $(LIBAOM_DIR)/CMakeLists.txt $(LIBSHARPYUV_ST)
	mkdir -p $(LIBWEBP_DIR)/build && cp $(LIBSHARPYUV_ST) $(LIBSHARPYUV)
	$(MAKE) \
		$(HELPER_MAKEFLAGS) \
		OUT_JS=$@ \
		OUT_CPP=$< \
		STACK_SIZE=5242880 \
		INITIAL_MEMORY_SIZE=16777216 \
		LIBAOM_FLAGS="\
			-DCONFIG_AV1_DECODER=0 \
			-DCONFIG_MULTITHREAD=0 \
			-DCONFIG_AV1_HIGHBITDEPTH=1 \
		" \
		ENVIRONMENT=$(ENVIRONMENT) \
		LIBAVIF_FLAGS="-DAVIF_CODEC_AOM_DECODE=0 -DAVIF_LOCAL_LIBSHARPYUV=ON"

# SIMD-Encoding (no threads)
# Node and Cloudflare Workers cannot use threads but do support SIMD, and
# without this target they fall back to a build that has neither. libaom is
# built for a generic target, so this is autovectorisation of the portable C
# rather than hand-written intrinsics - a smaller win than SIMD in libwebp or
# libjxl, but a free one.
# Sequenced after the ST target because both stage libsharpyuv in the same place.
$(OUT_ENC_SIMD_JS): $(OUT_ENC_CPP) $(CODEC_DIR)/CMakeLists.txt $(LIBAOM_DIR)/CMakeLists.txt $(LIBSHARPYUV_ST) | $(OUT_ENC_JS)
	mkdir -p $(LIBWEBP_DIR)/build && cp $(LIBSHARPYUV_ST) $(LIBSHARPYUV)
	$(MAKE) \
		$(HELPER_MAKEFLAGS) \
		OUT_JS=$@ \
		OUT_CPP=$< \
		CFLAGS="$(CFLAGS) -msimd128" \
		CXXFLAGS="$(CXXFLAGS) -msimd128" \
		STACK_SIZE=5242880 \
		INITIAL_MEMORY_SIZE=16777216 \
		LIBAOM_FLAGS="\
			-DCONFIG_AV1_DECODER=0 \
			-DCONFIG_MULTITHREAD=0 \
			-DCONFIG_AV1_HIGHBITDEPTH=1 \
		" \
		ENVIRONMENT=$(ENVIRONMENT) \
		LIBAVIF_FLAGS="-DAVIF_CODEC_AOM_DECODE=0 -DAVIF_LOCAL_LIBSHARPYUV=ON"

# MT-Encoding
# We need to run the ST and MT tasks sequentially to avoid conflicts with the copy of libsharpyuv in the build directory
$(OUT_ENC_MT_JS): $(OUT_ENC_CPP) $(CODEC_DIR)/CMakeLists.txt $(LIBAOM_DIR)/CMakeLists.txt $(LIBSHARPYUV_MT) | $(OUT_ENC_JS) $(OUT_ENC_SIMD_JS)
	mkdir -p $(LIBWEBP_DIR)/build && cp $(LIBSHARPYUV_MT) $(LIBSHARPYUV)
	$(MAKE) \
		$(HELPER_MAKEFLAGS) \
		OUT_JS=$@ \
		OUT_CPP=$< \
		STACK_SIZE=5242880 \
		INITIAL_MEMORY_SIZE=16777216 \
		LIBAOM_FLAGS="\
			-DCONFIG_AV1_DECODER=0 \
			-DCONFIG_AV1_HIGHBITDEPTH=1 \
		" \
		ENVIRONMENT=$(ENVIRONMENT) \
		LIBAVIF_FLAGS="-DAVIF_CODEC_AOM_DECODE=0 -DAVIF_LOCAL_LIBSHARPYUV=ON" \
		OUT_FLAGS="-pthread"

# Decoding
# Decoding uses dav1d rather than libaom. It is a decoder-only AV1
# implementation, so it carries none of libaom's encoder, and on this workload
# it is both smaller and faster: 616 KB against 1.33 MB, and 30-33% quicker,
# for byte-identical pixels at 8, 10 and 12 bits. libaom remains the encoder.
$(OUT_DEC_JS): $(OUT_DEC_CPP) $(CODEC_DIR)/CMakeLists.txt $(LIBDAV1D_ST_BUILD)/src/libdav1d.a
	rm -rf $(LIBDAV1D_DIR)/build && cp -r $(LIBDAV1D_ST_BUILD) $(LIBDAV1D_DIR)/build
	$(MAKE) \
		$(HELPER_MAKEFLAGS) \
		OUT_JS=$@ \
		OUT_CPP=$< \
		STACK_SIZE=5242880 \
		INITIAL_MEMORY_SIZE=16777216 \
		ENVIRONMENT=$(ENVIRONMENT) \
		USE_DAV1D=1 \
		LIBAVIF_FLAGS="-DAVIF_CODEC_AOM=0 -DAVIF_CODEC_DAV1D=1 -DAVIF_LOCAL_DAV1D=1"

# SIMD-Decoding
# dav1d's hand-written assembly is x86 and Arm only, so wasm gets its portable
# C either way; -msimd128 is what lets LLVM vectorise that C. Sequenced after
# the plain target because both stage libdav1d in the same directory.
$(OUT_DEC_SIMD_JS): $(OUT_DEC_CPP) $(CODEC_DIR)/CMakeLists.txt $(LIBDAV1D_SIMD_BUILD)/src/libdav1d.a | $(OUT_DEC_JS)
	rm -rf $(LIBDAV1D_DIR)/build && cp -r $(LIBDAV1D_SIMD_BUILD) $(LIBDAV1D_DIR)/build
	$(MAKE) \
		$(HELPER_MAKEFLAGS) \
		OUT_JS=$@ \
		OUT_CPP=$< \
		CFLAGS="$(CFLAGS) -msimd128" \
		CXXFLAGS="$(CXXFLAGS) -msimd128" \
		STACK_SIZE=5242880 \
		INITIAL_MEMORY_SIZE=16777216 \
		ENVIRONMENT=$(ENVIRONMENT) \
		USE_DAV1D=1 \
		LIBAVIF_FLAGS="-DAVIF_CODEC_AOM=0 -DAVIF_CODEC_DAV1D=1 -DAVIF_LOCAL_DAV1D=1"

# LIBDAV1D EXTRACTION SECTION

$(LIBDAV1D_PACKAGE):
	mkdir -p $(@D)
	curl -sL $(LIBDAV1D_URL) -o $@

$(LIBDAV1D_DIR)/meson.build: $(LIBDAV1D_PACKAGE) $(CODEC_DIR)/CMakeLists.txt
	mkdir -p $(LIBDAV1D_DIR)
	tar xzm --strip 1 -C $(LIBDAV1D_DIR) -f $(LIBDAV1D_PACKAGE)

# dav1d ships a meson cross file for wasm32, so this needs meson and ninja
# rather than cmake. Threads off: this decoder is loaded without pthreads.
# Meson will not reconfigure an existing build directory from here, so each is
# removed first rather than left to fail on a changed option.
$(LIBDAV1D_ST_BUILD)/src/libdav1d.a: $(LIBDAV1D_DIR)/meson.build
	cd $(LIBDAV1D_DIR) && rm -rf $(notdir $(LIBDAV1D_ST_BUILD)) && meson setup $(notdir $(LIBDAV1D_ST_BUILD)) \
		--buildtype release \
		--default-library static \
		-Denable_asm=false \
		-Denable_tools=false \
		-Denable_tests=false \
		--cross-file package/crossfiles/wasm32.meson
	ninja -C $(LIBDAV1D_ST_BUILD)

$(LIBDAV1D_SIMD_BUILD)/src/libdav1d.a: $(LIBDAV1D_DIR)/meson.build
	cd $(LIBDAV1D_DIR) && rm -rf $(notdir $(LIBDAV1D_SIMD_BUILD)) && meson setup $(notdir $(LIBDAV1D_SIMD_BUILD)) \
		--buildtype release \
		--default-library static \
		-Dc_args=-msimd128 \
		-Denable_asm=false \
		-Denable_tools=false \
		-Denable_tests=false \
		--cross-file package/crossfiles/wasm32.meson
	ninja -C $(LIBDAV1D_SIMD_BUILD)

# LIBAOM EXTRACTION SECTION

# Download the libaom tarball
$(LIBAOM_PACKAGE):
	mkdir -p $(@D)
	curl -sL $(LIBAOM_URL) -o $@

# Extract libaom from the tarball
$(LIBAOM_DIR)/CMakeLists.txt: $(LIBAOM_PACKAGE)
	mkdir -p $(@D)
	tar xzm -C $(@D) -f $(LIBAOM_PACKAGE)

# LIBAVIF EXTRACTION SECTION

# Download the libavif tarball
$(LIBAVIF_PACKAGE):
	mkdir -p $(@D)
	curl -sL $(LIBAVIF_URL) -o $@

# Extract libavif from the tarball
$(CODEC_DIR)/CMakeLists.txt: $(LIBAVIF_PACKAGE)
	mkdir -p $(@D)
	tar xzm --strip 1 -C $(@D) -f $(LIBAVIF_PACKAGE)

# Create libavif/ext/libwebp
$(LIBWEBP_DIR)/CMakeLists.txt: $(CODEC_DIR)/CMakeLists.txt
	mkdir -p $(LIBWEBP_DIR)
	curl -sL $(LIBWEBP_URL_WITH_SHARPYUV) \
		| tar xzm -C $(LIBWEBP_DIR)

# Make libsharpyuv.a for ST-Encoding
$(LIBSHARPYUV_ST): $(LIBWEBP_DIR)/CMakeLists.txt
	mkdir -p $(@D)
	emcmake cmake \
		-DWEBP_USE_THREAD=OFF \
		-DWEBP_BUILD_ANIM_UTILS=OFF \
		-DWEBP_BUILD_CWEBP=OFF \
		-DWEBP_BUILD_DWEBP=OFF \
		-DWEBP_BUILD_GIF2WEBP=OFF \
		-DWEBP_BUILD_IMG2WEBP=OFF \
		-DWEBP_BUILD_VWEBP=OFF \
		-DWEBP_BUILD_WEBPINFO=OFF \
		-DWEBP_BUILD_LIBWEBPMUX=OFF \
		-DWEBP_BUILD_WEBPMUX=OFF \
		-DWEBP_BUILD_EXTRAS=OFF \
		-DBUILD_SHARED_LIBS=OFF \
		-DCMAKE_BUILD_TYPE=Release \
		-S $(LIBWEBP_DIR) \
		-B $(@D)
	$(MAKE) -C $(@D) sharpyuv

# Make libsharpyuv.a for MT-Encoding
$(LIBSHARPYUV_MT): $(LIBWEBP_DIR)/CMakeLists.txt
	mkdir -p $(@D)
	emcmake cmake \
		-DWEBP_BUILD_ANIM_UTILS=OFF \
		-DWEBP_BUILD_CWEBP=OFF \
		-DWEBP_BUILD_DWEBP=OFF \
		-DWEBP_BUILD_GIF2WEBP=OFF \
		-DWEBP_BUILD_IMG2WEBP=OFF \
		-DWEBP_BUILD_VWEBP=OFF \
		-DWEBP_BUILD_WEBPINFO=OFF \
		-DWEBP_BUILD_LIBWEBPMUX=OFF \
		-DWEBP_BUILD_WEBPMUX=OFF \
		-DWEBP_BUILD_EXTRAS=OFF \
		-DBUILD_SHARED_LIBS=OFF \
		-DCMAKE_BUILD_TYPE=Release \
		-S $(LIBWEBP_DIR) \
		-B $(@D)
	$(MAKE) -C $(@D) sharpyuv

clean:
	$(MAKE) $(HELPER_MAKEFLAGS) OUT_JS=$(OUT_DEC_JS) clean
	$(MAKE) $(HELPER_MAKEFLAGS) OUT_JS=$(OUT_DEC_SIMD_JS) clean
	$(RM) -r $(LIBDAV1D_DIR)/build $(LIBDAV1D_ST_BUILD) $(LIBDAV1D_SIMD_BUILD)
	$(MAKE) $(HELPER_MAKEFLAGS) OUT_JS=$(OUT_ENC_JS) clean
	$(MAKE) $(HELPER_MAKEFLAGS) OUT_JS=$(OUT_ENC_SIMD_JS) clean
	$(MAKE) $(HELPER_MAKEFLAGS) OUT_JS=$(OUT_ENC_MT_JS) clean
