import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Sparkles, SendHorizonal, Copy, Check, ClipboardPaste, Layers, Wallet, Radio,
  TrendingUp, ShieldCheck, Route, CircleCheck, Square,
} from 'lucide-react';
import type { Strategy } from '@/lib/data';
import { trpc } from '@/providers/trpc';
import { cn } from '@/lib/utils';
import ConversationsPanel from './intelligence/ConversationsPanel';
import ScheduledTasksPanel from './intelligence/ScheduledTasksPanel';
import WatchlistPanel from './intelligence/WatchlistPanel';
import { AssistantMessageContent } from '@/components/AssistantMessageContent';
import ReasoningIndicator, {
  inferThinkingHint,
  type ThinkingHint,
} from '@/components/ReasoningIndicator';
import { streamIntelligenceChat } from '@/lib/intelligenceStream';

/* ─── message model ─────────────────────────────────────────────────────── */

interface ParsedStrategy {
  title: string;
  lines: { label: string; body: string }[];
  accounts: number;
}

interface Msg {
  id: number;
  role: 'user' | 'ai';
  kind: 'text' | 'parsed';
  text?: string;
  parsed?: ParsedStrategy;
  streaming?: boolean;
}

let mid = 0;
const nextId = () => ++mid;

// Master Build §5/§11: no seeded onboarding — conversation starts empty.
const seed: Msg[] = [];

const quickPrompts = [
  'Portfolio status',
  'Buy 25 ALPHA at 150 limit',
  'What filled in the last hour?',
];

/* ─── small pieces ──────────────────────────────────────────────────────── */

