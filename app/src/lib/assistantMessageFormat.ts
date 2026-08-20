/**
 * Lightweight parsing for assistant message display (no markdown dependency).
 */

export type InlineSpan =
  | { type: 'text'; value: string }
  | { type: 'bold'; value: string }
  | { type: 'link'; href: string; label: string; domain: string };

export type ContentBlock =
  | { type: 'heading'; level: 2 | 3; text: string }
  | { type: 'paragraph'; spans: InlineSpan[] }
  | { type: 'code'; language?: string; code: string }
  | { type: 'ul'; items: InlineSpan[][] }
  | { type: 'ol'; items: InlineSpan[][] }
  | { type: 'table'; headers: string[]; rows: string[][] };

const URL_PATTERN =
  /(https?:\/\/[^\s<>[\]()]+[^\s<>[\]().,;:!?'")\]}>"])/gi;

const BOLD_PATTERN = /\*\*([^*]+)\*\*/g;

const MD_LINK_PATTERN = /\[([^\]]+)\]\(([^)]+)\)/g;

/** Wrap bare domains in markdown link syntax for consistent rendering. */
function normalizeMarkdownLinks(line: string): string {
  return line.replace(
    /\(\[([^\]]+)\]\((https?:\/\/[^)]+)\)\)/g,
    '[$1]($2)',
  );
}

export function sanitizeLinkHref(raw: string): string | null {
  try {
    const href = raw.startsWith('http') ? raw : `https://${raw}`;
    const u = new URL(href);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.href;
  } catch {
    return null;
  }
}

export function linkDomain(href: string): string {
  try {
    return new URL(href).hostname.replace(/^www\./, '');
  } catch {
    return 'link';
  }
}

export function shortenLinkLabel(href: string, max = 48): string {
  try {
    const u = new URL(href);
    const path = u.pathname === '/' ? '' : u.pathname;
    const label = `${u.hostname.replace(/^www\./, '')}${path}${u.search ? '…' : ''}`;
    if (label.length <= max) return label;
    return `${label.slice(0, max - 1)}…`;
  } catch {
    return href.length > max ? `${href.slice(0, max - 1)}…` : href;
  }
}

/** Strip OpenAI / vector-store citation artifacts before display parsing. */
export function sanitizeAssistantContent(content: string): string {
  return (content || '')
    // Private-use Unicode wrappers (filecite icons from Responses API)
    .replace(/[\uE000-\uF8FF]/g, '')
    // filecite / turnNfileM tokens
    .replace(/\bfilecite\b/gi, '')
    .replace(/\bturn\d+file\d+\b/gi, '')
    // OpenAI annotation styles
    .replace(/:contentReference\[oaicite:[^\]]*\]\{index=\d+\}/gi, '')
    .replace(/【\d+:\d+†[^】]*】/g, '')
    // Model metadata in citations
    .replace(/\(\s*relevance\s*:?\s*[\d.]+\s*\)/gi, '')
    .replace(/\brelevance\s*:?\s*0?\.\d+\b/gi, '')
    // Collapse leftover whitespace
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function parseInlineSpans(line: string): InlineSpan[] {
  if (!line) return [{ type: 'text', value: '' }];

  line = normalizeMarkdownLinks(line);

  type Token = { start: number; end: number; span: InlineSpan };
  const tokens: Token[] = [];

  let match: RegExpExecArray | null;
  const mdLinkRe = new RegExp(MD_LINK_PATTERN.source, MD_LINK_PATTERN.flags);
  while ((match = mdLinkRe.exec(line)) !== null) {
    const href = sanitizeLinkHref(match[2].trim());
    if (!href) continue;
    tokens.push({
      start: match.index,
      end: match.index + match[0].length,
      span: { type: 'link', href, label: shortenLinkLabel(href), domain: linkDomain(href) },
    });
  }

  const urlRe = new RegExp(URL_PATTERN.source, URL_PATTERN.flags);
  while ((match = urlRe.exec(line)) !== null) {
    const raw = match[1];
    const href = sanitizeLinkHref(raw);
    if (!href) continue;
    const overlaps = tokens.some((t) => match!.index >= t.start && match!.index < t.end);
    if (overlaps) continue;
    tokens.push({
      start: match.index,
      end: match.index + raw.length,
      span: {
        type: 'link',
        href,
        label: shortenLinkLabel(href),
        domain: linkDomain(href),
      },
    });
  }

  const boldRe = new RegExp(BOLD_PATTERN.source, BOLD_PATTERN.flags);
  while ((match = boldRe.exec(line)) !== null) {
    const inner = match[1].trim();
    if (!inner) continue;
    tokens.push({
      start: match.index,
      end: match.index + match[0].length,
      span: { type: 'bold', value: inner },
    });
  }

  tokens.sort((a, b) => a.start - b.start);

  const merged: Token[] = [];
  for (const t of tokens) {
    const last = merged[merged.length - 1];
    if (last && t.start < last.end) continue;
    merged.push(t);
  }

  const spans: InlineSpan[] = [];
  let cursor = 0;
  for (const t of merged) {
    if (t.start > cursor) {
      spans.push({ type: 'text', value: line.slice(cursor, t.start) });
    }
    spans.push(t.span);
    cursor = t.end;
  }
  if (cursor < line.length) {
    spans.push({ type: 'text', value: line.slice(cursor) });
  }

  return spans.length ? spans : [{ type: 'text', value: line }];
}

