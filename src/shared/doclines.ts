// Document line model (PLAN.md Part 9 §5a). Every extractor (PDF text layer,
// DOCX HTML, pasted text) emits DocLine[] instead of a flat string so the
// parser can see typography: font size, boldness, x-start, column cells,
// vertical gaps and attached hyperlinks. Pure TS, no browser APIs except an
// optional DOM Document handed in by the caller.

export interface DocLine {
  /** cells joined with a tab */
  text: string;
  /** column cells: "Company<wide gap>Location" → ["Company", "Location"] */
  cells: string[];
  /** font size in points (10 for plain text sources) */
  size: number;
  bold: boolean;
  italic: boolean;
  /** letters are all uppercase */
  caps: boolean;
  /** left edge in page units (0 for text sources) */
  x0: number;
  /** 1-based page */
  page: number;
  /** vertical whitespace above the line, in line heights (0 = tight) */
  gapAbove: number;
  /** hyperlink targets attached to this line */
  urls: string[];
  /** vertical position on its page, 0 = top, 1 = bottom (0.5 for text sources) */
  yTop: number;
}

export interface TextItem {
  str: string;
  x: number;
  y: number;
  w: number;
  size: number;
  bold: boolean;
  italic: boolean;
  /** starts a new cell regardless of the gap (set when rows are merged) */
  cellBreak?: boolean;
}

export interface PageLink {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  url: string;
}

export interface PageItems {
  width: number;
  height: number;
  items: TextItem[];
  links: PageLink[];
}

// OCR reads bullets as », «, =, ©, ®, ¢ or °: accept those only with a space after
const BULLET_RE = /^(?:[•●▪◦·∙‣⁃■□➢➤►▶✓✔\-–—*]\s*|[»«=©®¢°]\s+)/;
// OCR often hallucinates a curly quote at the left margin ("‘Enterprising")
const OCR_QUOTE_RE = /^[‘’‚]+(?=\p{L})/u;

export function isBoldFont(name: string): boolean {
  return /bold|black|heavy|semibold|demibold|extrabold|ultrabold|cmbx\d|cmb\d|sfbx\d|-bd\b|,b\b/i.test(name);
}

export function isItalicFont(name: string): boolean {
  return /italic|oblique|cmti\d|cmmi\d|cmsl\d|sfti\d|-it\b/i.test(name);
}

/** "S K I L L S" (letter-spaced headings emit one item per glyph) → "SKILLS". */
function unspaceLetters(cell: string): string {
  const tokens = cell.split(" ");
  if (tokens.length < 4) return cell;
  const singles = tokens.filter((t) => t.length === 1 && /\p{L}/u.test(t)).length;
  return singles >= tokens.length * 0.6 ? tokens.join("") : cell;
}

function makeLine(
  cells: string[],
  partial: Partial<DocLine> = {},
): DocLine {
  const cleaned = cells
    .map((c) => unspaceLetters(c.replace(/\s+/g, " ").trim().replace(OCR_QUOTE_RE, "")))
    .filter(Boolean);
  const text = cleaned.join("\t");
  const letters = text.replace(/[^\p{L}]/gu, "");
  return {
    text,
    cells: cleaned,
    size: 10,
    bold: false,
    italic: false,
    caps: letters.length >= 3 && letters === letters.toUpperCase(),
    x0: 0,
    page: 1,
    gapAbove: 0,
    urls: [],
    yTop: 0.5,
    ...partial,
  };
}

/** Plain text (paste, .txt): cells split on tabs or runs of 3+ spaces. */
export function linesFromText(text: string): DocLine[] {
  const out: DocLine[] = [];
  let gap = 0;
  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();
    if (!line || /^[-•◦*]+$/.test(line)) {
      gap++;
      continue;
    }
    out.push(makeLine(line.split(/\t| {3,}/), { gapAbove: gap }));
    gap = 0;
  }
  return out;
}

/** The review-pane text: one line per DocLine, blank line at wide gaps. */
export function docText(lines: DocLine[]): string {
  let out = "";
  let page = 1;
  for (const l of lines) {
    if (l.page !== page) {
      out += "\n";
      page = l.page;
    } else if (l.gapAbove >= 1.2 && out) out += "\n";
    out += `${l.cells.join("    ")}\n`;
  }
  return out.trim();
}

