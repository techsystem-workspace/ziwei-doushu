/**
 * Quét toàn bộ chuỗi chứa chữ Hán trong app/ components/ lib/ (AST, bỏ qua comment).
 * Xuất i18n-vi/extracted.json: { strings: string[], templates: string[] }
 * Template dùng {0},{1}... làm chỗ giữ biến.
 */
import ts from 'typescript';
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const HAN = /[㐀-鿿]/;
const files = execSync("git ls-files 'app/*' 'components/*' 'lib/*'", { encoding: 'utf8' })
  .split('\n').filter(f => /\.(ts|tsx)$/.test(f));

const strings = new Set<string>();
const templates = new Set<string>();
const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

for (const file of files) {
  const src = ts.createSourceFile(file, require('node:fs').readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true,
    file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const visit = (n: ts.Node) => {
    if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isJsxText(n)) && HAN.test(n.text)) {
      // bỏ qua import path / directive
      if (!ts.isImportDeclaration(n.parent)) strings.add(norm(n.text));
    } else if (ts.isTemplateExpression(n)) {
      let t = n.head.text;
      n.templateSpans.forEach((s, i) => { t += `{${i}}` + s.literal.text; });
      if (HAN.test(t)) templates.add(norm(t));
    }
    ts.forEachChild(n, visit);
  };
  visit(src);
}
const out = { strings: [...strings].filter(Boolean).sort(), templates: [...templates].sort() };
writeFileSync('i18n-vi/extracted.json', JSON.stringify(out, null, 1));
const chars = (a: string[]) => a.reduce((n, s) => n + s.length, 0);
console.log(`strings: ${out.strings.length} (${chars(out.strings)} ký tự), templates: ${out.templates.length} (${chars(out.templates)} ký tự)`);
