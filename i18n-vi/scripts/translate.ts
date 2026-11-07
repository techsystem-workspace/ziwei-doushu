/**
 * Dịch các chuỗi còn thiếu trong i18n-vi/extracted.json sang tiếng Việt qua API OpenAI-compatible.
 * Chỉ dịch phần CHƯA có → chạy lại sau mỗi lần pull upstream là đủ.
 *
 *   VI_LLM_API_KEY=... [VI_LLM_BASE_URL=http://127.0.0.1:8317/v1] [VI_LLM_MODEL=...] npx tsx i18n-vi/scripts/translate.ts
 *
 * Ghi: strings.json, templates.json (zh → vi), chars.json (chữ Hán → âm Hán Việt, lưới an toàn khi chạy).
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const DIR = 'i18n-vi';
const BASE = process.env.VI_LLM_BASE_URL ?? 'http://127.0.0.1:8317/v1';
const KEY = process.env.VI_LLM_API_KEY ?? '';
const MODEL = process.env.VI_LLM_MODEL ?? 'claude-sonnet-4-6';
const CONCURRENCY = Number(process.env.VI_LLM_CONCURRENCY ?? 6);
const HAN = /[㐀-鿿]/;
const HAN_G = /[㐀-鿿]/g;

const load = (f: string): Record<string, string> => (existsSync(`${DIR}/${f}`) ? JSON.parse(readFileSync(`${DIR}/${f}`, 'utf8')) : {});
const save = (f: string, o: Record<string, string>) =>
  writeFileSync(`${DIR}/${f}`, JSON.stringify(Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1))), null, 1) + '\n');

const extracted: { strings: string[]; templates: string[] } = JSON.parse(readFileSync(`${DIR}/extracted.json`, 'utf8'));
const glossary = load('glossary.json');

const GLOSSARY_TEXT = Object.entries(glossary).map(([z, v]) => `${z}=${v}`).join('; ');
const SYSTEM = `Bạn là dịch giả chuyên nghiệp, dịch nội dung website Tử Vi Đẩu Số (紫微斗数, hệ phái Nghê Hải Hạ) từ tiếng Trung giản thể sang tiếng Việt.
Quy tắc:
1. Viết tiếng Việt hiện đại, tự nhiên, trôi chảy như người làm Tử Vi Việt Nam viết. KHÔNG "Hán Việt hóa" cả câu (sai: "nên thủ bất nghi động"; đúng: "nên giữ yên, không nên hành động").
2. Chỉ thuật ngữ chuyên môn (tên sao, tên cung, Tứ Hóa, can chi, tên cách cục, tên sách) mới dùng Hán Việt chuẩn, theo đúng bảng thuật ngữ bên dưới. Tên cung trong câu viết "cung Mệnh", "cung Phu Thê"...
3. Tên cách cục / khẩu quyết ngắn: phiên âm Hán Việt viết hoa chữ đầu rồi giải nghĩa ngắn nếu cần, ví dụ "廉贞七杀——半路埋尸" → "Liêm Trinh Thất Sát — Bán lộ mai thi (chết giữa đường)". Câu nói dài của thầy Nghê / cổ văn: dịch nghĩa sát, tự nhiên.
4. Giữ NGUYÊN các chỗ giữ biến {0} {1} {2}..., Markdown (#, **, -, |, >), xuống dòng, số, emoji, ký hiệu ★ ·. Dấu câu Trung đổi sang dấu Việt (，→, 。→. ：→: 、→, ；→; （）→() 《》→« » 「」“”→“”).
5. Nhãn giao diện ngắn: gọn, viết hoa chữ đầu. Ngày tháng: "1954年1月1日" → "1/1/1954"; 年→năm, 岁→tuổi, 时→giờ.
6. Không thêm giải thích, không bỏ sót ý. Không để lại chữ Hán nào trong bản dịch.
7. Trả về DUY NHẤT một JSON object có đúng các key như đầu vào, value là bản dịch.
Bảng thuật ngữ (Trung=Việt): ${GLOSSARY_TEXT}`;

const CHAR_SYSTEM = `Cho mỗi chữ Hán (giản thể), trả về âm Hán Việt phổ biến nhất (chữ thường, có dấu, một âm tiết; nếu chữ là thuật ngữ Tử Vi thì ưu tiên cách đọc trong Tử Vi, ví dụ 陷=hãm, 忌=kỵ, 禄=lộc). Đầu vào là JSON object {số thứ tự: chữ}; trả về DUY NHẤT JSON object có đúng các key số thứ tự đó, value là âm Hán Việt.`;

async function chat(system: string, input: Record<string, string>): Promise<Record<string, string>> {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(`${BASE}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
        body: JSON.stringify({ model: MODEL, temperature: 0.2, messages: [{ role: 'system', content: system }, { role: 'user', content: JSON.stringify(input, null, 1) }] }),
        signal: AbortSignal.timeout(300_000),
      });
      const body = await res.json();
      const text: string = body.choices?.[0]?.message?.content ?? '';
      const json = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
      if (!json) throw new Error(`không có JSON (${res.status}): ${JSON.stringify(body).slice(0, 200)}`);
      return JSON.parse(json);
    } catch (e) {
      if (attempt >= 4) throw e;
      console.warn(`  thử lại ${attempt}: ${(e as Error).message.slice(0, 150)}`);
      await new Promise(r => setTimeout(r, 2000 * attempt));
    }
  }
}

const placeholders = (s: string) => (s.match(/\{\d+\}/g) ?? []).sort().join();

/** Chia lô theo tổng độ dài, dịch song song, kiểm tra và ghi dần. */
async function run(label: string, file: string, keys: string[], system: string, maxChars: number, validate: (zh: string, vi: string) => boolean) {
  const out = load(file);
  const missing = keys.filter(k => !(k in out));
  console.log(`${label}: ${keys.length} mục, thiếu ${missing.length}`);
  const batches: string[][] = [];
  let cur: string[] = [], len = 0;
  for (const k of missing) {
    if (cur.length && (len + k.length > maxChars || cur.length >= 60)) { batches.push(cur); cur = []; len = 0; }
    cur.push(k); len += k.length;
  }
  if (cur.length) batches.push(cur);

  let done = 0, bad = 0;
  const worker = async () => {
    for (let b; (b = batches.shift()); ) {
      const input = Object.fromEntries(b.map((k, i) => [String(i + 1), k]));
      try {
        const res = await chat(system, input);
        b.forEach((k, i) => {
          const vi = res[String(i + 1)];
          if (typeof vi === 'string' && vi.trim() && validate(k, vi)) out[k] = vi;
          else bad++;
        });
      } catch (e) { bad += b.length; console.error(`  lô lỗi: ${(e as Error).message.slice(0, 200)}`); }
      done += b.length;
      save(file, out);
      process.stdout.write(`\r  ${done}/${missing.length} (lỗi/bỏ qua ${bad})`);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  // dọn mục cũ không còn trong nguồn
  const keep = new Set(keys);
  for (const k of Object.keys(out)) if (!keep.has(k)) delete out[k];
  save(file, out);
  console.log(`\n  xong, còn thiếu ${keys.filter(k => !(k in out)).length} (chạy lại để dịch tiếp)`);
}

const noHan = (_: string, vi: string) => (vi.match(HAN_G)?.length ?? 0) === 0;

(async () => {
  if (!KEY) throw new Error('Thiếu VI_LLM_API_KEY');
  const strings = extracted.strings.filter(s => !(s in glossary));
  await run('Chuỗi', 'strings.json', strings, SYSTEM, 2500, noHan);
  await run('Mẫu', 'templates.json', extracted.templates, SYSTEM, 2500, (zh, vi) => noHan(zh, vi) && placeholders(zh) === placeholders(vi));
  const chars = [...new Set([...extracted.strings, ...extracted.templates, ...Object.keys(glossary)].join('').match(HAN_G) ?? [])];
  await run('Chữ Hán', 'chars.json', chars, CHAR_SYSTEM, 300, (_, vi) => !HAN.test(vi) && vi.trim().split(/\s+/).length === 1);
})();
