#!/usr/bin/env bash
# Packs @zonsh/ui from a zon/ui checkout into ui/vendor/ and points package.json at it.
#
#   ui/scripts/update-zon-ui.sh [path-to-zon-ui-checkout] [git-ref]
#
# The package is built from a fresh clone of the ref (default: HEAD), so uncommitted work in the
# checkout never ends up in OpenPanel. Needs git, pnpm and node.
set -euo pipefail

UI_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${1:-$UI_DIR/../../ui}"
REF="${2:-HEAD}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

git clone --quiet "$SRC" "$WORK/zon-ui"
git -C "$WORK/zon-ui" checkout --quiet "$REF"
SHA="$(git -C "$WORK/zon-ui" rev-parse --short HEAD)"

(
  cd "$WORK/zon-ui"
  pnpm install --frozen-lockfile
  pnpm --filter @zonsh/ui build
)

VERSION="$(node -p "require('$WORK/zon-ui/packages/ui/package.json').version")"
TARBALL="zonsh-ui-$VERSION-$SHA.tgz"
(cd "$WORK/zon-ui/packages/ui" && npm pack --silent --pack-destination "$WORK" > /dev/null)

mkdir -p "$UI_DIR/vendor"
rm -f "$UI_DIR"/vendor/zonsh-ui-*.tgz
mv "$WORK/zonsh-ui-$VERSION.tgz" "$UI_DIR/vendor/$TARBALL"

node -e "
  const fs = require('fs')
  const file = '$UI_DIR/package.json'
  const pkg = JSON.parse(fs.readFileSync(file, 'utf8'))
  pkg.dependencies['@zonsh/ui'] = 'file:vendor/$TARBALL'
  fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + '\n')
"
(cd "$UI_DIR" && npm install --legacy-peer-deps)

echo "@zonsh/ui $VERSION ($SHA) is in vendor/$TARBALL"
