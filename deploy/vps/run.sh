#!/usr/bin/env bash
set -euo pipefail
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
node_bin=${SMENA_NODE_BIN:-/opt/smena-node/bin/node}
[[ -x $node_bin ]] || { echo 'Install isolated Node first with bootstrap.sh, or set SMENA_NODE_BIN to Node 22.' >&2; exit 1; }
exec "$node_bin" "$script_dir/manage.mjs" "$@"