/** Procedural steps the model often outputs as numbered list items (not section titles). */
const ORDERED_LIST_ACTION_START =
  /^(Provide|Accept|Assign|Collect|Determine|Document|Give|Log|Escalate|Implement|Ensure|If|When|Immediately|Contact|Review|Update|Maintain|Conduct|Report|Notify|Obtain|Verify|Train|Monitor|Complete|Submit|Acknowledge|Identify|Support|Assist|Include|Require|Allow|Prohibit|Define|Communicate|Investigate|Resolve|Approve|Authorize|Record|Retain|Delete|Test|Audit|Evaluate|Assess|Educate|Inform|Confirm|Enforce|Follow|Comply|Handle|Manage|Process|Deliver|Send|Receive|Establish|Develop|Create|Perform|Track|Archive|Dispose)/i;

/**
 * Detect "1. Purpose" / "6.1 Governing Body" style lines as headings instead of list items.
 * Prevents every section restarting at "1." in the UI.
 */
export function isNumberedSectionHeading(line: string): { level: 2 | 3; text: string } | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const subsection = trimmed.match(/^(\d+\.\d+(?:\.\d+)?)\s+(.+)$/);
  if (subsection) {
    return { level: 3, text: `${subsection[1]} ${subsection[2].trim()}` };
  }

  const section = trimmed.match(/^(\d+)[.)]\s+(.+)$/);
  if (!section) return null;

  const body = section[2].trim();
  if (!body) return null;

  // Long sentences are procedural steps, not section titles.
  if (body.length > 90) return null;
  if (body.endsWith('.') && body.length > 55) return null;
  if (ORDERED_LIST_ACTION_START.test(body)) return null;

  const wordCount = body.split(/\s+/).length;
  if (body.length <= 70 || (wordCount <= 10 && !/[;:]/.test(body))) {
    return { level: 2, text: `${section[1]}. ${body}` };
  }

  return null;
}

/** "- 1. Detection: ..." → section heading + optional inline body. */
function parseBulletedSectionHeading(
  line: string,
): { level: 2 | 3; text: string; body?: string } | null {
  const trimmed = line.trim();
  const bullet = trimmed.match(/^[-*•]\s+(.+)$/);
  if (!bullet) return null;

  const inner = bullet[1].trim();
  const colonIdx = inner.indexOf(':');
  const headCandidate = colonIdx >= 0 ? inner.slice(0, colonIdx).trim() : inner;
  const body = colonIdx >= 0 ? inner.slice(colonIdx + 1).trim() : undefined;
  const heading = isNumberedSectionHeading(headCandidate);
  if (!heading) return null;

  return { level: heading.level, text: heading.text, body: body || undefined };
}

function isHeadingLine(line: string): { level: 2 | 3; text: string } | null {
  const numbered = isNumberedSectionHeading(line);
  if (numbered) return numbered;

  const h3 = line.match(/^###\s+(.+)$/);
  if (h3) return { level: 3, text: h3[1].trim() };
  const h2 = line.match(/^##\s+(.+)$/);
  if (h2) return { level: 2, text: h2[1].trim() };
  const h2alt = line.match(/^\*\*(.+)\*\*$/);
  if (h2alt && h2alt[1].length < 120) return { level: 2, text: h2alt[1].trim() };
  return null;
}

function isListLine(line: string): { ordered: boolean; text: string } | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const ul = trimmed.match(/^[-*•]\s+(.+)$/);
  if (ul) {
    if (parseBulletedSectionHeading(trimmed)) return null;
    return { ordered: false, text: ul[1] };
  }
  const ol = trimmed.match(/^(\d+)[.)]\s+(.+)$/);
  if (ol) {
    // "2. Reporting", "5. Investigation" → section headings, not list items.
    if (isNumberedSectionHeading(trimmed)) return null;
    return { ordered: true, text: ol[2].trim() };
  }
  return null;
}

/** Avoid "1. 1. Item" when the model repeats the number inside list item text. */
export function stripOrderedPrefix(text: string): string {
  return text.replace(/^\d+[.)]\s+/, '').trim();
}

