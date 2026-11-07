'use client';
/**
 * Việt hóa toàn trang ở tầng DOM sau khi hydrate — không sửa code upstream.
 * Gắn 1 lần trong app/layout.tsx.
 */
import { useEffect } from 'react';
import { needsTranslate, setDicts, translate } from './runtime';
import './vi.css';

const ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
const SKIP = 'script,style,noscript,textarea,[contenteditable],[data-no-vi]';
const INLINE = new Set(['SPAN', 'A', 'B', 'STRONG', 'EM', 'I', 'SMALL', 'LABEL', 'MARK', 'U', 'S', 'SUB', 'SUP', 'ABBR', 'TIME', 'FONT']);
const WORD_START = /^[\p{L}\p{N}]/u, WORD_END = /[\p{L}\p{N}]$/u, PREV_END = /[\p{L}\p{N},.;:!?)”]$/u;

/** Text node khác rỗng cuối cùng tính từ n lùi về trước (đi sâu vào lastChild). */
function tailText(n: Node | null): string {
  for (; n; n = n.previousSibling) {
    if (n.nodeType === Node.TEXT_NODE) { if (n.nodeValue) return n.nodeValue; }
    else if (n.nodeType === Node.ELEMENT_NODE) { const t = tailText(n.lastChild); if (t) return t; }
  }
  return '';
}

/** Text đứng liền trước node trong cùng khối (leo qua cha inline). */
function prevText(n: Node): string {
  for (let cur = n; ; ) {
    const t = tailText(cur.previousSibling);
    if (t) return t;
    const p = cur.parentElement;
    if (!p || !INLINE.has(p.tagName)) return '';
    cur = p;
  }
}

const last = new WeakMap<Node, string>();

function doText(node: Text) {
  const v = node.data;
  if (last.get(node) === v || !needsTranslate(v) || node.parentElement?.closest(SKIP)) return;
  let out = translate(v);
  const prev = prevText(node);
  if (!prev.trim()) out = out.replace(/^(\s*)(\p{Ll})/u, (_, s, c) => s + c.toUpperCase()); // đầu khối → viết hoa
  else if (WORD_START.test(out) && PREV_END.test(prev)) out = ' ' + out;
  const next = node.nextSibling;
  if (next?.nodeType === Node.TEXT_NODE && WORD_END.test(out) && WORD_START.test(next.textContent ?? '')) out += ' ';
  last.set(node, out);
  if (out !== v) node.data = out;
}

function doAttrs(el: Element) {
  if (el.closest(SKIP)) return;
  const names = el instanceof HTMLInputElement && /^(button|submit|reset)$/.test(el.type) ? [...ATTRS, 'value'] : ATTRS;
  for (const a of names) {
    const v = el.getAttribute(a);
    if (v && needsTranslate(v)) el.setAttribute(a, translate(v));
  }
}

function walk(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) return doText(root as Text);
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  const el = root as Element;
  if (el.closest(SKIP)) return;
  doAttrs(el);
  const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
    acceptNode: n => (n.nodeType === Node.ELEMENT_NODE && (n as Element).matches(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  for (let n = tw.nextNode(); n; n = tw.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) doText(n as Text);
    else doAttrs(n as Element);
  }
}

function doTitle() {
  if (needsTranslate(document.title)) document.title = translate(document.title);
}

function patchCanvas() {
  const P = CanvasRenderingContext2D.prototype as unknown as Record<string, (...a: unknown[]) => unknown>;
  for (const m of ['fillText', 'strokeText', 'measureText']) {
    const orig = P[m];
    if ((orig as { __vi?: 1 }).__vi) continue;
    const fn = function (this: unknown, text: unknown, ...rest: unknown[]) {
      return orig.call(this, translate(String(text)), ...rest);
    };
    (fn as { __vi?: 1 }).__vi = 1;
    P[m] = fn;
  }
}

export default function ViTranslator() {
  useEffect(() => {
    let mo: MutationObserver | undefined;
    let alive = true;
    document.documentElement.lang = 'vi';
    Promise.all([
      import('./glossary.json'),
      import('./strings.json'),
      import('./templates.json'),
      import('./chars.json'),
    ]).then(([g, s, t, c]) => {
      if (!alive) return;
      const d = (m: { default: unknown }) => m.default as Record<string, string>;
      setDicts({ glossary: d(g), strings: d(s), templates: d(t), chars: d(c) });
      patchCanvas();
      walk(document.body);
      doTitle();
      mo = new MutationObserver(records => {
        for (const r of records) {
          if (r.type === 'childList') r.addedNodes.forEach(walk);
          else if (r.type === 'characterData') walk(r.target);
          else doAttrs(r.target as Element);
        }
        doTitle();
      });
      const opts = { childList: true, characterData: true, attributes: true, attributeFilter: [...ATTRS, 'value'], subtree: true };
      mo.observe(document.body, opts);
      mo.observe(document.head, { childList: true, characterData: true, subtree: true });
    }).catch(e => console.error('[i18n-vi]', e))
      .finally(() => document.documentElement.classList.add('vi-ready'));
    return () => { alive = false; mo?.disconnect(); };
  }, []);
  return null;
}
