import { Radio, FileText, Activity, Lock, Zap, Shield, Cpu } from 'lucide-react'
import { colors, layout } from './design'
import { pipelineStages } from './autonomous.config'

const stageIcons: Record<string, React.ElementType> = {
  S1: FileText, S2: Activity, S3: Lock, S4: Zap, S5: Cpu, S6: Shield,
}

const stageColors: Record<string, string> = {
  S1: '#4F8EF7', S2: '#5ED6C0', S3: '#F4A261', S4: '#4F8EF7', S5: '#5ED6C0', S6: '#F4A261',
}

function StatusPill({ status }: { status: string }) {
  const colorsMap: Record<string, string> = {
    COMPLETE: '#30D158', ACTIVE: '#315CFF', PENDING: '#8E8E93', ERROR: '#FF453A',
  }
  return (
    <span style={{
      fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: colorsMap[status] || '#8E8E93', fontWeight: 600,
      padding: '3px 10px', background: `${colorsMap[status] || '#8E8E93'}15`, borderRadius: 6,
    }}>
      {status}
    </span>
  )
}

export default function EventsTab() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Radio size={16} color={colors.blue} strokeWidth={2} />
        <h2 style={{ fontSize: 18, fontWeight: 600, color: colors.textPrimary, margin: 0 }}>Event Pipeline</h2>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
        {pipelineStages.map((stage) => {
          const Icon = stageIcons[stage.id] || FileText
          const isActive = stage.status === 'ACTIVE'
          const accent = stageColors[stage.id]
          return (
            <div key={stage.id} style={{
              background: colors.bgPanel,
              border: `1px solid ${isActive ? colors.borderPurple : colors.border}`,
              borderRadius: layout.cardRadius,
              padding: 20,
              transition: 'border-color 200ms ease',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: `${accent}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon size={16} color={accent} />
                  </div>
                  <div>
                    <h3 style={{ fontSize: 14, fontWeight: 600, color: colors.textPrimary, margin: 0 }}>{stage.id} {stage.name}</h3>
                  </div>
                </div>
                <StatusPill status={stage.status} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: colors.textMuted, textTransform: 'uppercase' }}>Start</span>
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: colors.textSecondary }}>{stage.startTime}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: colors.textMuted, textTransform: 'uppercase' }}>End</span>
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: colors.textSecondary }}>{stage.endTime}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: colors.textMuted, textTransform: 'uppercase' }}>Latency</span>
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: isActive ? colors.blue : colors.textSecondary }}>{stage.latency}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: colors.textMuted, textTransform: 'uppercase' }}>Data Version</span>
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: colors.textSecondary }}>{stage.dataVersion}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: colors.textMuted, textTransform: 'uppercase' }}>Source</span>
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: colors.textSecondary }}>{stage.sourceStatus}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: colors.textMuted, textTransform: 'uppercase' }}>Result</span>
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: stage.passFail === 'PASS' ? colors.green : stage.passFail === 'PENDING' ? colors.orange : colors.red, fontWeight: 600 }}>{stage.passFail}</span>
                </div>
                {stage.error && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: colors.red }}>ERROR</span>
                    <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: colors.red }}>{stage.error}</span>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
