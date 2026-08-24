# syntax=docker/dockerfile:1

# --- Build stage -------------------------------------------------------------
# Full compiler toolchain + -dev headers needed to build Drogon (with PostgreSQL
# and Redis support compiled in — no Debian package ships that combination, the
# same gap we hit with the Homebrew bottle locally) and this project. This stage
# alone is several GB once Drogon's build artifacts and the compiler are counted;
# none of that belongs in the image that actually runs in production or on a
# teammate's machine — it's dead weight that only slows every pull/deploy and
# hands an attacker a full compiler if the running container is ever compromised.
# Multi-stage lets the runtime stage below start from a clean base and copy over
# only the one compiled binary plus the small set of shared libraries it actually
# links against at runtime.
FROM debian:bookworm-slim AS build

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    cmake \
    git \
    ca-certificates \
    pkg-config \
    libjsoncpp-dev \
    uuid-dev \
    zlib1g-dev \
    libssl-dev \
    libc-ares-dev \
    libpq-dev \
    libhiredis-dev \
    libyaml-cpp-dev \
    libbrotli-dev \
    && rm -rf /var/lib/apt/lists/*

# Pinned to the version already built and verified locally.
RUN git clone --recurse-submodules --branch v1.9.13 --depth 1 \
    https://github.com/drogonframework/drogon.git /tmp/drogon
RUN cmake -S /tmp/drogon -B /tmp/drogon/build \
        -DCMAKE_BUILD_TYPE=Release \
        -DCMAKE_CXX_STANDARD=17 \
        -DCMAKE_CXX_STANDARD_REQUIRED=ON \
        -DBUILD_POSTGRESQL=ON \
        -DBUILD_MYSQL=OFF \
        -DBUILD_SQLITE=OFF \
        -DBUILD_REDIS=ON \
        -DBUILD_TESTING=OFF \
        -DBUILD_EXAMPLES=OFF \
    && cmake --build /tmp/drogon/build -j"$(nproc)" \
    && cmake --install /tmp/drogon/build \
    && rm -rf /tmp/drogon

WORKDIR /app
COPY CMakeLists.txt ./
COPY main.cc ./
COPY controllers ./controllers
COPY utils ./utils
COPY models ./models
COPY filters ./filters
COPY plugins ./plugins
COPY views ./views
COPY test ./test

# Target just the `backend` executable specifically — the default "build everything"
# target would also compile backend_test (Drogon's test-framework binary from
# test/CMakeLists.txt), which the running container has no use for.
RUN cmake -S . -B build \
        -DCMAKE_BUILD_TYPE=Release \
        -DCMAKE_CXX_STANDARD=17 \
        -DCMAKE_CXX_STANDARD_REQUIRED=ON \
    && cmake --build build --target backend -j"$(nproc)"

# --- Runtime stage -------------------------------------------------------------
FROM debian:bookworm-slim AS runtime

# Only the shared libraries the compiled binary actually links against, plus
# gettext-base for envsubst (used by docker-entrypoint.sh, not by the app itself).
# No compiler, no -dev headers, no build tools, no source code.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libjsoncpp25 \
    libuuid1 \
    zlib1g \
    libssl3 \
    libc-ares2 \
    libpq5 \
    libhiredis0.14 \
    libyaml-cpp0.7 \
    libbrotli1 \
    gettext-base \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=build /app/build/backend ./backend
COPY config.json.template ./
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

ENTRYPOINT ["./docker-entrypoint.sh"]
