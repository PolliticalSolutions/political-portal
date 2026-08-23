# syntax=docker/dockerfile:1.7

ARG LAMBDA_BASE_IMAGE
FROM ${LAMBDA_BASE_IMAGE} AS builder

ARG AL2023_REPO_SSLVERIFY=1
ARG LAMBDA_BASE_IMAGE
ARG LAMBDA_BASE_OS
ARG TARGET_RUNTIME
ARG TARGET_ARCHITECTURE
ARG TESSERACT_VERSION
ARG TESSERACT_SOURCE_URL
ARG TESSERACT_SOURCE_SHA256
ARG LEPTONICA_VERSION
ARG LEPTONICA_SOURCE_URL
ARG LEPTONICA_SOURCE_SHA256
ARG POPPLER_VERSION
ARG POPPLER_SOURCE_URL
ARG POPPLER_SOURCE_SHA256
ARG TESSDATA_COMMIT
ARG ENG_TRAINEDDATA_SHA256
ARG OSD_TRAINEDDATA_SHA256
ARG SOURCE_DATE_EPOCH

ENV LAMBDA_BASE_IMAGE=${LAMBDA_BASE_IMAGE} \
    LAMBDA_BASE_OS=${LAMBDA_BASE_OS} \
    TARGET_RUNTIME=${TARGET_RUNTIME} \
    TARGET_ARCHITECTURE=${TARGET_ARCHITECTURE} \
    TESSERACT_VERSION=${TESSERACT_VERSION} \
    TESSERACT_SOURCE_URL=${TESSERACT_SOURCE_URL} \
    TESSERACT_SOURCE_SHA256=${TESSERACT_SOURCE_SHA256} \
    LEPTONICA_VERSION=${LEPTONICA_VERSION} \
    LEPTONICA_SOURCE_URL=${LEPTONICA_SOURCE_URL} \
    LEPTONICA_SOURCE_SHA256=${LEPTONICA_SOURCE_SHA256} \
    POPPLER_VERSION=${POPPLER_VERSION} \
    POPPLER_SOURCE_URL=${POPPLER_SOURCE_URL} \
    POPPLER_SOURCE_SHA256=${POPPLER_SOURCE_SHA256} \
    TESSDATA_COMMIT=${TESSDATA_COMMIT} \
    ENG_TRAINEDDATA_SHA256=${ENG_TRAINEDDATA_SHA256} \
    OSD_TRAINEDDATA_SHA256=${OSD_TRAINEDDATA_SHA256} \
    SOURCE_DATE_EPOCH=${SOURCE_DATE_EPOCH}

RUN set -eux; \
    if [ "${AL2023_REPO_SSLVERIFY}" = "0" ]; then \
      DNF="dnf --setopt=amazonlinux.sslverify=0"; \
    else \
      DNF="dnf"; \
    fi; \
    ${DNF} install -y \
      autoconf \
      automake \
      cmake \
      diffutils \
      file \
      findutils \
      fontconfig-devel \
      freetype-devel \
      gcc \
      gcc-c++ \
      giflib-devel \
      libarchive-devel \
      libcurl-devel \
      libjpeg-turbo-devel \
      lcms2-devel \
      libpng-devel \
      libtiff-devel \
      libtool \
      libwebp-devel \
      make \
      openjpeg2-devel \
      patch \
      pkgconf-pkg-config \
      tar \
      xz \
      zlib-devel; \
    ${DNF} clean all

WORKDIR /build
COPY .sources/tesseract-5.3.0.tar.gz /build/sources/tesseract.tar.gz
COPY .sources/leptonica-1.82.0.tar.gz /build/sources/leptonica.tar.gz
COPY .sources/poppler-22.12.0.tar.xz /build/sources/poppler.tar.xz
COPY .sources/eng.traineddata /build/trained-data/eng.traineddata
COPY .sources/osd.traineddata /build/trained-data/osd.traineddata
COPY assemble_layer.py /build/assemble_layer.py

