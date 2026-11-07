# i18n-vi — Bản Việt hóa (fork của Renhuai123/ziwei-doushu)

## Kiến trúc

Không sửa code upstream để thêm i18n. Thay vào đó, trang vẫn render tiếng Trung như gốc, rồi một client component
dịch **DOM** sang tiếng Việt lúc runtime (text node, `title`, `placeholder`… — tra từ điển JSON trong thư mục này).

Lý do: upstream cập nhật liên tục và chuỗi Hán nằm rải rác khắp `app/`, `components/`, `lib/`. Bọc từng chuỗi bằng `t()`
sẽ đụng hàng trăm file → mỗi lần merge upstream là một lần conflict. Dịch ở DOM thì fork chỉ có **một điểm móc duy nhất**:
`app/layout.tsx` (1 dòng import + 1 thẻ `<ViTranslator />`). Mọi thứ khác nằm trong `i18n-vi/`, upstream không bao giờ đụng tới.

> Đặt dòng import ở **dòng 1** của `layout.tsx`, không đặt cuối khối import: upstream hay thêm import vào cuối khối
> (vd commit `5134fb1`) và sẽ conflict với dòng của mình (đã kiểm chứng bằng mô phỏng merge).

## Cấu trúc

| File | Vai trò |
|---|---|
| `runtime.ts`, `ViTranslator.tsx`, `vi.css` | Bộ dịch DOM lúc runtime |
| `glossary.json` | Thuật ngữ chuẩn (tên sao, cung, Tứ Hóa, can chi…) — `{ "中文": "Tiếng Việt" }`, ưu tiên cao nhất |
| `extracted.json` | Danh sách chuỗi/mẫu Hán quét từ source (sinh tự động, đừng sửa tay) |
| `strings.json` | Bản dịch chuỗi cố định `{ zh: vi }` |
| `templates.json` | Bản dịch chuỗi có biến, `{0}` `{1}`… là chỗ giữ biến |
| `chars.json` | Chữ Hán → âm Hán Việt, lưới an toàn cho chuỗi chưa có trong từ điển |
| `scripts/extract.ts` | Quét source → `extracted.json` |
| `scripts/translate.ts` | Dịch **phần còn thiếu** qua API OpenAI-compatible |
| `scripts/coverage.ts` | Báo chuỗi chưa dịch / còn chữ Hán / lệch placeholder |
| `scripts/sync-upstream.sh` | Toàn bộ quy trình đồng bộ upstream |

## Đồng bộ upstream

```bash
bash i18n-vi/scripts/sync-upstream.sh
```

Các bước: `git fetch upstream` → `git merge upstream/main` (dừng và in hướng dẫn nếu conflict) → extract → translate
(chỉ phần thiếu) → coverage → nhắc commit. Script **không** tự commit/push.

API key: lấy từ `VI_LLM_API_KEY`; nếu không có thì đọc `access.api-keys[0]` trong `/projects/cliproxy/config.yaml`.
Tùy chọn: `VI_LLM_BASE_URL` (mặc định `http://127.0.0.1:8317/v1`), `VI_LLM_MODEL`, `VI_LLM_CONCURRENCY`.

Chạy lẻ từng bước:

```bash
npx tsx i18n-vi/scripts/extract.ts
VI_LLM_API_KEY=... npx tsx i18n-vi/scripts/translate.ts
npx tsx i18n-vi/scripts/coverage.ts          # exit 1 nếu còn thiếu; --warn để luôn exit 0
```

## Sửa tay một bản dịch

Mở `strings.json` (hoặc `templates.json`), tìm key tiếng Trung, sửa value. `translate.ts` chỉ dịch key **chưa có**,
nên lần chạy sau không ghi đè bản sửa tay. Muốn dịch lại một chuỗi bằng máy: xóa key đó rồi chạy `translate.ts`.
Với `templates.json` phải giữ nguyên các `{0}` `{1}`… (`coverage.ts` sẽ báo nếu lệch).

Lưu ý: key bị xóa khỏi source upstream cũng sẽ tự bị dọn khỏi file dịch ở lần chạy `translate.ts` kế tiếp.

## Thêm thuật ngữ

Thêm `"中文": "Tiếng Việt"` vào `glossary.json`. Glossary vừa được tra trực tiếp lúc runtime, vừa được đưa vào prompt dịch.
Bản dịch cũ đã có **không** tự cập nhật theo thuật ngữ mới — muốn áp lại thì xóa các key liên quan trong
`strings.json`/`templates.json` rồi chạy `translate.ts`.

## Giới hạn đã biết

- HTML render phía server và SEO meta (`<title>`, description, OpenGraph trong `layout.tsx`) vẫn là tiếng Trung;
  bot/preview link thấy bản Trung, chỉ người dùng thật (chạy JS) mới thấy tiếng Việt.
- Prompt gửi AI vẫn là tiếng Trung (đi từ code, không qua DOM), nên câu trả lời AI cũng có thể là tiếng Trung.
- Chuỗi Hán ghép động lúc runtime không có trong source (dữ liệu API, nội dung sinh ra) chỉ được phủ bởi glossary + `chars.json`.