// ---------------------------------------------------------------------------
// PDF text items → lines
// ---------------------------------------------------------------------------

interface RawLine {
  items: TextItem[];
  y: number;
  cls: "left" | "right" | "span";
}

/** Column boundary for a two-column page, or undefined for single-column. */
export function columnBoundary(page: PageItems, debug?: (msg: string) => void): number | undefined {
  const items = page.items;
  if (items.length < 30) return undefined;
  const W = page.width;
  const sizes = items.map((i) => i.size).sort((a, b) => a - b);
  const bandH = Math.max(6, (sizes[Math.floor(sizes.length / 2)] ?? 10) * 2.5);
  const ys = items.map((i) => i.y);
  const yMin = Math.min(...ys);
  const bands = Math.max(1, Math.ceil((Math.max(...ys) - yMin) / bandH) + 1);
  let best: { b: number; score: number } | undefined;
  for (let b = 0.2 * W; b <= 0.8 * W; b += W / 60) {
    let left = 0, right = 0, cross = 0;
    const crossBands = new Set<number>();
    for (const it of items) {
      const x1 = it.x + it.w;
      if (x1 <= b + 2) left++;
      else if (it.x >= b - 2) right++;
      else {
        cross++;
        crossBands.add(Math.floor((it.y - yMin) / bandH));
      }
    }
    // OCR yields one item per word, so a narrow sidebar can be under 20% of
    // items; the gutter and row-alignment rules below carry the precision
    if (left < items.length * 0.08 || right < items.length * 0.08) continue;
    if (cross > items.length * 0.06) {
      debug?.(`b=${b.toFixed(0)} rejected: cross ${cross}/${items.length}`);
      continue;
    }
    // the gutter must be empty over most of the page height: a paragraph or
    // bullet list whose lines run through b is one column with a date column
    // or a two-column skills list, not a two-column page
    if (crossBands.size > bands * 0.15) {
      debug?.(`b=${b.toFixed(0)} rejected: gutter crossed in ${crossBands.size}/${bands} bands`);
      continue;
    }
    const score = Math.min(left, right) - cross * 4;
    if (!best || score > best.score) best = { b, score };
  }
  if (!best) return undefined;
  const b = best.b;
  // a real gutter is wide on every shared row; a long line that OCR split
  // into a left and a right block leaves only a word space at b
  let shared = 0, continuous = 0;
  for (const row of clusterLines(items, "span")) {
    let leftEnd = -Infinity, rightStart = Infinity, size = 0;
    for (const it of row.items) {
      size = Math.max(size, it.size);
      if (it.x + it.w <= b + 2) leftEnd = Math.max(leftEnd, it.x + it.w);
      else if (it.x >= b - 2) rightStart = Math.min(rightStart, it.x);
    }
    if (leftEnd === -Infinity || rightStart === Infinity) continue;
    shared++;
    if (rightStart - leftEnd < 1.2 * size) continuous++;
  }
  if (continuous >= Math.max(3, 0.2 * shared)) {
    debug?.(`b=${b.toFixed(0)} rejected: ${continuous}/${shared} shared rows continue across the gutter`);
    return undefined;
  }
  // right-aligned dates, locations or table cells form a sparse side of
  // isolated lines or pairs; a real column (contact block, skills list) has
  // runs of three or more consecutive lines
  const leftLines = clusterLines(items.filter((i) => i.x + i.w <= b + 2), "left");
  const rightLines = clusterLines(items.filter((i) => i.x >= b - 2), "right");
  const inRuns = (side: RawLine[]) => {
    let count = 0, run = 1;
    for (let i = 0; i < side.length; i++) {
      const next = side[i + 1];
      const adjacent = next && side[i]!.y - next.y <= 1.8 * Math.max(side[i]!.items[0]!.size, next.items[0]!.size);
      if (adjacent) run++;
      else {
        if (run >= 3) count += run;
        run = 1;
      }
    }
    return count;
  };
  const cellColumn = (side: RawLine[], other: RawLine[]) =>
    side.length > 0 && side.length <= 0.5 * other.length && inRuns(side) / side.length < 0.5;
  // a text column is left-aligned (common left edge); right-aligned dates and
  // locations share a right edge and a ragged left edge
  const rightAligned = (side: RawLine[]) => {
    if (side.length < 3) return false;
    const x0s = side.map((l) => l.items[0]!.x);
    const x1s = side.map((l) => Math.max(...l.items.map((it) => it.x + it.w))).sort((p, q) => p - q);
    const median = x1s[Math.floor(x1s.length / 2)]!;
    // most lines end on the same right edge (an OCR-split fragment may not)
    const flush = x1s.filter((x) => Math.abs(x - median) <= 0.02 * W).length;
    return flush >= 0.75 * side.length && Math.max(...x0s) - Math.min(...x0s) > 0.05 * W;
  };
  debug?.(`best b=${b.toFixed(0)} leftLines=${leftLines.length} rightLines=${rightLines.length} runsL=${inRuns(leftLines)} runsR=${inRuns(rightLines)} rightAligned=${rightAligned(rightLines)}`);
  if (cellColumn(rightLines, leftLines) || cellColumn(leftLines, rightLines) || rightAligned(rightLines)) return undefined;
  return b;
}

