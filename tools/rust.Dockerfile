ARG RUST_IMG=rust:1.92

FROM $RUST_IMG AS rust
ARG RUST_IMG

RUN cargo install wasm-pack --locked

# oxipng builds a C dependency (libdeflate) through the `cc` crate, which needs
# a working C compiler for the wasm32 target.
RUN apt-get update \
  && apt-get install -qqy clang \
  && rm -rf /var/lib/apt/lists/*

# WebAssembly SIMD is available in every browser these packages target, as well
# as Node and Cloudflare Workers. Without it LLVM will not vectorise the pixel
# loops at all, which is where most of the time in these crates goes.
#
# Set after `cargo install` so it does not apply to the host build of wasm-pack.
ENV RUSTFLAGS="-C target-feature=+simd128"

WORKDIR /src
CMD ["sh", "-c", "rm -rf pkg && wasm-pack build --target web -- --verbose --locked && rm pkg/.gitignore"]
