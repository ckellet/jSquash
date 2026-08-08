CODEC_URL = https://github.com/libjxl/libjxl.git
CODEC_VERSION = 9f544641ec83f6abd9da598bdd08178ee8a003e0
CODEC_DIR = node_modules/jxl
CODEC_BUILD_ROOT := $(CODEC_DIR)/build
# libjxl is configured once per (threads, SIMD) combination. The threaded and
# single-threaded wrappers cannot share a library: see the note above the
# configure rule below.
CODEC_ST_BUILD_DIR := $(CODEC_BUILD_ROOT)/st
CODEC_ST_SIMD_BUILD_DIR := $(CODEC_BUILD_ROOT)/st-simd
CODEC_MT_BUILD_DIR := $(CODEC_BUILD_ROOT)/mt
CODEC_MT_SIMD_BUILD_DIR := $(CODEC_BUILD_ROOT)/mt-simd
ENVIRONMENT = web,worker

PRE_JS = pre.js
OUT_JS = enc/jxl_enc.js enc/jxl_enc_simd.js enc/jxl_enc_mt.js enc/jxl_enc_mt_simd.js dec/jxl_dec.js dec/jxl_dec_simd.js
OUT_WASM = $(OUT_JS:.js=.wasm)
# Emscripten names the pthread worker .worker.js up to 3.1.x and .worker.mjs
# once EXPORT_ES6 is set on newer releases; clean has to cover both or a
# toolchain bump leaves the old one behind to be published.
OUT_WORKER = $(OUT_JS:.js=.worker.js) $(OUT_JS:.js=.worker.mjs)

.PHONY: all clean

all: $(OUT_JS)

# Define dependencies for all variations of build artifacts.
$(filter enc/%,$(OUT_JS)): enc/jxl_enc.cpp
$(filter dec/%,$(OUT_JS)): dec/jxl_dec.cpp

enc/jxl_enc.js dec/jxl_dec.js: CODEC_BUILD_DIR:=$(CODEC_ST_BUILD_DIR)
enc/jxl_enc_simd.js dec/jxl_dec_simd.js: CODEC_BUILD_DIR:=$(CODEC_ST_SIMD_BUILD_DIR)
enc/jxl_enc_mt.js: CODEC_BUILD_DIR:=$(CODEC_MT_BUILD_DIR)
enc/jxl_enc_mt_simd.js: CODEC_BUILD_DIR:=$(CODEC_MT_SIMD_BUILD_DIR)

enc/jxl_enc.js dec/jxl_dec.js: $(CODEC_ST_BUILD_DIR)/lib/libjxl.a
enc/jxl_enc_simd.js dec/jxl_dec_simd.js: $(CODEC_ST_SIMD_BUILD_DIR)/lib/libjxl.a
enc/jxl_enc_mt.js: $(CODEC_MT_BUILD_DIR)/lib/libjxl.a $(CODEC_MT_BUILD_DIR)/lib/libjxl_threads.a
enc/jxl_enc_mt_simd.js: $(CODEC_MT_SIMD_BUILD_DIR)/lib/libjxl.a $(CODEC_MT_SIMD_BUILD_DIR)/lib/libjxl_threads.a

# Disable errors on deprecated SIMD intrinsics.
# JPEG-XL & Highway need to catch up, once they do, we can remove this suppression.
export CXXFLAGS += -Wno-deprecated-declarations

# Compile multithreaded wrappers with -pthread.
enc/jxl_enc_mt.js enc/jxl_enc_mt_simd.js: CXXFLAGS+=-pthread

# Compile the SIMD wrappers with -msimd128 as well as the library they link.
# The static libs are LTO bitcode, so the vector instructions are only actually
# selected during codegen at link time; without the flag here the final link can
# scalarise work that the library was compiled to vectorise.
enc/jxl_enc_simd.js enc/jxl_enc_mt_simd.js dec/jxl_dec_simd.js: CXXFLAGS+=-msimd128

