#!/usr/bin/env bash
set -euo pipefail

OUT_DIR=${1:?output directory required}
CACHE_DIR=${2:?cache directory required}
: "${ASEPRITE_VERSION:?ASEPRITE_VERSION required}"
: "${PIXEL_SNAPPER_REV:?PIXEL_SNAPPER_REV required}"

mkdir -p "$OUT_DIR" "$CACHE_DIR"

SNAP_ROOT="$CACHE_DIR/pixel-snapper-$PIXEL_SNAPPER_REV"
if [[ ! -x "$SNAP_ROOT/bin/spritefusion-pixel-snapper" ]]; then
  rm -rf "$SNAP_ROOT"
  cargo install --git https://github.com/Hugo-Dz/spritefusion-pixel-snapper \
    --rev "$PIXEL_SNAPPER_REV" --locked --root "$SNAP_ROOT" spritefusion-pixel-snapper
fi
cp "$SNAP_ROOT/bin/spritefusion-pixel-snapper" "$OUT_DIR/spritefusion-pixel-snapper"
chmod +x "$OUT_DIR/spritefusion-pixel-snapper"

ASE_BUNDLE="$CACHE_DIR/aseprite-$ASEPRITE_VERSION-cli-none"
if [[ ! -x "$ASE_BUNDLE/aseprite" || ! -f "$ASE_BUNDLE/data/gui.xml" ]]; then
  WORK="$RUNNER_TEMP/aseprite-$ASEPRITE_VERSION"
  rm -rf "$WORK" "$ASE_BUNDLE"
  mkdir -p "$WORK/src" "$ASE_BUNDLE"
  curl -L --fail --retry 3 -o "$WORK/aseprite.zip" \
    "https://github.com/aseprite/aseprite/releases/download/v${ASEPRITE_VERSION}/Aseprite-v${ASEPRITE_VERSION}-Source.zip"
  unzip -q "$WORK/aseprite.zip" -d "$WORK/src"
  ASE_SRC="$WORK/src"
  if [[ ! -f "$ASE_SRC/src/app/CMakeLists.txt" ]]; then
    ASE_SRC=$(find "$WORK/src" -maxdepth 2 -type f -name CMakeLists.txt -printf '%h\n' | while read -r d; do
      [[ -f "$d/src/app/CMakeLists.txt" ]] && echo "$d"
    done | head -1)
  fi
  test -n "$ASE_SRC"
  test -f "$ASE_SRC/data/gui.xml"
  export CC=clang CXX=clang++
  cmake -S "$ASE_SRC" -B "$WORK/build" -G Ninja \
    -DCMAKE_BUILD_TYPE=Release \
    -DLAF_BACKEND=none \
    -DENABLE_SCRIPTING=OFF \
    -DENABLE_TESTS=OFF \
    -DENABLE_NEWS=OFF \
    -DENABLE_UPDATER=OFF
  cmake --build "$WORK/build" --target aseprite -j2
  cp "$WORK/build/bin/aseprite" "$ASE_BUNDLE/aseprite"
  cp -a "$ASE_SRC/data" "$ASE_BUNDLE/data"
  chmod +x "$ASE_BUNDLE/aseprite"
fi

cp "$ASE_BUNDLE/aseprite" "$OUT_DIR/aseprite"
rm -rf "$OUT_DIR/data"
cp -a "$ASE_BUNDLE/data" "$OUT_DIR/data"
chmod +x "$OUT_DIR/aseprite"
(
  cd "$OUT_DIR"
  ./aseprite --version
  ./spritefusion-pixel-snapper --version
)

cat > "$OUT_DIR/PROVENANCE.txt" <<EOF
spritefusion-pixel-snapper revision=$PIXEL_SNAPPER_REV
aseprite version=$ASEPRITE_VERSION source=official backend=none purpose=batch-cli runtime_bundle=data
EOF
sha256sum "$OUT_DIR/spritefusion-pixel-snapper" "$OUT_DIR/aseprite" "$OUT_DIR/data/gui.xml" > "$OUT_DIR/SHA256SUMS"