/** Split a markdown table row into cells (handles leading/trailing pipes). */
export function splitTableRow(line: string): string[] {
  let raw = line.trim();
  if (raw.startsWith('|')) raw = raw.slice(1);
  if (raw.endsWith('|')) raw = raw.slice(0, -1);
  return raw.split('|').map((cell) => cell.trim());
}

/** Markdown separator like `| --- | :---: | ---: |` */
export function isTableSeparatorRow(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.includes('|') || !/-/.test(trimmed)) return false;
  const cells = splitTableRow(trimmed);
  if (cells.length < 2) return false;
  return cells.every((c) => /^:?-{1,}:?$/.test(c.replace(/\s/g, '')));
}

export function looksLikeTableRow(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.includes('|')) return false;
  if (isTableSeparatorRow(trimmed)) return false;
  const cells = splitTableRow(trimmed);
  return cells.length >= 2;
}

/**
 * Parse a GFM markdown table starting at `start`.
 * Returns null if the next line is not a separator.
 */
export function tryParseMarkdownTable(
  lines: string[],
  start: number,
): { block: Extract<ContentBlock, { type: 'table' }>; nextIndex: number } | null {
  if (start >= lines.length) return null;
  if (!looksLikeTableRow(lines[start])) return null;
  if (start + 1 >= lines.length || !isTableSeparatorRow(lines[start + 1])) return null;

  const headers = splitTableRow(lines[start]);
  const rows: string[][] = [];
  let i = start + 2;
  while (i < lines.length && looksLikeTableRow(lines[i])) {
    const cells = splitTableRow(lines[i]);
    // Pad / trim to header width for stable columns
    const normalized = headers.map((_, idx) => cells[idx] ?? '');
    rows.push(normalized);
    i += 1;
  }

  return {
    block: { type: 'table', headers, rows },
    nextIndex: i,
  };
}

/** Split one CSV line respecting double-quoted fields. */
export function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      cells.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  cells.push(cur.trim());
  return cells;
}

function splitTsvLine(line: string): string[] {
  return line.split('\t').map((c) => c.trim());
}

function looksLikeTabularHeader(cells: string[]): boolean {
  if (cells.length < 3) return false;
  const joined = cells.join(' ').toLowerCase();
  const hits = [
    /ticker/,
    /company/,
    /beat/,
    /eps/,
    /pre-?10/,
    /gap/,
    /peak/,
    /report\s*time/,
    /surprise/,
  ].filter((re) => re.test(joined)).length;
  return hits >= 2 || /^ticker$/i.test(cells[0] ?? '');
}

function tryParseDelimitedTable(
  lines: string[],
  start: number,
  kind: 'csv' | 'tsv',
): { block: Extract<ContentBlock, { type: 'table' }>; nextIndex: number } | null {
  if (start >= lines.length) return null;
  const split = kind === 'csv' ? splitCsvLine : splitTsvLine;
  const headerLine = lines[start];
  if (kind === 'tsv' && !headerLine.includes('\t')) return null;
  if (kind === 'csv' && !headerLine.includes(',')) return null;

  const headers = split(headerLine);
  if (!looksLikeTabularHeader(headers)) return null;

  const rows: string[][] = [];
  let i = start + 1;
  while (i < lines.length) {
    const raw = lines[i];
    if (!raw.trim()) break;
    // Stop at markdown / prose boundaries
    if (raw.startsWith('#') || raw.startsWith('```') || raw.startsWith('|')) break;
    if (/^\*\*[^*]+\*\*$/.test(raw.trim())) break;
    if (/^[-*•]\s+/.test(raw.trim())) break;
    if (isHeadingLine(raw)) break;

    if (kind === 'tsv' && !raw.includes('\t')) break;
    if (kind === 'csv') {
      // Require enough commas (or quotes) to look like a data row, not a sentence.
      const cells = split(raw);
      if (cells.length < Math.max(3, Math.floor(headers.length * 0.6))) break;
      const normalized = headers.map((_, idx) => cells[idx] ?? '');
      rows.push(normalized);
      i += 1;
      continue;
    }

    const cells = split(raw);
    if (cells.length < 3) break;
    rows.push(headers.map((_, idx) => cells[idx] ?? ''));
    i += 1;
  }

  if (rows.length === 0) return null;
  return { block: { type: 'table', headers, rows }, nextIndex: i };
}

/** Prefer markdown, then TSV (sandbox), then CSV. */
export function tryParseAnyTable(
  lines: string[],
  start: number,
): { block: Extract<ContentBlock, { type: 'table' }>; nextIndex: number } | null {
  return (
    tryParseMarkdownTable(lines, start) ||
    tryParseDelimitedTable(lines, start, 'tsv') ||
    tryParseDelimitedTable(lines, start, 'csv')
  );
}