function clusterLines(items: TextItem[], cls: RawLine["cls"]): RawLine[] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: RawLine[] = [];
  for (const it of sorted) {
    const cur = lines[lines.length - 1];
    const tol = Math.max(2.5, 0.45 * (cur?.items[0]?.size ?? it.size));
    if (cur && Math.abs(it.y - cur.y) <= tol) cur.items.push(it);
    else lines.push({ items: [it], y: it.y, cls });
  }
  for (const l of lines) l.items.sort((a, b) => a.x - b.x);
  // OCR gives table cells and right-aligned text their own block, whose
  // baseline can sit a few pixels off the row's: two lines that nearly share
  // a baseline and do not overlap horizontally are one row
  for (let i = 0; i + 1 < lines.length; i++) {
    const a = lines[i]!, b = lines[i + 1]!;
    const size = Math.max(a.items[0]!.size, b.items[0]!.size);
    if (Math.abs(a.y - b.y) > 0.7 * size) continue;
    const ax0 = a.items[0]!.x, ax1 = Math.max(...a.items.map((it) => it.x + it.w));
    const bx0 = b.items[0]!.x, bx1 = Math.max(...b.items.map((it) => it.x + it.w));
    if (bx0 >= ax1 - 2 || ax0 >= bx1 - 2) {
      // separate blocks stay separate cells even when the gap is narrow
      const first = b.items.reduce((m, it) => (it.x < m.x ? it : m), b.items[0]!);
      first.cellBreak = true;
      a.items.push(...b.items);
      a.items.sort((p, q) => p.x - q.x);
      lines.splice(i + 1, 1);
      i--;
    }
  }
  return lines;
}

function joinItems(items: TextItem[]): string[] {
  const cells: string[] = [];
  let cur = "";
  let prev: TextItem | undefined;
  for (const it of items) {
    if (prev) {
      const gap = it.x - (prev.x + prev.w);
      const size = Math.max(Math.min(it.size, prev.size), 6);
      if (it.cellBreak || gap > Math.max(2.2 * size, 14)) {
        cells.push(cur);
        cur = "";
      } else if (gap >= 0.12 * size && !cur.endsWith(" ") && !it.str.startsWith(" ")) {
        cur += " ";
      }
    }
    cur += it.str;
    prev = it;
  }
  cells.push(cur);
  return cells;
}

