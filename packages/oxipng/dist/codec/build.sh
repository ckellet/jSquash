#!/bin/bash

set -e

rm -rf pkg pkg-parallel
export CFLAGS="${CFLAGS} -DUNALIGNED_ACCESS_IS_FAST=1"

# SIMD is available everywhere these packages run. Without it LLVM will not
# vectorise the PNG filter and deflate loops, which is where the time goes.
SIMD='-C target-feature=+simd128'

RUSTFLAGS="$SIMD" wasm-pack build -t web

RUSTFLAGS="$SIMD,+atomics,+bulk-memory" \
  wasm-pack build -t web -d pkg-parallel . -- \
  -Z build-std=panic_abort,std --features=parallel

rm pkg{,-parallel}/.gitignore
