import { useEffect, useState } from 'react';
import { Brain, FileText, Globe } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Fallback rotator when stream hasn't sent a phase yet. */
const STATUS_MESSAGES = [
  'Reasoning…',
  'Searching Files…',
  'Thinking…',
  'Searching the Web…',
  'Checking Sources…',
  'Verifying Information…',
  'Clarifying Context…',
  'Preparing Response…',
] as const;

const ROTATE_MS = 2800;

const PHASE_LABELS: Record<string, string> = {
  initializing: 'Starting…',
  processing: 'Processing…',
  generating: 'Writing response…',
  searching_files: 'Searching Files…',
  searching_web: 'Searching the Web…',
  search_complete: 'Sources ready…',
  reasoning: 'Reasoning…',
  staging_ticket: 'Staging order ticket…',
  validating_confirmation: 'Validating confirmation…',
  parsing_strategy: 'Parsing strategy…',
  blocked: 'Checking request…',
};

function WaveformBars() {
  return (
    <div className="flex h-5 shrink-0 items-end gap-[3px]" aria-hidden>
      {[16, 22, 12, 18].map((h, i) => (
        <div
          key={i}
          className="w-[3px] animate-waveform rounded-full bg-gradient-to-t from-royal-500 to-sky-400"
          style={{
            height: `${h}px`,
            animationDelay: `${i * 180}ms`,
            transformOrigin: 'bottom',
          }}
        />
      ))}
    </div>
  );
}

function ThinkingDots() {
  return (
    <span className="ml-1 inline-flex items-center gap-[3px]" aria-hidden>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 animate-bounce rounded-full bg-sky-500"
          style={{ animationDelay: `${i * 140}ms`, animationDuration: '0.9s' }}
        />
      ))}
    </span>
  );
}

export type ThinkingHint =
  | 'default'
  | 'trade'
  | 'confirm'
  | 'strategy'
  | 'chat';

function hintSeed(hint: ThinkingHint): string {
  switch (hint) {
    case 'trade':
      return 'Staging order ticket…';
    case 'confirm':
      return 'Validating confirmation…';
    case 'strategy':
      return 'Parsing strategy…';
    case 'chat':
      return 'Searching Files…';
    default:
      return STATUS_MESSAGES[0];
  }
}

interface ReasoningIndicatorProps {
  hint?: ThinkingHint;
  /** Live phase from SSE stream (takes priority over rotator). */
  phase?: string | null;
  /** Live chain-of-thought text from the model. */
  reasoningText?: string;
  reasoningDone?: boolean;
  /** Kept for call-site compatibility; file names are not rendered. */
  filenames?: string[];
  activeTools?: Array<'file_search' | 'web_search'>;
  className?: string;
}

export default function ReasoningIndicator({
  hint = 'default',
  phase = null,
  reasoningText = '',
  reasoningDone = false,
  activeTools,
  className,
}: ReasoningIndicatorProps) {
  const seed = hintSeed(hint);
  const rotation =
    hint === 'chat' || hint === 'default'
      ? STATUS_MESSAGES
      : ([seed, 'Thinking…', 'Preparing Response…'] as const);

  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    setCurrentIndex(0);
  }, [hint]);

  useEffect(() => {
    if (phase) return;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % rotation.length);
    }, ROTATE_MS);
    return () => clearInterval(interval);
  }, [rotation.length, phase]);

  const statusMessage = phase
    ? PHASE_LABELS[phase] ?? phase.replace(/_/g, ' ')
    : (rotation[currentIndex] ?? seed);

  const tools =
    activeTools ??
    ([
      ...(phase === 'searching_files' || phase === 'search_complete' ? (['file_search'] as const) : []),
      ...(phase === 'searching_web' ? (['web_search'] as const) : []),
    ] as Array<'file_search' | 'web_search'>);

  return (
    <div className={cn('flex w-full flex-col gap-2.5', className)} role="status" aria-live="polite">
      <div className="requi-thinking-shell rounded-2xl rounded-tl-md px-4 py-3.5">
        <div className="flex min-h-[1.5rem] items-center gap-3">
          <WaveformBars />
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="shrink-0 select-none text-[15px] font-semibold text-sky-600/85">
              Lucia…
            </span>
            <span
              key={statusMessage}
              className="requi-thinking-status text-[15px] font-semibold text-slate-900"
            >
              {statusMessage}
            </span>
            <ThinkingDots />
          </div>
        </div>
      </div>

      {tools.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pl-1 animate-in fade-in duration-300">
          {tools.includes('file_search') && (
            <span className="inline-flex items-center gap-1 rounded-md border border-sky-600/20 bg-sky-500/10 px-2 py-1 text-[10px] font-semibold text-sky-700">
              <FileText className="h-3 w-3" /> File search
            </span>
          )}
          {tools.includes('web_search') && (
            <span className="inline-flex items-center gap-1 rounded-md border border-teal-600/20 bg-teal-500/10 px-2 py-1 text-[10px] font-semibold text-teal-700">
              <Globe className="h-3 w-3" /> Web search
            </span>
          )}
        </div>
      )}

      {reasoningText.trim().length > 0 && (
        <div className="animate-in fade-in duration-200">
          <div className="mb-1.5 flex items-center gap-2 pl-1">
            <Brain className="h-3.5 w-3.5 text-sky-600" />
            <span className="text-xs font-semibold text-sky-700">
              {reasoningDone ? 'Reasoning' : 'Thinking'}
            </span>
            {!reasoningDone && (
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-sky-500" />
            )}
          </div>
          <div
            className={cn(
              'ml-1 max-h-40 overflow-y-auto border-l-2 pl-3',
              reasoningDone ? 'border-teal-400/80' : 'border-sky-400/80',
            )}
          >
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-600">
              {reasoningText}
              {!reasoningDone && (
                <span className="ml-0.5 inline-block h-3.5 w-0.5 animate-pulse rounded-full bg-sky-500 align-middle" />
              )}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/** Infer waiting UX from the outbound user text (does not change server routing). */
export function inferThinkingHint(text: string): ThinkingHint {
  const t = text.trim();
  if (/^CONFIRM ORDER\s+/i.test(t) || /^REJECT ORDER\s+/i.test(t)) return 'confirm';
  if (/^(buy|sell)\s+\d+\s+[A-Za-z.]{1,12}/i.test(t)) return 'trade';
  if (
    /^(ENTRY|EXIT|SIZING|FILTER|STRUCTURE|GRID)\s*:/im.test(t) ||
    (t.length > 40 &&
      /\b(buy|sell|long|short)\b/i.test(t) &&
      /\b(exit|stop|risk|entry)\b/i.test(t))
  ) {
    return 'strategy';
  }
  return 'chat';
}