function finishLine(raw: RawLine, page: number, prevY: number | undefined, links: PageLink[], pageHeight: number): DocLine {
  const cells = joinItems(raw.items);
  let chars = 0, boldChars = 0, italicChars = 0, size = 0;
  for (const it of raw.items) {
    const n = it.str.replace(/\s/g, "").length;
    chars += n;
    if (it.bold) boldChars += n;
    if (it.italic) italicChars += n;
    if (n > 0) size = Math.max(size, it.size);
  }
  const x0 = raw.items[0]!.x;
  const x1 = Math.max(...raw.items.map((i) => i.x + i.w));
  const urls: string[] = [];
  for (const l of links) {
    if (raw.y >= l.y0 - 2 && raw.y <= l.y1 + 2 && x1 >= l.x0 && x0 <= l.x1) urls.push(l.url);
  }
  // leading bullet glyphs become "- " so all sources look alike downstream;
  // OCR often isolates the glyph ("+", "«") in its own cell
  if (cells.length > 1 && cells[0] && /^[•●▪◦·∙‣⁃■□➢➤►▶✓✔\-–—*»«=©®¢°+o]$/.test(cells[0])) {
    cells.shift();
    cells[0] = `- ${cells[0]}`;
  } else if (cells[0] && BULLET_RE.test(cells[0]) && cells[0].length > 2) {
    cells[0] = `- ${cells[0].replace(BULLET_RE, "")}`;
  }
  const gapAbove = prevY === undefined ? 1 : Math.max(0, (prevY - raw.y) / Math.max(size, 6) - 1);
  return makeLine(cells, {
    size: Math.round(size * 10) / 10,
    bold: chars > 0 && boldChars / chars >= 0.5,
    italic: chars > 0 && italicChars / chars >= 0.5,
    x0: Math.round(x0),
    page,
    gapAbove: Math.round(gapAbove * 100) / 100,
    urls,
    yTop: pageHeight > 0 ? Math.round((1 - raw.y / pageHeight) * 1000) / 1000 : 0.5,
  });
}

/** Reconstruct reading-order lines from positioned text items. */
export function linesFromItems(pages: PageItems[]): DocLine[] {
  const out: DocLine[] = [];
  const unattached = new Set<string>();
  pages.forEach((page, idx) => {
    const pageNo = idx + 1;
    const items = page.items.filter((i) => i.str.trim());
    if (items.length === 0) return;
    const b = columnBoundary(page);
    let raws: RawLine[];
    if (b === undefined) {
      raws = clusterLines(items, "span");
    } else {
      const left = items.filter((i) => i.x + i.w <= b + 2);
      const right = items.filter((i) => i.x >= b - 2);
      const span = items.filter((i) => !(i.x + i.w <= b + 2) && !(i.x >= b - 2));
      // bands: a full-width line flushes the two columns collected above it
      const all = [...clusterLines(left, "left"), ...clusterLines(right, "right"), ...clusterLines(span, "span")]
        .sort((p, q) => q.y - p.y);
      raws = [];
      let bandL: RawLine[] = [], bandR: RawLine[] = [];
      const flush = () => {
        raws.push(...bandL, ...bandR);
        bandL = [];
        bandR = [];
      };
      for (const r of all) {
        if (r.cls === "left") bandL.push(r);
        else if (r.cls === "right") bandR.push(r);
        else {
          flush();
          raws.push(r);
        }
      }
      flush();
    }
    const prevYByCls: Partial<Record<RawLine["cls"], number>> = {};
    const attached = new Set<string>();
    let pendingBullet: RawLine["cls"] | undefined;
    for (const r of raws) {
      const line = finishLine(r, pageNo, prevYByCls[r.cls], page.links, page.height);
      prevYByCls[r.cls] = r.y;
      if (!line.text) continue;
      // a bullet glyph rendered on its own line belongs to the next line
      if (/^[•●▪◦·∙‣⁃■□➢➤►▶✓✔*]$/.test(line.text)) {
        pendingBullet = r.cls;
        continue;
      }
      if (pendingBullet === r.cls && !line.text.startsWith("- ")) {
        line.cells[0] = `- ${line.cells[0]}`;
        line.text = line.cells.join("\t");
      }
      pendingBullet = undefined;
      line.urls.forEach((u) => attached.add(u));
      out.push(line);
    }
    for (const l of page.links) if (!attached.has(l.url)) unattached.add(l.url);
  });
  const lines = dropRunningHeaders(out, pages);
  for (const u of unattached) lines.push(makeLine([u], { page: pages.length, urls: [u], gapAbove: 2 }));
  return lines;
}

/** Remove page numbers and text repeated in the margins of ≥2 pages. */
function dropRunningHeaders(lines: DocLine[], pages: PageItems[]): DocLine[] {
  const pageNo = (l: DocLine) => /^page \d+( of \d+)?$/i.test(l.text) || /^\d+ of \d+$/.test(l.text);
  if (pages.length < 2) return lines.filter((l) => !pageNo(l));
  const inMargin = (l: DocLine) => l.yTop < 0.08 || l.yTop > 0.92;
  const seen = new Map<string, Set<number>>();
  for (const l of lines) {
    if (!inMargin(l)) continue;
    const key = l.text.toLowerCase().replace(/\d+/g, "#");
    if (!seen.has(key)) seen.set(key, new Set());
    seen.get(key)!.add(l.page);
  }
  return lines.filter((l) => {
    if (pageNo(l)) return false;
    if (!inMargin(l)) return true; // an employer repeated as a school is body text, not a header
    const key = l.text.toLowerCase().replace(/\d+/g, "#");
    return (seen.get(key)?.size ?? 0) < 2;
  });
}