$(OUT_JS):
	$(CXX) \
		$(CXXFLAGS) \
		$(LDFLAGS) \
		-I $(CODEC_DIR) \
		-I $(CODEC_DIR)/lib \
		-I $(CODEC_DIR)/lib/include \
		-I $(CODEC_BUILD_DIR)/lib/include \
		-I $(CODEC_DIR)/third_party/highway \
		-I $(CODEC_DIR)/third_party/skcms \
		--pre-js $(PRE_JS) \
		--bind \
		-s ENVIRONMENT=$(ENVIRONMENT) \
		-s EXPORT_ES6=1 \
		-s DYNAMIC_EXECUTION=0 \
		-s MODULARIZE=1 \
		-s PTHREAD_POOL_SIZE='Math.min(navigator.hardwareConcurrency,8)' \
		-o $@ \
		$+ \
		$(CODEC_BUILD_DIR)/third_party/brotli/libbrotlidec-static.a \
		$(CODEC_BUILD_DIR)/third_party/brotli/libbrotlienc-static.a \
		$(CODEC_BUILD_DIR)/third_party/brotli/libbrotlicommon-static.a \
		$(CODEC_BUILD_DIR)/third_party/libskcms.a \
		$(CODEC_BUILD_DIR)/third_party/highway/libhwy.a

%/lib/libjxl.a: %/Makefile
	$(MAKE) -C $(<D) jxl-static

# Ordered after libjxl.a so `make -j` never runs two sub-makes inside the same
# CMake build tree at once - they share generated headers and object outputs.
%/lib/libjxl_threads.a: %/Makefile %/lib/libjxl.a
	$(MAKE) -C $(<D) jxl_threads-static

# The flags a build directory is configured with are pinned to the directory,
# not inherited from whichever wrapper happened to ask for it first. Because
# target-specific variables propagate to prerequisites, relying on inheritance
# would let `make -j` configure a directory with or without -pthread depending
# on which wrapper won the race.
#
# There is a separate library per (threads, SIMD) combination, and in
# particular the single-threaded wrappers get their own libjxl built *without*
# -pthread. They used to link the threaded one and simply omit -pthread and
# libjxl_threads, which worked on Emscripten 2.0.34 but is silently broken from
# 3.1.x on: TLS initialisers in -pthread objects are never run in a link that
# is not itself -pthread, so every thread_local with a dynamic initialiser
# keeps its zero value. That includes embind's cached _emval_get_method_caller
# id, which made the first val::new_() fail with "caller is not a function".
$(CODEC_MT_BUILD_DIR)/Makefile $(CODEC_MT_SIMD_BUILD_DIR)/Makefile: CXXFLAGS+=-pthread

# Enable SIMD on a SIMD build.
$(CODEC_ST_SIMD_BUILD_DIR)/Makefile $(CODEC_MT_SIMD_BUILD_DIR)/Makefile: CXXFLAGS+=-msimd128

# skcms is built into the directory being configured. It used to go to a fixed
# path under the source tree, which two concurrent configures race on - both
# write the object, both delete it, and the loser's rm fails the build - and it
# was named with CODEC_BUILD_DIR, which is only set when this rule is reached
# through a wrapper that defines it. $(@D) is the right directory by
# construction. Passing CXXFLAGS also gets skcms the -msimd128 of a SIMD build;
# it performs the decoder's colour transform, so it is on the hot path.
# Archived with emar rather than llvm-ar: the latter is not on PATH in newer
# emsdk images, and emar is the supported wrapper in every version.
%/Makefile: $(CODEC_DIR)/CMakeLists.txt
	emcmake cmake \
	$(CMAKE_FLAGS) \
	-DBUILD_SHARED_LIBS=0 \
	-DJPEGXL_ENABLE_BENCHMARK=0 \
	-DJPEGXL_ENABLE_EXAMPLES=0 \
	-DBUILD_TESTING=0 \
	-DCMAKE_CROSSCOMPILING_EMULATOR=node \
	-B $(@D) \
	$(<D)
	emcc $(CXXFLAGS) -Wall -o $(@D)/skcms.cc.o -I$(CODEC_DIR)/third_party/skcms -c $(CODEC_DIR)/third_party/skcms/skcms.cc
	emar rc $(@D)/third_party/libskcms.a $(@D)/skcms.cc.o
	rm $(@D)/skcms.cc.o

$(CODEC_DIR)/CMakeLists.txt:
	$(RM) -r $(@D)
	git init $(@D)
	git -C $(@D) fetch $(CODEC_URL) $(CODEC_VERSION) --depth 1
	git -C $(@D) checkout FETCH_HEAD
	git -C $(@D) submodule update --init --depth 1 --recursive --jobs `nproc`

clean:
	$(RM) $(OUT_JS) $(OUT_WASM) $(OUT_WORKER)
	$(MAKE) -C $(CODEC_ST_BUILD_DIR) clean
	$(MAKE) -C $(CODEC_ST_SIMD_BUILD_DIR) clean
	$(MAKE) -C $(CODEC_MT_BUILD_DIR) clean
	$(MAKE) -C $(CODEC_MT_SIMD_BUILD_DIR) clean
