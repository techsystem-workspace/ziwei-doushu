/**
 * Bộ dịch zh → vi thuần (không đụng DOM). Từ điển được nạp qua setDicts().
 * Thứ tự: glossary → strings → templates → phân đoạn longest-match (glossary+strings) → chars.json.
 */
type Dict = Record<string, string>;
type Tpl = { re: RegExp; order: number[]; vi: string; lit: number };

const HAN = /[㐀-䶿一-鿿豈-﫿]/;
// Hán hoặc dấu câu toàn khổ (，：（） …) → cần xử lý; còn lại trả nguyên.
const NEEDS = /[㐀-䶿一-鿿豈-﫿　-〿！-｠]/;
const SEG_MAX = 12;

let G: Dict = {}, S: Dict = {}, C: Dict = {};
let T: Tpl[] = [];
let seg = new Map<string, string>();
const cache = new Map<string, string>();

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function setDicts(d: { glossary?: Dict; strings?: Dict; templates?: Dict; chars?: Dict }) {
  G = d.glossary ?? {}; S = d.strings ?? {}; C = d.chars ?? {};
  T = [];
  for (const [zh0, vi] of Object.entries(d.templates ?? {})) {
    const parts = norm(zh0).split(/\{(\d+)\}/); // chẵn: chữ, lẻ: số biến
    const order: number[] = [];
    let src = '^', lit = 0;
    parts.forEach((p, i) => {
      if (i % 2) { order.push(+p); src += '(.+?)'; } else { src += esc(p); lit += p.length; }
    });
    if (order.length && lit) T.push({ re: new RegExp(src + '$'), order, vi, lit });
  }
  T.sort((a, b) => b.lit - a.lit);
  seg = new Map();
  for (const dict of [S, G]) // G ghi đè S
    for (const [k, v] of Object.entries(dict)) if (k.length <= SEG_MAX) seg.set(k, v);
  cache.clear();
}

export const needsTranslate = (s: string) => NEEDS.test(s);

const PUNCT: Record<string, string> = {
  '，': ', ', '。': '. ', '：': ': ', '；': '; ', '、': ', ', '！': '! ', '？': '? ',
  '（': ' (', '）': ') ', '《': ' “', '》': '” ', '「': ' “', '」': '” ', '『': ' “', '』': '” ',
  '“': ' “', '”': '” ', '【': ' [', '】': '] ', '……': '… ', '…': '… ', '——': ' — ', '～': '~', '　': ' ',
};
const PUNCT_RE = /……|——|[，。：；、！？（）《》「」『』“”【】…～　]/g;
const WORD_END = /[\p{L}\p{N}]$/u, WORD_START = /^[\p{L}\p{N}]/u;

function segment(s: string): string {
  const toks: { t: string; tr: boolean }[] = [];
  let raw = '';
  for (let i = 0; i < s.length; ) {
    if (!HAN.test(s[i])) { raw += s[i++]; continue; }
    if (raw) { toks.push({ t: raw, tr: false }); raw = ''; }
    let L = Math.min(SEG_MAX, s.length - i), v: string | undefined;
    for (; L > 0 && (v = seg.get(s.slice(i, i + L))) === undefined; L--);
    if (v === undefined) { L = 1; v = C[s[i]]; }
    toks.push(v === undefined ? { t: s[i], tr: false } : { t: v, tr: true });
    i += L;
  }
  if (raw) toks.push({ t: raw, tr: false });

  let out = '', prev: { t: string; tr: boolean } | undefined;
  for (const tok of toks) {
    if (prev && (prev.tr || tok.tr) && WORD_END.test(prev.t) && WORD_START.test(tok.t)) out += ' ';
    out += tok.t; prev = tok;
  }
  return out
    .replace(PUNCT_RE, m => PUNCT[m])
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.:;!?)\]”…])/g, '$1')
    .replace(/([(\[“])\s+/g, '$1')
    .trim();
}

function core(key: string): string {
  const hit = G[key] ?? S[key];
  if (hit !== undefined) return hit;
  for (const t of T) {
    const m = t.re.exec(key);
    if (!m) continue;
    return t.vi.replace(/\{(\d+)\}/g, (s, n) => {
      const k = t.order.indexOf(+n);
      return k < 0 ? s : translate(m[k + 1]);
    }).replace(/ {2,}/g, ' ');
  }
  return segment(key);
}

export function translate(text: string): string {
  if (!NEEDS.test(text)) return text;
  const c = cache.get(text);
  if (c !== undefined) return c;
  const [, lead, body, trail] = /^(\s*)([\s\S]*?)(\s*)$/.exec(text)!;
  const out = lead + core(norm(body)) + trail;
  // ponytail: xóa sạch khi đầy (chuỗi AI stream sinh nhiều bản trung gian), đổi sang LRU nếu thấy giật
  if (cache.size > 20000) cache.clear();
  cache.set(text, out);
  return out;
}
