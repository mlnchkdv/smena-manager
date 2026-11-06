#!/usr/bin/env bash
# Ubuntu 24.04 only. Run explicitly as root; no firewall, swap or site changes.
set -euo pipefail
[[ ${EUID} -eq 0 ]] || { echo 'Run bootstrap with sudo.' >&2; exit 1; }
[[ $# -eq 1 && $1 == --install-packages-and-node ]] || {
  echo 'Usage: sudo bash deploy/vps/bootstrap.sh --install-packages-and-node' >&2
  exit 2
}
# shellcheck source=/dev/null
source /etc/os-release
[[ $ID == ubuntu && $VERSION_ID == 24.04 ]] || { echo 'This bootstrap supports Ubuntu 24.04 only.' >&2; exit 1; }
apt-get update
apt-get install -y --no-install-recommends ca-certificates curl xz-utils git nginx certbot python3-certbot-nginx util-linux
case $(uname -m) in
  x86_64) arch=x64 ;;
  aarch64) arch=arm64 ;;
  *) echo 'Unsupported Node architecture.' >&2; exit 1 ;;
esac
node_root=/opt/smena-node
for directory in "$node_root" "$node_root/versions"; do
  [[ ! -L $directory ]] || { echo 'Refusing a symlink in the Node installation directories.' >&2; exit 1; }
  if [[ ! -e $directory ]]; then install -d -m 0755 "$directory"; fi
  [[ -d $directory && $(stat -c %u "$directory") == 0 && $(realpath "$directory") == "$directory" ]] || exit 1
  [[ -z $(find "$directory" -maxdepth 0 -perm /022 -print) ]] || { echo 'Node installation directories must not be group/world writable.' >&2; exit 1; }
done
stage=$(mktemp -d "$node_root/.download.XXXXXXXX")
[[ $stage == /opt/smena-node/.download.* && ! -L $stage ]] || exit 1
trap 'rm -rf -- "$stage"' EXIT
curl --fail --silent --show-error --proto '=https' --tlsv1.2 \
  https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt -o "$stage/SHASUMS256.txt"
read -r checksum filename < <(awk -v ending="-linux-${arch}.tar.xz" 'index($2,ending)==length($2)-length(ending)+1 {print $1, $2}' "$stage/SHASUMS256.txt")
[[ $checksum =~ ^[a-f0-9]{64}$ && $filename =~ ^node-v22\.[0-9]+\.[0-9]+-linux-(x64|arm64)\.tar\.xz$ ]] || {
  echo 'Unexpected official Node checksum manifest.' >&2; exit 1
}
curl --fail --silent --show-error --proto '=https' --tlsv1.2 \
  "https://nodejs.org/dist/latest-v22.x/$filename" -o "$stage/$filename"
(cd "$stage" && printf '%s  %s\n' "$checksum" "$filename" | sha256sum --check --status)
tar -xJf "$stage/$filename" --no-same-owner -C "$stage"
version_dir=${filename%.tar.xz}
chown -hR root:root "$stage/$version_dir"
chmod -R go-w "$stage/$version_dir"
if [[ ! -e $node_root/versions/$version_dir ]]; then
  mv -- "$stage/$version_dir" "$node_root/versions/$version_dir"
fi
[[ -d $node_root/versions/$version_dir && ! -L $node_root/versions/$version_dir ]] || exit 1
[[ $(stat -c %u "$node_root/versions/$version_dir") == 0 ]] || { echo 'Existing Node version must be root owned.' >&2; exit 1; }
[[ -z $(find "$node_root/versions/$version_dir" -xdev \( ! -user root -o \( ! -type l -perm /022 \) \) -print -quit) ]] || {
  echo 'Existing Node version has unsafe ownership or permissions.' >&2; exit 1
}
[[ ! -e $node_root/bin || -L $node_root/bin ]] || { echo 'Refusing to replace an unmanaged Node bin directory.' >&2; exit 1; }
ln -sfn -- "versions/$version_dir/bin" "$node_root/bin"
"$node_root/bin/node" --version
echo 'Dependencies ready. System Node, firewall, swap and existing sites were not reconfigured.'
