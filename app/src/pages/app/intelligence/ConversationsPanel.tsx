import { useState } from 'react';
import { MessageSquare, Plus, Trash2, Pencil, Check, X } from 'lucide-react';
import { trpc } from '@/providers/trpc';

interface Props {
  activeConversationId: string | null;
  onOpen: (conversationId: string) => void;
  onNew: () => void;
}

/** Recent Conversations — resumable chat threads persisted server-side. */
export default function ConversationsPanel({ activeConversationId, onOpen, onNew }: Props) {
  const utils = trpc.useUtils();
  const { data: rows, isLoading } = trpc.conversations.list.useQuery();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');

  const refresh = () => utils.conversations.list.invalidate();

  const rename = trpc.conversations.rename.useMutation({ onSuccess: () => { setEditingId(null); refresh(); } });
  const remove = trpc.conversations.remove.useMutation({ onSuccess: refresh });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-slate-900/5 px-5 py-3.5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-900">Recent Conversations</p>
            <p className="text-[11px] text-slate-500">Pick up any thread where you left off</p>
          </div>
          <button
            onClick={onNew}
            className="flex items-center gap-1.5 rounded-lg bg-royal-500/90 px-3 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-royal-600"
          >
            <Plus className="h-3.5 w-3.5" /> New chat
          </button>
        </div>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-4">
        {isLoading && <p className="py-8 text-center text-xs text-slate-400">Loading…</p>}
        {!isLoading && (rows ?? []).length === 0 && (
          <p className="py-8 text-center text-xs leading-relaxed text-slate-400">
            No conversations yet. Send a message in the console and it will appear here.
          </p>
        )}
        {(rows ?? []).map((c) => (
          <div
            key={c.id}
            className={`group flex items-center gap-3 rounded-xl border p-3 transition-colors ${
              c.id === activeConversationId
                ? 'border-sky-600/40 bg-sky-600/[0.06]'
                : 'border-slate-900/8 bg-slate-900/[0.02] hover:border-sky-600/30'
            }`}
          >
            <MessageSquare className="h-4 w-4 shrink-0 text-sky-600" />
            {editingId === c.id ? (
              <div className="flex min-w-0 flex-1 items-center gap-1.5">
                <input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="min-w-0 flex-1 rounded-md border border-slate-900/10 bg-white px-2 py-1 text-xs text-slate-700 outline-none focus:border-sky-600/50"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && editTitle.trim()) rename.mutate({ conversationId: c.id, title: editTitle.trim() });
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                />
                <button onClick={() => editTitle.trim() && rename.mutate({ conversationId: c.id, title: editTitle.trim() })} aria-label="Save title">
                  <Check className="h-3.5 w-3.5 text-teal-600" />
                </button>
                <button onClick={() => setEditingId(null)} aria-label="Cancel">
                  <X className="h-3.5 w-3.5 text-slate-400" />
                </button>
              </div>
            ) : (
              <>
                <button onClick={() => onOpen(c.id)} className="min-w-0 flex-1 text-left">
                  <p className="truncate text-xs font-semibold text-slate-800">{c.title}</p>
                  <p className="mt-0.5 text-[10px] text-slate-500">
                    {new Date(c.lastMessageAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  </p>
                </button>
                <button
                  onClick={() => { setEditingId(c.id); setEditTitle(c.title); }}
                  className="opacity-0 transition-opacity group-hover:opacity-100"
                  aria-label="Rename"
                >
                  <Pencil className="h-3.5 w-3.5 text-slate-400 hover:text-sky-600" />
                </button>
                <button
                  onClick={() => remove.mutate({ conversationId: c.id })}
                  className="opacity-0 transition-opacity group-hover:opacity-100"
                  aria-label="Delete"
                >
                  <Trash2 className="h-3.5 w-3.5 text-slate-400 hover:text-red-500" />
                </button>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
