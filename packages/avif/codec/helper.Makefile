# This is a helper Makefile for building LibAVIF + LibAOM with given params.
#
# Params that must be supplied by the caller:
#   $(CODEC_DIR)
#   $(LIBAOM_DIR)
#   $(BUILD_DIR)
#   $(OUT_JS)
#   $(OUT_CPP)
#   $(LIBAOM_FLAGS)
#   $(LIBAVIF_FLAGS)
#   $(ENVIRONMENT)

# $(OUT_JS) is something like "enc/avif_enc.js" or "enc/avif_enc_mt.js"
# so $(OUT_BUILD_DIR) will be "node_modules/build/enc/avif_enc[_mt]"
OUT_BUILD_DIR := $(BUILD_DIR)/$(basename $(OUT_JS))

# We're making libavif and libaom for every node_modules/[enc|dec]/
CODEC_BUILD_DIR := $(OUT_BUILD_DIR)/libavif
CODEC_OUT := $(CODEC_BUILD_DIR)/libavif.a

LIBAOM_BUILD_DIR := $(OUT_BUILD_DIR)/libaom
LIBAOM_OUT := $(LIBAOM_BUILD_DIR)/libaom.a

OUT_WASM = $(OUT_JS:.js=.wasm)
OUT_WORKER=$(OUT_JS:.js=.worker.js)

PRE_JS = pre.js

.PHONY: all clean

all: $(OUT_JS)

# Only add libsharpyuv as a dependency for encoders.
# Yes, that if statement is true for encoders.
ifneq (,$(findstring enc/, $(OUT_JS)))
$(OUT_JS): $(LIBSHARPYUV)
$(CODEC_OUT): $(LIBSHARPYUV)
endif

$(OUT_JS): $(OUT_CPP) $(LIBAOM_OUT) $(CODEC_OUT)
	$(CXX) \
		-I $(CODEC_DIR)/include \
		$(CXXFLAGS) \
		$(LDFLAGS) \
		$(OUT_FLAGS) \
		--pre-js $(PRE_JS) \
		--bind \
		-s ERROR_ON_UNDEFINED_SYMBOLS=0 \
		-s ENVIRONMENT=$(ENVIRONMENT) \
		-s EXPORT_ES6=1 \
		-s DYNAMIC_EXECUTION=0 \
		-s MODULARIZE=1 \
		-s EXPORTED_RUNTIME_METHODS=HEAPU8 \
		-s PTHREAD_POOL_SIZE='Math.min(navigator.hardwareConcurrency,8)' \
		-s STACK_SIZE=$(STACK_SIZE) \
		-s INITIAL_MEMORY=$(INITIAL_MEMORY_SIZE) \
		-o $@ \
		$+

$(CODEC_OUT): $(CODEC_DIR)/CMakeLists.txt $(LIBAOM_OUT)
	emcmake cmake \
		-DCMAKE_LIBRARY_PATH=$(LIBSHARPYUV_BUILD_DIR) \
		-DCMAKE_BUILD_TYPE=Release \
		-DBUILD_SHARED_LIBS=0 \
		-DAVIF_CODEC_AOM=1 \
		-DAOM_LIBRARY=$(LIBAOM_OUT) \
		-DAOM_INCLUDE_DIR=$(LIBAOM_DIR) \
		$(LIBAVIF_FLAGS) \
		-B $(CODEC_BUILD_DIR) \
		$(CODEC_DIR) && \
	$(MAKE) -C $(CODEC_BUILD_DIR)

# CONFIG_ACCOUNTING is libaom's bit-accounting instrumentation. It defaults to
# 0 upstream and is only readable through the inspection API, which is off
# below - but it is not free when it is on: it threads an extra `const char *`
# through every entropy-decoder read and adds a null check plus two counter
# increments to each one. Those reads (`aom_read_symbol` and friends in
# aom_dsp/bitreader.h) are the hottest loop in AV1 decoding, and every call
# site also carries a string literal into rodata. Squoosh shipped it on; it
# buys this package nothing.
$(LIBAOM_OUT): $(LIBAOM_DIR)/CMakeLists.txt
	emcmake cmake \
		-DCMAKE_BUILD_TYPE=Release \
		-DENABLE_CCACHE=0 \
		-DAOM_TARGET_CPU=generic \
		-DENABLE_DOCS=0 \
		-DENABLE_TESTS=0 \
		-DENABLE_EXAMPLES=0 \
		-DENABLE_TOOLS=0 \
		-DCONFIG_ACCOUNTING=0 \
		-DCONFIG_INSPECTION=0 \
		-DCONFIG_RUNTIME_CPU_DETECT=0 \
		-DCONFIG_WEBM_IO=0 \
		$(LIBAOM_FLAGS) \
		-B $(LIBAOM_BUILD_DIR) \
		$(LIBAOM_DIR) && \
	$(MAKE) -C $(LIBAOM_BUILD_DIR)

clean:
	$(RM) $(OUT_JS) $(OUT_WASM) $(OUT_WORKER)
	$(MAKE) -C $(CODEC_BUILD_DIR) clean
	$(MAKE) -C $(LIBAOM_BUILD_DIR) clean