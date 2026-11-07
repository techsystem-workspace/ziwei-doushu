#!/usr/bin/env bash
# Đồng bộ upstream (Renhuai123/ziwei-doushu) rồi cập nhật bản dịch tiếng Việt.
#   bash i18n-vi/scripts/sync-upstream.sh
# Không tự commit / push.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "✗ Working tree có thay đổi chưa commit. Commit/stash trước rồi chạy lại." >&2
  exit 1
fi

echo "== 1. fetch + merge upstream/main"
git fetch upstream
if ! git merge --no-edit upstream/main; then
  cat >&2 <<'EOF'

✗ Merge có conflict. Cách xử lý:
  - git status                      # xem file conflict
  - File trong i18n-vi/: giữ bản của mình (git checkout --ours <file>).
  - app/layout.tsx: lấy bản upstream rồi thêm lại đúng 1 dòng import + 1 thẻ <ViTranslator />.
  - Các file khác: lấy bản upstream (git checkout --theirs <file>).
  - git add <file> && git commit    # rồi chạy lại script này
  - Bỏ cuộc: git merge --abort
EOF
  exit 1
fi

echo "== 2. extract"
npx tsx i18n-vi/scripts/extract.ts

echo "== 3. translate (chỉ phần thiếu)"
if [ -z "${VI_LLM_API_KEY:-}" ] && [ -f /projects/cliproxy/config.yaml ]; then
  # access.api-keys[0] trong config cliproxy
  VI_LLM_API_KEY=$(awk '
    /^access:/ {a=1; next}
    a && /^[^ #]/ {exit}
    a && /api-keys:/ {k=1; next}
    a && k && /^ *- / {sub(/^ *- */, ""); gsub(/["\047]/, ""); print; exit}
  ' /projects/cliproxy/config.yaml)
  export VI_LLM_API_KEY
fi
if [ -n "${VI_LLM_API_KEY:-}" ]; then
  npx tsx i18n-vi/scripts/translate.ts
else
  echo "⚠ Không có VI_LLM_API_KEY → bỏ qua bước dịch." >&2
fi

echo "== 4. coverage"
npx tsx i18n-vi/scripts/coverage.ts --warn

echo
echo "Xong. Kiểm tra rồi commit:"
echo "  git add i18n-vi && git commit -m 'chore(i18n-vi): sync upstream + dịch phần mới'"
echo "  git push origin main   # tự chạy khi đã chắc chắn"
