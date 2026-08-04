#!/usr/bin/env bash
set -Eeuo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(git -C "${script_dir}" rev-parse --show-toplevel)"
client_root="$(cd "${repo_root}/.." && pwd)"
output_dir="${1:-${client_root}/04-Deliverables/option-1/portable-vps}"

if [[ -n "$(git -C "${repo_root}" status --porcelain)" ]]; then
  echo "Refusing to package a dirty working tree. Commit and verify the deployment kit first." >&2
  exit 1
fi

commit="$(git -C "${repo_root}" rev-parse --short=12 HEAD)"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
base="mark-personal-ai-portable-${timestamp}-${commit}"
archive="${output_dir}/${base}.tar.gz"
checksum="${archive}.sha256"
listing="$(mktemp)"
extract_dir="$(mktemp -d)"
trap 'rm -f "${listing}"; rm -rf "${extract_dir}"' EXIT

install -d -m 0700 "${output_dir}"
git -C "${repo_root}" archive --format=tar --prefix="${base}/" HEAD \
  | gzip -9 > "${archive}"
chmod 0600 "${archive}"

tar -tzf "${archive}" > "${listing}"
if grep -E '(^|/)(\.git|node_modules|\.next|\.work|data|screenshots|__MACOSX)(/|$)|(^|/)\._|\.DS_Store$|(^|/)\.env$|\.(db|sqlite|pem|p12|pfx)$' "${listing}"; then
  echo "Archive contains a forbidden generated, data or credential path." >&2
  exit 1
fi

tar -xzf "${archive}" -C "${extract_dir}"
if grep -RIlE --exclude='*.lock' \
  '(-----BEGIN (OPENSSH|RSA|EC|PRIVATE) PRIVATE KEY-----|cfat_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9_-]{20,})' \
  "${extract_dir}" | grep -q .; then
  echo "Archive secret scan failed." >&2
  exit 1
fi

archive_hash="$(sha256sum "${archive}" 2>/dev/null | awk '{print $1}' || shasum -a 256 "${archive}" | awk '{print $1}')"
printf '%s  %s\n' "${archive_hash}" "$(basename "${archive}")" > "${checksum}"
chmod 0600 "${checksum}"

echo "Archive: ${archive}"
echo "SHA-256: ${archive_hash}"
echo "Files: $(wc -l < "${listing}" | tr -d ' ')"