function Bubble({ msg }: { msg: Msg }) {
  if (msg.role === 'user') {
    return (
      <div className="flex justify-end">
        <pre className="font-mono-num max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md border border-royal-500/30 bg-royal-500/15 px-4 py-3 text-xs leading-relaxed text-sky-800">
          {msg.text}
        </pre>
      </div>
    );
  }

  if (msg.kind === 'parsed' && msg.parsed) {
    const p = msg.parsed;
    return (
      <div className="flex gap-3">
        <div className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-royal-500 via-sky-500 to-teal-500">
          <Sparkles className="h-4 w-4 text-white" />
        </div>
        <div className="max-w-[85%] flex-1">
          <div className="glass rounded-2xl rounded-tl-md p-4">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-display text-sm font-semibold text-slate-900">Strategy parsed — {p.title}</p>
              <span className="rounded-full border border-teal-600/25 bg-teal-600/10 px-2 py-0.5 text-[10px] font-bold text-teal-700">
                SAVED
              </span>
            </div>
            <div className="mt-3 space-y-2">
              {p.lines.map((l) => (
                <div key={l.label} className="flex gap-3 text-xs leading-relaxed">
                  <span className="font-mono-num w-20 shrink-0 rounded border border-sky-600/25 bg-sky-600/10 px-1.5 py-0.5 text-center text-[10px] font-bold text-sky-600">
                    {l.label}
                  </span>
                  <span className="text-slate-600">{l.body}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-900/5 pt-3">
              <span className="flex items-center gap-1.5 rounded-lg bg-teal-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-teal-700">
                <Route className="h-3.5 w-3.5" /> {p.accounts > 0 ? `Routes to ${p.accounts} account${p.accounts === 1 ? '' : 's'}` : 'No accounts connected'}
              </span>
              <span className="flex items-center gap-1.5 rounded-lg bg-slate-900/[0.04] px-2.5 py-1.5 text-[11px] font-medium text-slate-600">
                <ShieldCheck className="h-3.5 w-3.5 text-sky-600" /> Stop required on every ticket
              </span>
              <span className="flex items-center gap-1.5 rounded-lg bg-slate-900/[0.04] px-2.5 py-1.5 text-[11px] font-medium text-slate-600">
                <CircleCheck className="h-3.5 w-3.5 text-sky-600" /> Saved as Paper — promote after validation
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3">
      <div className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-royal-500 via-sky-500 to-teal-500">
        <Sparkles className="h-4 w-4 text-white" />
      </div>
      <div className="glass max-w-[85%] rounded-2xl rounded-tl-md px-4 py-3 text-sm leading-relaxed text-slate-700">
        <AssistantMessageContent content={msg.text ?? ''} streaming={msg.streaming} />
      </div>
    </div>
  );
}

/* ─── main page ─────────────────────────────────────────────────────────── */

export default function Intelligence() {
  const [messages, setMessages] = useState<Msg[]>(seed);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [thinkingHint, setThinkingHint] = useState<ThinkingHint>('default');
  const [streamPhase, setStreamPhase] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [panel, setPanel] = useState<'library' | 'conversations' | 'scheduled' | 'watchlist'>('library');
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const streamMsgIdRef = useRef<number | null>(null);

  const utils = trpc.useUtils();
  const { data: strategyRows } = trpc.trading.strategies.useQuery();
  const { data: gwSource } = trpc.marketData.gatewaySource.useQuery(undefined, { refetchInterval: 15000 });
  const [marketMeta, setMarketMeta] = useState<{ sourceName: string | null; timestamp: string | null; stale: boolean } | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 5000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const library = useMemo<Strategy[]>(
    () =>
      (strategyRows ?? []).map((s) => ({
        id: `STR-${String(s.id).padStart(2, '0')}`,
        name: s.name,
        source: s.source as Strategy['source'],
        asset: s.asset as Strategy['asset'],
        status: s.status as Strategy['status'],
        accounts: s.accounts,
        pnl30d: parseFloat(s.pnl30d),
        winRate: s.winRate,
        trades: s.trades,
        prompt: s.prompt,
      })),
    [strategyRows],
  );

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, thinking, streamPhase]);

  const stopStream = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setThinking(false);
    setStreamPhase(null);
    streamMsgIdRef.current = null;
  };

  const send = (raw?: string) => {
    const text = (raw ?? input).trim();
    if (!text || thinking) return;
    setInput('');
    setMessages((m) => [...m, { id: nextId(), role: 'user', kind: 'text', text }]);
    setThinking(true);
    setThinkingHint(inferThinkingHint(text));
    setStreamPhase('initializing');

    const aiId = nextId();
    streamMsgIdRef.current = aiId;

    abortRef.current?.abort();
    abortRef.current = streamIntelligenceChat(
      text,
      {
        onConversation: (id) => {
          setConversationId(id);
          utils.conversations.list.invalidate();
        },
        onPhase: (phase) => setStreamPhase(phase),
        onToken: (_chunk, full) => {
          setThinking(false);
          setMessages((m) => {
            const exists = m.some((x) => x.id === aiId);
            if (!exists) {
              return [...m, { id: aiId, role: 'ai', kind: 'text', text: full, streaming: true }];
            }
            return m.map((x) => (x.id === aiId ? { ...x, text: full, streaming: true } : x));
          });
        },
        onDone: (res) => {
          setThinking(false);
          setStreamPhase(null);
          streamMsgIdRef.current = null;
          abortRef.current = null;
          if (res.conversationId) setConversationId(res.conversationId);
          if (res.market) setMarketMeta(res.market);
          utils.conversations.list.invalidate();

          if (res.kind === 'parsed') {
            setMessages((m) => {
              const withoutStream = m.filter((x) => x.id !== aiId);
              return [
                ...withoutStream,
                {
                  id: nextId(),
                  role: 'ai',
                  kind: 'parsed',
                  parsed: {
                    title: res.parsed.title,
                    lines: res.parsed.lines,
                    accounts: (res.parsed as { accounts?: number }).accounts ?? 0,
                  },
                },
              ];
            });
            utils.trading.strategies.invalidate();
            return;
          }

          setMessages((m) => {
            const exists = m.some((x) => x.id === aiId);
            if (!exists) {
              return [...m, { id: aiId, role: 'ai', kind: 'text', text: res.reply, streaming: false }];
            }
            return m.map((x) =>
              x.id === aiId ? { ...x, text: res.reply, streaming: false } : x,
            );
          });
        },
        onError: (message) => {
          setThinking(false);
          setStreamPhase(null);
          streamMsgIdRef.current = null;
          abortRef.current = null;
          setMessages((m) => {
            const withoutStream = m.filter((x) => x.id !== aiId || (x.text && x.text.trim()));
            return [
              ...withoutStream.filter((x) => x.id !== aiId || Boolean(x.text?.trim())),
              {
                id: nextId(),
                role: 'ai',
                kind: 'text',
                text: message || 'Connection hiccup — I could not reach the engine. Please try again in a moment.',
              },
            ];
          });
        },
        onAborted: () => {
          setThinking(false);
          setStreamPhase(null);
          streamMsgIdRef.current = null;
          abortRef.current = null;
        },
      },
      { conversationId },
    );
  };

  const openConversation = (id: string) => {
    stopStream();
    setConversationId(id);
    setMessages([]);
    loadMessages.mutate({ conversationId: id });
  };

  const newChat = () => {
    stopStream();
    setConversationId(null);
    setMessages([]);
  };

  const loadMessages = trpc.conversations.messages.useMutation({
    onSuccess: (rows) => {
      setMessages(
        rows.map((r) => ({
          id: nextId(),
          role: r.role === 'user' ? 'user' : 'ai',
          kind: 'text',
          text: r.content,
        })),
      );
    },
  });

  const copyPrompt = (s: Strategy) => {
    navigator.clipboard?.writeText(s.prompt).catch(() => {});
    setCopiedId(s.id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const { data: accountsPayload } = trpc.trading.accounts.useQuery(undefined, { refetchInterval: 60000 });
  const accountRows = accountsPayload?.accounts;
  const { data: signalsToday } = trpc.signals.todayCount.useQuery(undefined, { refetchInterval: 30000 });
  const { data: positionRows } = trpc.financials.positions.useQuery(undefined, { refetchInterval: 30000 });

  const dayPnl = useMemo(() => {
    if (!positionRows) return null;
    const etToday = new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York' });
    const closedToday = positionRows.filter(
      (p) => p.status === 'CLOSED' && p.closedAt !== null &&
        new Date(p.closedAt).toLocaleDateString('en-US', { timeZone: 'America/New_York' }) === etToday,
    );
    if (closedToday.length === 0) return null;
    return closedToday.reduce((a, p) => a + (p.realizedPnl ?? 0), 0);
  }, [positionRows]);

  const stats = [
    {
      icon: Layers,
      label: 'Active strategies',
      value: `${library.filter((s) => s.status === 'Live').length} live · ${library.filter((s) => s.status === 'Paper').length} paper`,
    },
    {
      icon: Wallet,
      label: 'Connected accounts',
      value: accountRows ? (accountRows.length > 0 ? `${accountRows.length} connected` : 'Not Connected') : 'Syncing',
    },
    {
      icon: Radio,
      label: 'Signals today',
      value: signalsToday ? String(signalsToday.count) : 'Syncing',
    },
    {
      icon: TrendingUp,
      label: 'Day P&L',
      value: dayPnl === null ? 'No closes yet' : `${dayPnl >= 0 ? '+' : ''}$${Math.abs(dayPnl).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    },
  ];

  return (
    <div className="flex h-full flex-col space-y-5">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm text-slate-500">Requi AI Engine 2.0</p>
          <h1 className="font-display flex items-center gap-2.5 text-2xl font-bold text-slate-900 sm:text-3xl">
            Intelligence
            <span className="flex items-center gap-1.5 rounded-full border border-teal-600/20 bg-teal-600/10 px-2.5 py-1 text-[10px] font-semibold text-teal-700">
              <span className="live-dot h-1.5 w-1.5 rounded-full bg-teal-600" /> LIVE
            </span>
          </h1>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-3">
          {stats.map((s) => (
            <div key={s.label} className="glass flex items-center gap-2.5 rounded-xl px-3.5 py-2">
              <s.icon className="h-4 w-4 shrink-0 text-sky-600" />
              <div className="leading-tight">
                <p className="text-[11px] font-semibold text-slate-900">{s.value}</p>
                <p className="text-[10px] text-slate-500">{s.label}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[1.7fr_1fr]">
        <div className="glass flex min-h-[520px] flex-col overflow-hidden rounded-2xl lg:h-[calc(100vh-16.5rem)] lg:min-h-0">
          <div className="flex items-center gap-2.5 border-b border-slate-900/5 px-5 py-3.5">
            <div className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-royal-500 via-sky-500 to-teal-500">
              <Sparkles className="h-3.5 w-3.5 text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">Trading Console</p>
              <p className="text-[11px] text-slate-500">Paste a text strategy, or type a command</p>
            </div>
            {(gwSource || marketMeta) && (
              <div
                className="ml-auto flex items-center gap-1.5 rounded-full border border-slate-900/10 bg-slate-50 px-2.5 py-1"
                title="Market data is served by the deterministic RTI gateway"
              >
                <span className={cn('h-1.5 w-1.5 rounded-full', marketMeta?.stale ? 'bg-amber-500' : 'bg-teal-600')} />
                <span className="text-[10px] font-medium tabular-nums text-slate-500">
                  Market Data — {marketMeta?.sourceName ?? gwSource?.sourceName ?? '…'}
                  {marketMeta?.timestamp &&
                    ` · Updated ${Math.max(0, Math.round((nowMs - new Date(marketMeta.timestamp).getTime()) / 1000))}s ago`}
                  {marketMeta?.stale && ' · delayed'}
                </span>
              </div>
            )}
          </div>

          <div ref={scrollRef} className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
            {messages.length === 0 && !thinking && (
              <div className="flex h-full items-center justify-center">
                <p className="max-w-xs text-center text-xs leading-relaxed text-slate-400">
                  No intelligence yet. Paste a text strategy or ask about your portfolio —
                  every response here comes from your real account data.
                </p>
              </div>
            )}
            {messages.map((m) => (
              <Bubble key={m.id} msg={m} />
            ))}
            {thinking && (
              <ReasoningIndicator phase={streamPhase} hint={thinkingHint} />
            )}
          </div>

          <div className="border-t border-slate-900/5 p-4">
            <div className="mb-3 flex flex-wrap gap-2">
              {quickPrompts.map((q) => (
                <button
                  key={q}
                  onClick={() => send(q)}
                  disabled={thinking}
                  className="rounded-full border border-slate-900/8 bg-slate-900/[0.03] px-3 py-1.5 text-[11px] font-medium text-slate-500 transition-colors hover:border-sky-600/40 hover:text-sky-600 disabled:opacity-40"
                >
                  {q}
                </button>
              ))}
            </div>
            <div className="flex items-end gap-2.5">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                rows={3}
                placeholder={'Paste a research protocol or ask a question…\nLong prompts are accepted automatically — Enter to send (Shift+Enter for newline).'}
                className="font-mono-num max-h-96 min-h-[4.5rem] flex-1 resize-y rounded-xl border border-slate-900/10 bg-slate-900/[0.03] px-4 py-3 text-xs leading-relaxed text-slate-700 placeholder:text-slate-600 outline-none focus:border-sky-600/50"
              />
              {thinking ? (
                <button
                  onClick={stopStream}
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-slate-900/15 bg-white text-slate-600 transition-all hover:bg-slate-50"
                  aria-label="Stop"
                >
                  <Square className="h-4 w-4 fill-current" />
                </button>
              ) : (
                <button
                  onClick={() => send()}
                  disabled={!input.trim()}
                  className="btn-glow grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-royal-500 text-white transition-all hover:bg-royal-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
                  aria-label="Send"
                >
                  <SendHorizonal className="h-4.5 w-4.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="glass flex min-h-0 flex-col overflow-hidden rounded-2xl lg:h-[calc(100vh-16.5rem)]">
          <div className="flex border-b border-slate-900/5">
            {(
              [
                ['library', 'Library'],
                ['watchlist', 'Watchlist'],
                ['conversations', 'Conversations'],
                ['scheduled', 'Scheduled'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setPanel(key)}
                className={cn(
                  'flex-1 border-b-2 px-3 py-3 text-[11px] font-semibold transition-colors',
                  panel === key
                    ? 'border-royal-500 text-royal-600'
                    : 'border-transparent text-slate-400 hover:text-slate-600',
                )}
              >
                {label}
              </button>
            ))}
          </div>
          {panel === 'conversations' && (
            <ConversationsPanel activeConversationId={conversationId} onOpen={openConversation} onNew={newChat} />
          )}
          {panel === 'watchlist' && <WatchlistPanel />}
          {panel === 'scheduled' && <ScheduledTasksPanel />}
          {panel === 'library' && (
          <>
          <div className="border-b border-slate-900/5 px-5 py-3.5">
            <p className="text-sm font-semibold text-slate-900">Strategy Library</p>
            <p className="text-[11px] text-slate-500">Text-based — copy & paste into the console</p>
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {library.length === 0 && (
              <p className="px-1 py-6 text-center text-xs text-slate-400">
                No strategies yet. Paste ENTRY / EXIT / SIZING text into the console to save one.
              </p>
            )}
            {library.map((s) => (
              <div key={s.id} className="rounded-xl border border-slate-900/8 bg-slate-900/[0.02] p-4 transition-colors hover:border-sky-600/30">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{s.name}</p>
                    <p className="mt-0.5 text-[11px] text-slate-500">{s.source} · {s.asset}</p>
                  </div>
                  <span
                    className={cn(
                      'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold',
                      s.status === 'Live' && 'bg-teal-600/10 text-teal-700',
                      s.status === 'Paper' && 'bg-amber-500/10 text-amber-600',
                      s.status === 'Paused' && 'bg-slate-400/10 text-slate-500',
                    )}
                  >
                    {s.status}
                  </span>
                </div>
                <pre className="font-mono-num mt-3 line-clamp-3 whitespace-pre-wrap rounded-lg bg-slate-100 p-3 text-[10.5px] leading-relaxed text-slate-500">
                  {s.prompt}
                </pre>
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => copyPrompt(s)}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-900/10 bg-slate-900/[0.03] px-3 py-2 text-[11px] font-semibold text-slate-600 transition-colors hover:bg-slate-900/[0.07]"
                  >
                    {copiedId === s.id ? <Check className="h-3.5 w-3.5 text-teal-600" /> : <Copy className="h-3.5 w-3.5" />}
                    {copiedId === s.id ? 'Copied' : 'Copy'}
                  </button>
                  <button
                    onClick={() => setInput(s.prompt)}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-royal-500/90 px-3 py-2 text-[11px] font-semibold text-white transition-colors hover:bg-royal-600"
                  >
                    <ClipboardPaste className="h-3.5 w-3.5" /> Paste into console
                  </button>
                </div>
              </div>
            ))}
          </div>
          </>
          )}
        </div>
      </div>
    </div>
  );
}
