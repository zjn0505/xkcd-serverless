#!/bin/bash
# Prepare build directory with only necessary files for SAM deployment

set -e

BUILD_DIR=".aws-sam-build"
SRC_DIR="."

echo "Preparing build directory: $BUILD_DIR"

# Clean build directory
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

# Copy only necessary files
echo "Copying necessary files..."

# Copy compiled JavaScript
if [ -f "$SRC_DIR/fcm-push-handler.js" ]; then
  cp "$SRC_DIR/fcm-push-handler.js" "$BUILD_DIR/"
  echo "  ✓ fcm-push-handler.js"
else
  echo "  ✗ Warning: fcm-push-handler.js not found. Run 'npm run build' first."
  exit 1
fi

# Copy package.json (needed for dependencies)
cp "$SRC_DIR/package.json" "$BUILD_DIR/"
echo "  ✓ package.json"

# Copy node_modules (production dependencies only)
if [ -d "$SRC_DIR/node_modules" ]; then
  echo "  Copying node_modules (production dependencies)..."
  # Use npm ci --production in build dir, or copy node_modules
  # For simplicity, copy entire node_modules (SAM will handle it)
  cp -r "$SRC_DIR/node_modules" "$BUILD_DIR/" 2>/dev/null || {
    echo "  Note: Copying node_modules, this may take a moment..."
    rsync -a --exclude='.cache' --exclude='*.ts' --exclude='*.map' \
      "$SRC_DIR/node_modules/" "$BUILD_DIR/node_modules/" 2>/dev/null || \
    cp -r "$SRC_DIR/node_modules" "$BUILD_DIR/"
  }
  echo "  ✓ node_modules"
else
  echo "  ✗ Warning: node_modules not found. Run 'npm install' first."
  exit 1
fi

echo ""
echo "Build directory prepared: $BUILD_DIR"
echo "Files included:"
find "$BUILD_DIR" -type f | head -20
echo ""

