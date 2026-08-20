/**
 * Light typography for AI replies — same formatting rules as Requi Health,
 * styled to match Requi Trading console bubbles (slate / sky).
 */

import { useState } from 'react';
import { Check, Copy, ExternalLink, Link2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  parseAssistantContent,
  parseInlineSpans,
  tableToCsv,
  type ContentBlock,
  type InlineSpan,
} from '@/lib/assistantMessageFormat';

export interface AssistantMessageContentProps {
  content: string;
  className?: string;
  streaming?: boolean;
}

function CitationLink({
  href,
  label,
  domain,
  compact = false,
}: {
  href: string;
  label: string;
  domain: string;
  /** Table cells: domain chip only — prevents URL overflow into other columns. */
  compact?: boolean;
}) {
  if (compact) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        title={href}
        className={cn(
          'mt-0.5 inline-flex max-w-full items-center gap-0.5 truncate rounded',
          'border border-sky-600/20 bg-sky-500/10 px-1 py-0.5',
          'text-[10px] font-medium text-sky-800 no-underline',
          'hover:border-sky-600/40 hover:bg-sky-500/15',
        )}
      >
        <ExternalLink className="h-2.5 w-2.5 shrink-0 opacity-70" aria-hidden />
        <span className="truncate">{domain}</span>
      </a>
    );
  }

  return (
    <span className="mx-0.5 inline-flex max-w-full flex-wrap items-center gap-1 align-baseline">
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          'inline-flex max-w-full items-center gap-1 text-[13px] font-medium',
          'text-sky-700 underline decoration-sky-600/40 underline-offset-2',
          'transition-colors hover:text-sky-800 hover:decoration-sky-700',
        )}
        title={href}
      >
        <Link2 className="h-3 w-3 flex-shrink-0 opacity-60" aria-hidden />
        <span className="truncate">{label}</span>
      </a>
      <span
        className="inline-flex items-center rounded border border-slate-900/10 bg-slate-900/[0.04] px-1 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500"
        title={`Source: ${domain}`}
      >
        {domain.length > 18 ? `${domain.slice(0, 16)}…` : domain}
      </span>
    </span>
  );
}

function InlineSpans({
  spans,
  compactLinks = false,
}: {
  spans: InlineSpan[];
  compactLinks?: boolean;
}) {
  return (
    <>
      {spans.map((span, idx) => {
        if (span.type === 'bold') {
          return (
            <strong key={idx} className="font-semibold text-slate-900">
              {span.value}
            </strong>
          );
        }
        if (span.type === 'link') {
          return (
            <CitationLink
              key={idx}
              href={span.href}
              label={span.label}
              domain={span.domain}
              compact={compactLinks}
            />
          );
        }
        return (
          <span
            key={idx}
            className={cn('text-slate-700', compactLinks && 'break-words [overflow-wrap:anywhere]')}
          >
            {span.value}
          </span>
        );
      })}
    </>
  );
}

