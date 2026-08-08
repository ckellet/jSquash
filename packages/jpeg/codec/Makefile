CODEC_VERSION := 4.1.5
CODEC_URL := https://github.com/mozilla/mozjpeg/archive/v$(CODEC_VERSION).tar.gz
CODEC_DIR := node_modules/mozjpeg
ENVIRONMENT = web,worker

# wasm SIMD128. Needed at compile time so LLVM can vectorise, and at link time
# so the feature is recorded in the module. Both builds below use it.
SIMD_FLAGS = -msimd128

# MozJPEG is built twice, in two different SIMD configurations, because
# measurement says the encoder and the decoder want different ones.
#
# MozJPEG's hand-written SIMD comes in two flavours: x86, which is NASM and so
# cannot be assembled for wasm at all, and Arm Neon, which is plain C
# intrinsics. wasm-simd.patch makes the Neon flavour buildable here, on top of
# the SIMDe <arm_neon.h> that Emscripten ships. SIMDe lowers most intrinsics to
# wasm SIMD128 one-for-one, but the de-interleaving loads and stores
# (vld3/vld4/vst3/vst4) have no wasm equivalent and are emulated.
#
# That trade lands differently on each side. The encoder wins clearly: the
# progressive Huffman kernels dominate progressive encoding, which is this
# package's default, and they are ~8% faster with Neon. The decoder does not:
# its Neon kernels lean on exactly the de-interleaving operations SIMDe has to
# emulate, and they come out no faster than LLVM's own autovectorisation of the
# portable C, while adding ~106 KB to a binary browsers have to download.
#
# So the encoder links the Neon build and the decoder links a build with
# MozJPEG's SIMD off - still compiled -msimd128, so still vectorised, just by
# the compiler rather than by hand.
NEON_BUILD := $(CODEC_DIR)/build-neon
AUTOVEC_BUILD := $(CODEC_DIR)/build-autovec

PRE_JS = pre.js
OUT_JS := enc/mozjpeg_enc.js dec/mozjpeg_dec.js
OUT_WASM := $(OUT_JS:.js=.wasm)

EMSCRIPTEN_FLAGS = \
	${CXXFLAGS} \
	${LDFLAGS} \
	$(SIMD_FLAGS) \
	--pre-js $(PRE_JS) \
	--bind \
	-s ENVIRONMENT=$(ENVIRONMENT) \
	-s EXPORT_ES6=1 \
	-s DYNAMIC_EXECUTION=0 \
	-s MODULARIZE=1 \
	-s EXPORTED_RUNTIME_METHODS=HEAPU8

.PHONY: all clean

all: $(OUT_JS)

# MozJPEG 4.x generates jconfig.h into the build directory rather than shipping
# a checked-in config.h, so both the source tree and the relevant build tree
# are on the include path. MOZJPEG_VERSION used to come from that config.h.
enc/mozjpeg_enc.js: enc/mozjpeg_enc.cpp $(NEON_BUILD)/libjpeg.a $(NEON_BUILD)/rdswitch.o
	$(CXX) \
		-I $(CODEC_DIR) \
		-I $(NEON_BUILD) \
		-DMOZJPEG_VERSION=$(CODEC_VERSION) \
		$(EMSCRIPTEN_FLAGS) \
		-o $@ \
		$+

dec/mozjpeg_dec.js: dec/mozjpeg_dec.cpp $(AUTOVEC_BUILD)/libjpeg.a
	$(CXX) \
		-I $(CODEC_DIR) \
		-I $(AUTOVEC_BUILD) \
		$(EMSCRIPTEN_FLAGS) \
		-o $@ \
		$+

# set_quality_ratings() lives in rdswitch.c, which upstream only compiles as
# part of the cjpeg executable. Build the one object the encoder needs rather
# than pulling in cjpeg and its libpng dependency. The decoder does not use it.
$(NEON_BUILD)/rdswitch.o: $(NEON_BUILD)/libjpeg.a
	$(CC) \
		-I $(CODEC_DIR) \
		-I $(NEON_BUILD) \
		${CFLAGS} \
		$(SIMD_FLAGS) \
		-c $(CODEC_DIR)/rdswitch.c \
		-o $@

# $(1) build directory, $(2) WITH_SIMD.
#
# REQUIRE_SIMD is tied to WITH_SIMD so the Neon build fails loudly if the SIMD
# extensions are ever not selected. Without it MozJPEG quietly downgrades to a
# scalar build with only a warning, which is easy to miss and costs most of the
# performance this build exists for.
#
# BUILD would otherwise default to the current date and be baked into the
# binary, making every rebuild produce a different artifact.
define build_mozjpeg
	cd $(CODEC_DIR) && emcmake cmake -B $(notdir $(1)) \
		-DCMAKE_BUILD_TYPE=Release \
		-DCMAKE_C_FLAGS="${CFLAGS} $(SIMD_FLAGS)" \
		-DENABLE_SHARED=0 \
		-DENABLE_STATIC=1 \
		-DWITH_TURBOJPEG=0 \
		-DPNG_SUPPORTED=0 \
		-DWITH_ARITH_ENC=0 \
		-DWITH_ARITH_DEC=0 \
		-DWITH_SIMD=$(2) \
		-DREQUIRE_SIMD=$(2) \
		-DBUILD=jsquash \
		.
	$(MAKE) -C $(1) jpeg-static
endef

$(NEON_BUILD)/libjpeg.a: $(CODEC_DIR)/CMakeLists.txt
	$(call build_mozjpeg,$(NEON_BUILD),1)

$(AUTOVEC_BUILD)/libjpeg.a: $(CODEC_DIR)/CMakeLists.txt
	$(call build_mozjpeg,$(AUTOVEC_BUILD),0)

# MozJPEG has no wasm SIMD support of its own; see wasm-simd.patch for what the
# patch does and why.
#
# The final touch is load-bearing. tar restores the tarball's own mtimes, and
# MozJPEG 4.1.5 stamps CMakeLists.txt in 2023, so without it this target is
# permanently older than its prerequisite and re-runs on every build. That
# rm -rf then deletes archives make has already stat'd and believes are current,
# so the second build of a tree links against libjpeg.a files that are no longer
# there. Stamping the extracted tree makes the fetch happen once.
$(CODEC_DIR)/CMakeLists.txt: wasm-simd.patch
	rm -rf $(CODEC_DIR)
	mkdir -p $(CODEC_DIR)
	curl -sL $(CODEC_URL) | tar xz --strip 1 -C $(CODEC_DIR)
	cd $(CODEC_DIR) && patch -p1 < $(CURDIR)/wasm-simd.patch
	touch $(CODEC_DIR)/CMakeLists.txt

clean:
	$(RM) $(OUT_JS) $(OUT_WASM)
	$(RM) -r $(NEON_BUILD) $(AUTOVEC_BUILD)
