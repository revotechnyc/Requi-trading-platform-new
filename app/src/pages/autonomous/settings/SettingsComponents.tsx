import { useState } from 'react';
import { colors, layout } from '../design';
import { useEditableField, type EditState } from './useSettings';

export function EditableRow({
  label,
  value,
  unit,
  type,
  onSave,
  min,
  max,
  step = 1,
  description,
}: {
  label: string;
  value: number | string;
  unit: string;
  type: 'currency' | 'percent' | 'integer' | 'decimal';
  onSave: (val: any) => Promise<{ success: boolean; error?: string }>;
  min?: number;
  max?: number;
  step?: number;
  description?: string;
}) {
  const field = useEditableField(value, onSave);

  const formatDisplay = (v: any) => {
    if (v === undefined || v === null) return '-';
    if (type === 'currency') return `$${Number(v).toLocaleString()}`;
    if (type === 'percent') return `${Number(v).toFixed(2)}%`;
    return String(v);
  };

  const stateColor: Record<EditState, string> = {
    IDLE: colors.textPrimary,
    EDITING: colors.blue,
    SAVING: colors.orange,
    SAVED: colors.green,
    REJECTED: colors.red,
    CONFLICT: colors.red,
  };

  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '12px 0', borderBottom: `1px solid ${colors.border}`,
      transition: 'background 150ms ease',
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 13, color: colors.textSecondary }}>{label}</span>
        {description && <span style={{ fontSize: 10, color: colors.textMuted }}>{description}</span>}
      </div>

      {field.isEditing ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {type === 'currency' && <span style={{ fontSize: 13, color: colors.textMuted }}>$</span>}
          <input
            type="number"
            value={field.editValue}
            onChange={(e) => field.setEditValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') field.saveEdit(); if (e.key === 'Escape') field.cancelEdit(); }}
            min={min}
            max={max}
            step={step}
            autoFocus
            style={{
              padding: '6px 10px', background: colors.bgSecondary,
              border: `1px solid ${colors.blue}`, borderRadius: layout.cardRadiusSmall,
              color: colors.textPrimary, fontFamily: 'JetBrains Mono, monospace',
              fontSize: 13, width: 120, textAlign: 'right',
              outline: 'none',
            }}
          />
          {type === 'percent' && <span style={{ fontSize: 13, color: colors.textMuted }}>%</span>}
          <button onClick={field.saveEdit} style={{
            padding: '4px 10px', background: colors.blue, border: 'none',
            borderRadius: layout.cardRadiusSmall, color: '#fff',
            fontSize: 11, fontWeight: 600, cursor: 'pointer',
          }}>SAVE</button>
          <button onClick={field.cancelEdit} style={{
            padding: '4px 10px', background: 'transparent',
            border: `1px solid ${colors.border}`, borderRadius: layout.cardRadiusSmall,
            color: colors.textSecondary, fontSize: 11, cursor: 'pointer',
          }}>CANCEL</button>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
          onClick={field.startEdit}>
          <span style={{
            fontFamily: 'JetBrains Mono, monospace', fontSize: 13,
            fontWeight: 500, color: stateColor[field.state],
            transition: 'color 200ms ease',
          }}>
            {field.state === 'SAVING' ? 'SAVING...' : formatDisplay(field.value)}
          </span>
          {field.state === 'SAVED' && <span style={{ fontSize: 10, color: colors.green }}>SAVED</span>}
          {field.state === 'REJECTED' && <span style={{ fontSize: 10, color: colors.red }}>{field.error}</span>}
          {field.state === 'CONFLICT' && <span style={{ fontSize: 10, color: colors.red }}>CONFLICT</span>}
          <span style={{ fontSize: 11, color: colors.textMuted, opacity: 0.5 }}>EDIT</span>
        </div>
      )}
    </div>
  );
}