function TableBlock({
  headers,
  rows,
}: {
  headers: string[];
  rows: string[][];
}) {
  const [copied, setCopied] = useState(false);

  const copyCsv = () => {
    const csv = tableToCsv(headers, rows);
    navigator.clipboard?.writeText(csv).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  };

  return (
    <div className="my-3 overflow-hidden rounded-xl border border-slate-900/10 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-center justify-between gap-2 border-b border-slate-900/8 bg-slate-50/90 px-3 py-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          Table · {rows.length} row{rows.length === 1 ? '' : 's'}
        </span>
        <button
          type="button"
          onClick={copyCsv}
          className="inline-flex items-center gap-1 rounded-md border border-slate-900/10 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-600 transition hover:border-sky-600/30 hover:text-sky-700"
        >
          {copied ? <Check className="h-3 w-3 text-teal-600" /> : <Copy className="h-3 w-3" />}
          {copied ? 'Copied CSV' : 'Copy CSV'}
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-max min-w-full border-collapse text-left text-[12px] leading-snug">
          <thead>
            <tr className="bg-slate-100/90">
              {headers.map((h, i) => (
                <th
                  key={`${h}-${i}`}
                  className="whitespace-nowrap border-b border-slate-900/10 px-3 py-2 font-semibold text-slate-800"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr
                key={ri}
                className="odd:bg-white even:bg-slate-50/60 hover:bg-sky-50/40"
              >
                {row.map((cell, ci) => (
                  <td
                    key={ci}
                    className="max-w-[11rem] min-w-[5.5rem] overflow-hidden border-b border-slate-900/6 px-3 py-2 align-top text-slate-700"
                  >
                    <div className="flex max-w-full flex-col gap-0.5 overflow-hidden break-words [overflow-wrap:anywhere]">
                      <InlineSpans spans={parseInlineSpans(cell)} compactLinks />
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BlockView({ block }: { block: ContentBlock }) {
  switch (block.type) {
    case 'heading':
      if (block.level === 3) {
        return (
          <h3 className="mb-1.5 mt-3 text-xs font-semibold leading-snug tracking-tight text-slate-900 first:mt-0">
            {block.text}
          </h3>
        );
      }
      return (
        <h2 className="mb-2 mt-3.5 text-sm font-bold leading-snug tracking-tight text-slate-900 first:mt-0">
          {block.text}
        </h2>
      );
    case 'code':
      return (
        <pre
          className={cn(
            'my-2.5 overflow-x-auto rounded-xl border border-slate-900/10 bg-slate-100/90',
            'px-3 py-2.5 font-mono text-[12px] leading-relaxed text-slate-800',
          )}
        >
          {block.language && (
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              {block.language}
            </div>
          )}
          <code>{block.code}</code>
        </pre>
      );
    case 'table':
      return <TableBlock headers={block.headers} rows={block.rows} />;
    case 'ul':
      return (
        <ul className="my-2 list-none space-y-1.5 pl-0">
          {block.items.map((item, i) => (
            <li key={i} className="flex gap-2 text-sm leading-relaxed text-slate-700">
              <span className="mt-[0.5rem] h-1 w-1 flex-shrink-0 rounded-full bg-sky-600" aria-hidden />
              <span className="min-w-0">
                <InlineSpans spans={item} />
              </span>
            </li>
          ))}
        </ul>
      );
    case 'ol':
      return (
        <ol className="my-2 list-none space-y-1.5 pl-0 [counter-reset:ai-ol]">
          {block.items.map((item, i) => (
            <li
              key={i}
              className={cn(
                'flex gap-2 text-sm leading-relaxed text-slate-700',
                '[counter-increment:ai-ol]',
                "before:min-w-[1.25rem] before:flex-shrink-0 before:text-right before:font-medium before:text-slate-900 before:content-[counter(ai-ol)'.']",
              )}
            >
              <span className="min-w-0 flex-1">
                <InlineSpans spans={item} />
              </span>
            </li>
          ))}
        </ol>
      );
    case 'paragraph':
    default:
      return (
        <p className="mb-2.5 whitespace-pre-wrap text-sm leading-relaxed text-slate-700 last:mb-0">
          <InlineSpans spans={block.spans} />
        </p>
      );
  }
}

export function AssistantMessageContent({
  content,
  className,
  streaming = false,
}: AssistantMessageContentProps) {
  const blocks = parseAssistantContent(content);

  if (!blocks.length && !streaming) {
    return null;
  }

  return (
    <article className={cn('ai-message-prose font-sans antialiased', className)}>
      {blocks.map((block, i) => (
        <BlockView key={i} block={block} />
      ))}
      {streaming && (
        <span
          className="ml-0.5 inline-block h-[1.1em] w-0.5 animate-pulse rounded-full bg-sky-600 align-text-bottom"
          aria-hidden
        />
      )}
    </article>
  );
}

export function AssistantMessageSourcesHint({ content }: { content: string }) {
  const hasUrl = /https?:\/\//i.test(content);
  if (!hasUrl) return null;
  return (
    <p className="mt-2.5 flex items-center gap-1.5 border-t border-slate-900/5 pt-2 text-[11px] text-slate-400">
      <ExternalLink className="h-3 w-3 flex-shrink-0" aria-hidden />
      References include external sources — click badges above to open.
    </p>
  );
}

export type AssistantSourceFile = { type: 'file'; filename: string };
export type AssistantSourceUrl = { type: 'url'; title: string; url: string };
export type AssistantSource = AssistantSourceFile | AssistantSourceUrl;

/**
 * Sources list — web URL citations only.
 * Vector-store / file names are intentionally not shown (product request).
 */
export function AssistantMessageSources({
  filenames: _filenames = [],
  urls = [],
}: {
  filenames?: string[];
  urls?: { title: string; url: string }[];
}) {
  void _filenames;
  const links = urls.filter((u) => u?.url);

  if (!links.length) return null;

  const hostOf = (url: string) => {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  };

  return (
    <div className="mt-3 border-t border-slate-900/8 pt-2.5">
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        Sources
      </p>
      <ul className="space-y-1">
        {links.map((link) => (
          <li key={`url:${link.url}`}>
            <a
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              title={link.url}
              className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-teal-600/20 bg-teal-500/5 px-2 py-1 text-[11px] text-teal-800 transition hover:border-teal-600/40 hover:bg-teal-500/10"
            >
              <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
              <span className="truncate font-medium">{link.title || hostOf(link.url)}</span>
              <span className="shrink-0 text-[10px] text-teal-600/70">{hostOf(link.url)}</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