RUN set -eux; \
    echo "${TESSERACT_SOURCE_SHA256}  /build/sources/tesseract.tar.gz" | sha256sum -c -; \
    echo "${LEPTONICA_SOURCE_SHA256}  /build/sources/leptonica.tar.gz" | sha256sum -c -; \
    echo "${POPPLER_SOURCE_SHA256}  /build/sources/poppler.tar.xz" | sha256sum -c -; \
    echo "${ENG_TRAINEDDATA_SHA256}  /build/trained-data/eng.traineddata" | sha256sum -c -; \
    echo "${OSD_TRAINEDDATA_SHA256}  /build/trained-data/osd.traineddata" | sha256sum -c -

RUN set -eux; \
    mkdir -p /build/src/leptonica; \
    tar -xzf /build/sources/leptonica.tar.gz -C /build/src/leptonica --strip-components=1; \
    cmake -S /build/src/leptonica -B /build/leptonica-build \
      -DCMAKE_BUILD_TYPE=Release \
      -DCMAKE_INSTALL_PREFIX=/opt/ocr \
      -DCMAKE_INSTALL_LIBDIR=lib64 \
      -DBUILD_PROG=OFF \
      -DBUILD_SHARED_LIBS=ON; \
    cmake --build /build/leptonica-build --parallel "$(nproc)"; \
    cmake --install /build/leptonica-build

RUN set -eux; \
    mkdir -p /build/src/tesseract; \
    tar -xzf /build/sources/tesseract.tar.gz -C /build/src/tesseract --strip-components=1; \
    PKG_CONFIG_PATH=/opt/ocr/lib64/pkgconfig \
    cmake -S /build/src/tesseract -B /build/tesseract-build \
      -DCMAKE_BUILD_TYPE=Release \
      -DCMAKE_INSTALL_PREFIX=/opt/ocr \
      -DCMAKE_INSTALL_LIBDIR=lib64 \
      -DBUILD_SHARED_LIBS=ON \
      -DBUILD_TRAINING_TOOLS=OFF \
      -DBUILD_TESTS=OFF \
      -DDISABLE_ARCHIVE=OFF \
      -DDISABLE_CURL=OFF \
      -DOPENMP_BUILD=ON; \
    cmake --build /build/tesseract-build --parallel "$(nproc)"; \
    cmake --install /build/tesseract-build

RUN set -eux; \
    mkdir -p /build/src/poppler; \
    tar -xJf /build/sources/poppler.tar.xz -C /build/src/poppler --strip-components=1; \
    cmake -S /build/src/poppler -B /build/poppler-build \
      -DCMAKE_BUILD_TYPE=Release \
      -DCMAKE_INSTALL_PREFIX=/opt/ocr \
      -DCMAKE_INSTALL_LIBDIR=lib64 \
      -DBUILD_GTK_TESTS=OFF \
      -DBUILD_QT5_TESTS=OFF \
      -DBUILD_QT6_TESTS=OFF \
      -DBUILD_CPP_TESTS=OFF \
      -DENABLE_BOOST=OFF \
      -DENABLE_CPP=OFF \
      -DENABLE_GLIB=OFF \
      -DENABLE_GOBJECT_INTROSPECTION=OFF \
      -DENABLE_GPGME=OFF \
      -DENABLE_LIBCURL=OFF \
      -DENABLE_NSS3=OFF \
      -DENABLE_QT5=OFF \
      -DENABLE_QT6=OFF \
      -DENABLE_UNSTABLE_API_ABI_HEADERS=OFF \
      -DENABLE_UTILS=ON \
      -DRUN_GPERF_IF_PRESENT=OFF; \
    cmake --build /build/poppler-build --parallel "$(nproc)"; \
    cmake --install /build/poppler-build

RUN LD_LIBRARY_PATH=/opt/ocr/lib64:/opt/ocr/lib \
    python /build/assemble_layer.py \
      --prefix /opt/ocr \
      --trained-data /build/trained-data \
      --output /build/output

FROM scratch AS artifact
COPY --from=builder /build/output/ /