/** Parse fenced ```csv / ```tsv bodies into a table block when possible. */
export function tryParseFencedTable(
  language: string | undefined,
  code: string,
): Extract<ContentBlock, { type: 'table' }> | null {
  const lang = (language || '').toLowerCase();
  if (lang !== 'csv' && lang !== 'tsv' && lang !== 'text') return null;
  const lines = code.replace(/\r\n/g, '\n').split('\n').filter((l, idx, arr) => {
    // keep internal blanks out; trim trailing empties
    if (!l.trim() && idx === arr.length - 1) return false;
    return true;
  });
  if (!lines.length) return null;
  const kind: 'csv' | 'tsv' =
    lang === 'tsv' || lines[0].includes('\t') ? 'tsv' : 'csv';
  const parsed = tryParseDelimitedTable(lines, 0, kind);
  return parsed?.block ?? null;
}

/** Escape a CSV field. */
function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function plainCellText(value: string): string {
  return value
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .trim();
}

/** Convert a parsed table block to CSV text (for copy). */
export function tableToCsv(headers: string[], rows: string[][]): string {
  const lines = [
    headers.map((h) => csvEscape(plainCellText(h))).join(','),
    ...rows.map((row) => row.map((c) => csvEscape(plainCellText(c))).join(',')),
  ];
  return lines.join('\n');
}

function mergeAdjacentListBlocks(blocks: ContentBlock[]): ContentBlock[] {
  const merged: ContentBlock[] = [];
  for (const block of blocks) {
    const prev = merged[merged.length - 1];
    if (block.type === 'ol' && prev?.type === 'ol') {
      merged[merged.length - 1] = { type: 'ol', items: [...prev.items, ...block.items] };
      continue;
    }
    if (block.type === 'ul' && prev?.type === 'ul') {
      merged[merged.length - 1] = { type: 'ul', items: [...prev.items, ...block.items] };
      continue;
    }
    merged.push(block);
  }
  return merged;
}

export function parseAssistantContent(content: string): ContentBlock[] {
  const normalized = sanitizeAssistantContent(content).replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  const blocks: ContentBlock[] = [];
  const lines = normalized.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith('```')) {
      const language = line.slice(3).trim() || undefined;
      const codeLines: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i += 1;
      }
      const code = codeLines.join('\n');
      const fencedTable = tryParseFencedTable(language, code);
      if (fencedTable) {
        blocks.push(fencedTable);
      } else {
        blocks.push({ type: 'code', language, code });
      }
      i += 1;
      continue;
    }

    const table = tryParseAnyTable(lines, i);
    if (table) {
      blocks.push(table.block);
      i = table.nextIndex;
      continue;
    }

    const bulletSection = parseBulletedSectionHeading(line);
    if (bulletSection) {
      blocks.push({ type: 'heading', level: bulletSection.level, text: bulletSection.text });
      if (bulletSection.body) {
        blocks.push({ type: 'paragraph', spans: parseInlineSpans(bulletSection.body) });
      }
      i += 1;
      continue;
    }

    const heading = isHeadingLine(line);
    if (heading) {
      blocks.push({ type: 'heading', ...heading });
      i += 1;
      continue;
    }

    const listFirst = isListLine(line);
    if (listFirst) {
      const ordered = listFirst.ordered;
      const items: InlineSpan[][] = [];
      while (i < lines.length) {
        if (!lines[i].trim()) {
          let j = i + 1;
          while (j < lines.length && !lines[j].trim()) j += 1;
          if (j < lines.length) {
            if (isHeadingLine(lines[j])) break;
            const nextLi = isListLine(lines[j]);
            if (nextLi && nextLi.ordered === ordered) {
              i = j;
              continue;
            }
          }
          break;
        }
        if (isHeadingLine(lines[i])) break;
        const li = isListLine(lines[i]);
        if (!li || li.ordered !== ordered) break;
        items.push(parseInlineSpans(li.text));
        i += 1;
      }
      blocks.push({ type: ordered ? 'ol' : 'ul', items });
      continue;
    }

    if (!line.trim()) {
      i += 1;
      continue;
    }

    const paraLines: string[] = [];
    while (i < lines.length && lines[i].trim() && !lines[i].startsWith('```')) {
      const h = isHeadingLine(lines[i]);
      const li = isListLine(lines[i]);
      // Don't swallow the start of a markdown table into a paragraph.
      if (h || li || tryParseAnyTable(lines, i)) break;
      paraLines.push(lines[i]);
      i += 1;
    }
    const paraText = paraLines.join('\n');
    blocks.push({ type: 'paragraph', spans: parseInlineSpans(paraText) });
  }

  return mergeAdjacentListBlocks(blocks);
}
