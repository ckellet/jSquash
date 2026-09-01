ARG EMSDK_VERSION=3.1.57

FROM emscripten/emsdk:${EMSDK_VERSION}

ARG DEFAULT_CFLAGS="-O3 -flto"
ARG DEFAULT_CXX_FLAGS="-std=c++17"
# TEXTDECODER=1 uses TextDecoder where the runtime provides it and falls back
# to plain JS where it does not, so the "runs in simpler V8 runtimes" property
# is preserved. TEXTDECODER=0 was removed in Emscripten 4.x, which rejects it
# with `#error "TEXTDECODER must be either 1 or 2"`, and it was blocking the
# move to 4.0.16 - the first release published for arm64, and therefore the
# first that does not run under QEMU emulation on Apple Silicon.
ARG DEFAULT_EMSCRIPTEN_SETTINGS="\
-s PTHREAD_POOL_SIZE=navigator.hardwareConcurrency \
-s FILESYSTEM=0 \
-s ALLOW_MEMORY_GROWTH=1 \
-s TEXTDECODER=1 \
"

# autoconf/libtool/pkg-config are for MozJPEG; ninja and meson are for dav1d,
# which is the only meson project here. Keep pkg-config: MozJPEG's configure
# needs it, and dropping it fails that build rather than this one.
RUN apt-get update \
  && apt-get install -qqy autoconf libtool pkg-config ninja-build python3-pip \
  && rm -rf /var/lib/apt/lists/*

# meson comes from pip rather than apt so the version does not drift with the
# base image; dav1d wants a newer one than Ubuntu 22.04 ships.
RUN pip3 install meson

ENV CFLAGS="${DEFAULT_CFLAGS}"
ENV CXXFLAGS="${CFLAGS} ${DEFAULT_CXX_FLAGS}"
ENV LDFLAGS="${CFLAGS} ${DEFAULT_EMSCRIPTEN_SETTINGS}"

# Build and cache standard libraries with these flags + Embind.
RUN emcc ${CXXFLAGS} ${LDFLAGS} --bind -xc++ /dev/null -o /dev/null
# And another set for the pthread variant.
RUN emcc ${CXXFLAGS} ${LDFLAGS} --bind -pthread -xc++ /dev/null -o /dev/null

WORKDIR /src
CMD ["sh", "-c", "emmake make -j`nproc`"]