// ---------------------------------------------------------------------------
// HTML (Mammoth DOCX output) → lines. The document is parsed, never rendered.
// ---------------------------------------------------------------------------

const HEADING_SIZE: Record<string, number> = { H1: 18, H2: 15, H3: 13, H4: 12, H5: 11, H6: 11 };

function textOf(node: Node): string {
  return (node.textContent ?? "").replace(/\s+/g, " ").trim();
}

function emphasisOf(el: Element): { bold: boolean; italic: boolean } {
  const total = textOf(el).replace(/\s/g, "").length;
  if (total === 0) return { bold: false, italic: false };
  const count = (sel: string) =>
    [...el.querySelectorAll(sel)].reduce((n, e) => n + textOf(e).replace(/\s/g, "").length, 0);
  return { bold: count("strong, b") / total >= 0.5, italic: count("em, i") / total >= 0.5 };
}

function paragraphsOf(el: Element): string[] {
  // <p>a<br>b</p> → two lines; nested block children → their own lines
  const html = el.innerHTML.replace(/<br\s*\/?>/gi, "\n");
  const tmp = el.ownerDocument.createElement("div");
  tmp.innerHTML = html;
  return (tmp.textContent ?? "").split("\n").map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
}

export function linesFromHtml(doc: Document): DocLine[] {
  const out: DocLine[] = [];
  const urlsOf = (el: Element) =>
    [...el.querySelectorAll("a[href]")].map((a) => a.getAttribute("href") ?? "").filter((h) => /^https?:|^www\./i.test(h));
  const push = (cells: string[], partial: Partial<DocLine>) => {
    const line = makeLine(cells, partial);
    if (line.text) out.push(line);
  };
  const walk = (el: Element, depth: number): void => {
    const tag = el.tagName.toUpperCase();
    if (tag === "TABLE") {
      for (const tr of el.querySelectorAll("tr")) {
        const cellParas = [...tr.children].map((td) => {
          const paras = [...td.querySelectorAll("p, li, h1, h2, h3, h4, h5, h6")];
          return paras.length > 0 ? paras.flatMap(paragraphsOf) : paragraphsOf(td);
        });
        const rows = Math.max(0, ...cellParas.map((c) => c.length));
        for (let k = 0; k < rows; k++) {
          const emph = emphasisOf(tr);
          push(cellParas.map((c) => c[k] ?? ""), { ...emph, urls: urlsOf(tr), gapAbove: k === 0 ? 0.6 : 0 });
        }
      }
      return;
    }
    if (tag in HEADING_SIZE) {
      push([textOf(el)], { size: HEADING_SIZE[tag]!, bold: true, gapAbove: 1.2, urls: urlsOf(el) });
      return;
    }
    if (tag === "P") {
      const emph = emphasisOf(el);
      paragraphsOf(el).forEach((t, i) => push([t], { ...emph, urls: urlsOf(el), gapAbove: i === 0 ? 0.6 : 0 }));
      return;
    }
    if (tag === "LI") {
      const own = [...el.childNodes]
        .filter((n) => !(n instanceof Element && /^(UL|OL)$/i.test(n.tagName)))
        .map((n) => (n instanceof Element ? textOf(n) : (n.textContent ?? "")))
        .join("")
        .replace(/\s+/g, " ")
        .trim();
      if (own) push([`- ${own.replace(BULLET_RE, "")}`], { ...emphasisOf(el), urls: urlsOf(el) });
      for (const child of el.children) if (/^(UL|OL)$/i.test(child.tagName)) walk(child, depth + 1);
      return;
    }
    if (el.children.length === 0) {
      const t = textOf(el);
      if (t) push([t], { urls: urlsOf(el) });
      return;
    }
    for (const child of el.children) walk(child, depth + 1);
  };
  walk(doc.body, 0);
  return out;
}