export function ToggleRow({
  label,
  value,
  onSave,
  description,
}: {
  label: string;
  value: boolean;
  onSave: (val: boolean) => Promise<{ success: boolean; error?: string }>;
  description?: string;
}) {
  const [localValue, setLocalValue] = useState(value);
  const [state, setState] = useState<'IDLE' | 'SAVING' | 'SAVED'>('IDLE');

  const handleToggle = async () => {
    const newVal = !localValue;
    setLocalValue(newVal);
    setState('SAVING');
    try {
      const result = await onSave(newVal);
      if (result.success) {
        setState('SAVED');
        setTimeout(() => setState('IDLE'), 1500);
      } else {
        setLocalValue(value);
        setState('IDLE');
      }
    } catch {
      setLocalValue(value);
      setState('IDLE');
    }
  };

  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '12px 0', borderBottom: `1px solid ${colors.border}`,
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 13, color: colors.textSecondary }}>{label}</span>
        {description && <span style={{ fontSize: 10, color: colors.textMuted }}>{description}</span>}
      </div>
      <button onClick={handleToggle} style={{
        width: 44, height: 24, borderRadius: 12,
        background: localValue ? colors.blue : colors.border,
        border: 'none', cursor: 'pointer', position: 'relative',
        transition: 'background 150ms ease',
      }}>
        <div style={{
          width: 18, height: 18, borderRadius: 9,
          background: '#fff',
          position: 'absolute',
          top: 3,
          left: localValue ? 22 : 4,
          transition: 'left 150ms ease',
        }} />
      </button>
      {state === 'SAVED' && <span style={{ fontSize: 10, color: colors.green, marginLeft: 8 }}>SAVED</span>}
    </div>
  );
}

export function SelectRowReactive({
  label,
  value,
  options,
  onSave,
  description,
}: {
  label: string;
  value: string;
  options: string[];
  onSave: (val: string) => Promise<{ success: boolean; error?: string }>;
  description?: string;
}) {
  const [localValue, setLocalValue] = useState(value);
  const [state, setState] = useState<'IDLE' | 'SAVING' | 'SAVED'>('IDLE');

  const handleChange = async (newVal: string) => {
    setLocalValue(newVal);
    setState('SAVING');
    try {
      const result = await onSave(newVal);
      if (result.success) {
        setState('SAVED');
        setTimeout(() => setState('IDLE'), 1500);
      } else {
        setLocalValue(value);
        setState('IDLE');
      }
    } catch {
      setLocalValue(value);
      setState('IDLE');
    }
  };

  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '12px 0', borderBottom: `1px solid ${colors.border}`,
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 13, color: colors.textSecondary }}>{label}</span>
        {description && <span style={{ fontSize: 10, color: colors.textMuted }}>{description}</span>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <select
          value={localValue}
          onChange={(e) => handleChange(e.target.value)}
          style={{
            padding: '6px 10px', background: colors.bgSecondary,
            border: `1px solid ${colors.border}`, borderRadius: layout.cardRadiusSmall,
            color: colors.textPrimary, fontFamily: 'JetBrains Mono, monospace',
            fontSize: 12, minWidth: 160,
          }}
        >
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        {state === 'SAVED' && <span style={{ fontSize: 10, color: colors.green }}>SAVED</span>}
      </div>
    </div>
  );
}

export function StrategyBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    LIVE: colors.green,
    PAPER: colors.blue,
    BACKTEST: colors.orange,
    DRAFT: colors.textMuted,
    ARCHIVED: colors.textMuted,
    ENABLED: colors.green,
    DISABLED: colors.textMuted,
    PREFERRED: colors.blue,
    PRODUCTION: colors.green,
    BETA: colors.orange,
  };
  const color = colorMap[status] ?? colors.textSecondary;
  return (
    <span style={{
      fontFamily: 'JetBrains Mono, monospace', fontSize: 10,
      color, fontWeight: 600, padding: '2px 6px',
      background: `${color}10`, borderRadius: 4,
      border: `1px solid ${color}30`,
    }}>{status}</span>
  );
}

export function StatusBadge({ state }: { state: string }) {
  const colorMap: Record<string, string> = {
    ACTIVE: colors.green,
    PENDING: colors.orange,
    SAVED: colors.green,
    REVERTED: colors.red,
    REJECTED: colors.red,
    APPLIED: colors.green,
    REQUESTED: colors.textMuted,
    VALIDATED: colors.blue,
  };
  const color = colorMap[state] ?? colors.textSecondary;
  return (
    <span style={{
      fontFamily: 'JetBrains Mono, monospace', fontSize: 10,
      color, fontWeight: 500,
    }}>{state}</span>
  );
}
