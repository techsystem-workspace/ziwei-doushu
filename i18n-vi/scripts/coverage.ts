/**
 * Kiểm tra độ phủ bản dịch so với i18n-vi/extracted.json.
 *   npx tsx i18n-vi/scripts/coverage.ts [--warn]
 * Exit 1 nếu còn thiếu / lỗi (--warn: luôn exit 0).
 */
import { readFileSync, existsSync } from 'node:fs';

const DIR = 'i18n-vi';
const HAN = /[㐀-鿿]/;
const load = (f: string): Record<string, string> => (existsSync(`${DIR}/${f}`) ? JSON.parse(readFileSync(`${DIR}/${f}`, 'utf8')) : {});
const ph = (s: string) => (s.match(/\{\d+\}/g) ?? []).sort().join();

const { strings, templates }: { strings: string[]; templates: string[] } = JSON.parse(readFileSync(`${DIR}/extracted.json`, 'utf8'));
const glossary = load('glossary.json');
const tStr = load('strings.json');
const tTpl = load('templates.json');

const checks: [string, string[]][] = [
  ['Chuỗi chưa dịch', strings.filter(k => !(k in tStr) && !(k in glossary))],
  ['Mẫu chưa dịch', templates.filter(k => !(k in tTpl))],
  ['Bản dịch còn chữ Hán', [glossary, tStr, tTpl].flatMap(o => Object.keys(o).filter(k => HAN.test(o[k])))],
  ['Mẫu lệch placeholder', Object.keys(tTpl).filter(k => ph(k) !== ph(tTpl[k]))],
];

const cut = (s: string) => (s.length > 60 ? s.slice(0, 60) + '…' : s);
console.log(`Nguồn: ${strings.length} chuỗi, ${templates.length} mẫu`);
let fail = 0;
for (const [label, keys] of checks) {
  fail += keys.length;
  console.log(`${keys.length ? '✗' : '✓'} ${label}: ${keys.length}`);
  for (const k of keys.slice(0, 5)) {
    const vi = tStr[k] ?? tTpl[k] ?? glossary[k];
    console.log(`    ${cut(k)}${vi ? `  →  ${cut(vi)}` : ''}`);
  }
}
if (fail && !process.argv.includes('--warn')) process.exit(1);
