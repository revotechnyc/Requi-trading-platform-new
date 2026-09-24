import { Settings, Activity, Shield, AlertTriangle, TrendingUp, Lock, History, Bell, BarChart3, Scale } from 'lucide-react'
import { colors, layout } from './design'
import { apmaConfig } from './apma.config'
import { useState } from 'react'
import { useRiskProfile, useStrategySelectionProfile, useProtectionProfile, useConfigurationHistory } from './settings/useSettings'
import { EditableRow, ToggleRow, SelectRowReactive, StrategyBadge, StatusBadge } from './settings/SettingsComponents'
import LegalComplianceTab from './legal/LegalComplianceTab'

function Card({ title, icon: Icon, children, rightAction }: { title: string; icon: React.ElementType; children: React.ReactNode; rightAction?: React.ReactNode }) {
  return (
    <div style={{ background: colors.bgPanel, border: `1px solid ${colors.border}`, borderRadius: layout.cardRadius, overflow: 'hidden', marginBottom: 16 }}>
      <div style={{ padding: 20, borderBottom: `1px solid ${colors.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Icon size={16} color={colors.blue} strokeWidth={2} />
          <h2 style={{ fontSize: 18, fontWeight: 600, color: colors.textPrimary, margin: 0 }}>{title}</h2>
        </div>
        {rightAction}
      </div>
      <div style={{ padding: 20 }}>{children}</div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <h3 style={{ fontSize: 14, fontWeight: 600, color: colors.textPrimary, margin: '0 0 12px 0', textTransform: 'uppercase', letterSpacing: 0.5 }}>{title}</h3>
      {children}
    </div>
  )
}

export default function SettingsTab() {
  const [activeTab, setActiveTab] = useState<'general' | 'risk' | 'strategies' | 'protection' | 'history' | 'notifications' | 'charts' | 'legal'>('general')

  const { profile, update, isUpdating } = useRiskProfile(1, 1)
  const { selectionProfile, preferences, strategies, updateSelection, updatePreference, isUpdating: isStrategyUpdating } = useStrategySelectionProfile(1, 1)
  const { profile: protectionProfile, update: updateProtection, isUpdating: isProtectionUpdating } = useProtectionProfile(1, 1)
  const { events: configEvents } = useConfigurationHistory(30)

  const handleRiskUpdate = (field: string, type: string) => async (val: any) => {
    if (!profile) return { success: false, error: 'NO_PROFILE' }
    const numVal = type === 'currency' || type === 'percent' || type === 'integer' ? Number(val) : val
    const updates: any = { id: profile.id, expectedVersion: profile.version ?? 1 }
    if (field === 'maxDailyLoss') updates.maxDailyLoss = numVal
    if (field === 'maxEventRisk') updates.maxEventRisk = numVal
    if (field === 'maxSingleNameExposure') updates.maxSingleNameExposure = numVal
    if (field === 'maxSectorExposure') updates.maxSectorExposure = numVal
    if (field === 'maxGrossExposure') updates.maxGrossExposure = numVal
    if (field === 'maxNetExposure') updates.maxNetExposure = numVal
    if (field === 'maxCorrelatedExposure') updates.maxCorrelatedExposure = numVal
    if (field === 'haltOnConsecutiveLosses') updates.haltOnConsecutiveLosses = Math.floor(numVal)
    try {
      const result: any = await update(updates)
      return { success: result.success, error: result.error }
    } catch (e) {
      return { success: false, error: 'NETWORK_ERROR' }
    }
  }

  const handleProtectionUpdate = (field: string) => async (val: any) => {
    if (!protectionProfile) return { success: false, error: 'NO_PROFILE' }
    const numVal = typeof val === 'boolean' ? val : Number(val)
    const updates: any = { id: protectionProfile.id, expectedVersion: protectionProfile.version ?? 1 }
    if (field === 'syntheticStopEnabled') updates.syntheticStopEnabled = val
    if (field === 'syntheticTrailEnabled') updates.syntheticTrailEnabled = val
    if (field === 'initialStopValue') updates.initialStopValue = numVal
    if (field === 'trailValue') updates.trailValue = numVal
    if (field === 'atrMultiplier') updates.atrMultiplier = numVal
    if (field === 'minimumProtectionDistance') updates.minimumProtectionDistance = numVal
    if (field === 'repriceEnabled') updates.repriceEnabled = val
    if (field === 'apmaEnabled') updates.apmaEnabled = val
    try {
      const result: any = await updateProtection(updates)
      return { success: result.success, error: result.error }
    } catch (e) {
      return { success: false, error: 'NETWORK_ERROR' }
    }
  }

  const handleSelectionModeChange = async (mode: string) => {
    if (!selectionProfile) return { success: false, error: 'NO_PROFILE' }
    try {
      const result: any = await updateSelection({
        userId: 1, accountId: 1,
        selectionMode: mode as 'AUTO' | 'USER_PREFERRED' | 'USER_LOCKED',
        expectedVersion: selectionProfile.version ?? 1,
      })
      return { success: result.success, error: result.error }
    } catch (e) {
      return { success: false, error: 'NETWORK_ERROR' }
    }
  }

  const handleStrategyPreference = (strategyId: number, field: 'enabled' | 'preferred') => async (val: boolean) => {
    try {
      const result: any = await updatePreference({ userId: 1, accountId: 1, strategyId, [field]: val })
      return { success: result.success, error: result.error }
    } catch (e) {
      return { success: false, error: 'NETWORK_ERROR' }
    }
  }

  const tabs = [
    { key: 'general', label: 'General', icon: Settings },
    { key: 'risk', label: 'Risk', icon: Shield },
    { key: 'strategies', label: 'Strategies', icon: TrendingUp },
    { key: 'protection', label: 'Protection', icon: Lock },
    { key: 'history', label: 'History', icon: History },
    { key: 'notifications', label: 'Alerts', icon: Bell },
    { key: 'charts', label: 'Charts', icon: BarChart3 },
    { key: 'legal', label: 'Legal', icon: Scale },
  ] as const

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <Settings size={18} color={colors.blue} strokeWidth={2} />
        <h2 style={{ fontSize: 20, fontWeight: 700, color: colors.textPrimary, margin: 0 }}>Settings</h2>
      </div>

      {/* Tab Navigation */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: `1px solid ${colors.border}`, paddingBottom: 12, overflowX: 'auto' }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', borderRadius: layout.cardRadiusSmall,
              border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
              background: activeTab === t.key ? `${colors.blue}15` : 'transparent',
              color: activeTab === t.key ? colors.blue : colors.textSecondary,
              fontSize: 13, fontWeight: 600,
              transition: 'all 150ms ease',
            }}
          >
            <t.icon size={14} strokeWidth={2} />
            {t.label}
          </button>
        ))}
      </div>

      {/* GENERAL TAB */}
      {activeTab === 'general' && (
        <>
          <Card title='Engine Mode' icon={Activity}>
            <SelectRowReactive label='Trading Mode' value='PAPER' options={['SHADOW', 'PAPER', 'LIVE']}
              onSave={async () => ({ success: true })} description='Operational trading environment' />
            <SelectRowReactive label='Position Handling' value='HOLD_UNTIL_MIDNIGHT'
              options={['HOLD_UNTIL_MIDNIGHT', 'AUTO_CLOSE_WHEN_PROFITABLE', 'HOLD_INDEFINITELY']}
              onSave={async () => ({ success: true })} />
            <SelectRowReactive label='Event Strategy' value='STANDARD' options={['AGGRESSIVE', 'CONSERVATIVE', 'STANDARD']}
              onSave={async () => ({ success: true })} />
            <SelectRowReactive label='Time Zone' value='AMERICA/NEW_YORK' options={['AMERICA/NEW_YORK']}
              onSave={async () => ({ success: true })} />
          </Card>

          <Card title='Strategy Registry' icon={Activity}>
            {strategies.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: colors.textMuted }}>
                Loading strategies from database...
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {strategies.map((s: any) => (
                  <div key={s.id} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '12px 0', borderBottom: `1px solid ${colors.border}`,
                  }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontSize: 13, color: colors.textSecondary, fontWeight: 500 }}>{s.name || s.displayName}</span>
                      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: colors.textMuted }}>
                        {s.strategyId} | {s.category}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <StrategyBadge status={s.status} />
                      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: colors.textMuted }}>v{s.version}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}

      {/* RISK TAB */}
      {activeTab === 'risk' && profile && (
        <>
          <Card title='Risk Limits' icon={Shield}
            rightAction={
              <span style={{ fontSize: 11, color: colors.textMuted, fontFamily: 'JetBrains Mono, monospace' }}>
                {isUpdating ? 'SAVING...' : `v${profile.version}`}
              </span>
            }>
            <EditableRow label='Max Daily Loss' value={profile.maxDailyLoss ?? 5000} unit='USD' type='currency'
              onSave={handleRiskUpdate('maxDailyLoss', 'currency')} min={0} max={100000} step={100}
              description='Maximum loss allowed before trading halts' />
            <EditableRow label='Max Event Risk' value={profile.maxEventRisk ?? 2500} unit='USD' type='currency'
              onSave={handleRiskUpdate('maxEventRisk', 'currency')} min={0} max={50000} step={50}
              description='Maximum risk per individual event' />
            <EditableRow label='Max Single-Name Exposure' value={profile.maxSingleNameExposure ?? 10} unit='%' type='percent'
              onSave={handleRiskUpdate('maxSingleNameExposure', 'percent')} min={0.5} max={100} step={0.5}
              description='Maximum portfolio allocation to one ticker' />
            <EditableRow label='Max Sector Exposure' value={profile.maxSectorExposure ?? 25} unit='%' type='percent'
              onSave={handleRiskUpdate('maxSectorExposure', 'percent')} min={1} max={100} step={1} />
            <EditableRow label='Max Gross Exposure' value={profile.maxGrossExposure ?? 100} unit='%' type='percent'
              onSave={handleRiskUpdate('maxGrossExposure', 'percent')} min={10} max={200} step={5} />
            <EditableRow label='Max Net Exposure' value={profile.maxNetExposure ?? 100} unit='%' type='percent'
              onSave={handleRiskUpdate('maxNetExposure', 'percent')} min={10} max={200} step={5} />
            <EditableRow label='Max Correlated Exposure' value={profile.maxCorrelatedExposure ?? 20} unit='%' type='percent'
              onSave={handleRiskUpdate('maxCorrelatedExposure', 'percent')} min={0} max={100} step={1}
              description='Maximum exposure to correlated positions' />
            <EditableRow label='Halt on Consecutive Losses' value={profile.haltOnConsecutiveLosses ?? 3} unit='' type='integer'
              onSave={handleRiskUpdate('haltOnConsecutiveLosses', 'integer')} min={1} max={20} step={1}
              description='Auto-halt after this many consecutive losses' />
          </Card>

          <Card title='Risk Profile Presets' icon={Shield}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {['CONSERVATIVE', 'BALANCED', 'AGGRESSIVE'].map((preset) => (
                <button key={preset} style={{
                  padding: '10px 20px', borderRadius: layout.cardRadiusSmall,
                  background: colors.bgSecondary, border: `1px solid ${colors.border}`,
                  color: colors.textSecondary, fontSize: 12, fontWeight: 600,
                  cursor: 'pointer', textTransform: 'uppercase',
                }}>
                  {preset}
                </button>
              ))}
            </div>
          </Card>
        </>
      )}

      {/* STRATEGIES TAB */}
      {activeTab === 'strategies' && (
        <>
          <Card title='Strategy Control' icon={TrendingUp}>
            <SelectRowReactive
              label='Selection Mode'
              value={selectionProfile?.selectionMode ?? 'AUTO'}
              options={['AUTO', 'USER_PREFERRED', 'USER_LOCKED']}
              onSave={handleSelectionModeChange}
              description='AUTO = Router decides. USER_PREFERRED = Favor selected. USER_LOCKED = Only one strategy.'
            />
            {selectionProfile?.selectionMode === 'USER_LOCKED' && (
              <div style={{
                padding: 12, background: `${colors.orange}08`, borderRadius: layout.cardRadiusSmall,
                border: `1px solid ${colors.orange}20`, marginTop: 12,
              }}>
                <p style={{ fontSize: 12, color: colors.orange, margin: 0, fontWeight: 500 }}>
                  LOCKED MODE: The router will ONLY evaluate the selected strategy. If it does not qualify, Requi will return NO TRADE.
                </p>
              </div>
            )}
            <div style={{ marginTop: 16 }}>
              <span style={{ fontSize: 12, color: colors.textMuted, textTransform: 'uppercase' }}>Active Strategy</span>
              <div style={{ marginTop: 8 }}>
                <select style={{
                  width: '100%', padding: '10px 12px', background: colors.bgSecondary,
                  border: `1px solid ${colors.border}`, borderRadius: layout.cardRadiusSmall,
                  color: colors.textPrimary, fontFamily: 'JetBrains Mono, monospace', fontSize: 13,
                }}>
                  <option value=''>Select Strategy...</option>
                  {strategies.map((s: any) => (
                    <option key={s.id} value={s.id}>
                      {s.name} | {s.strategyId} | {s.status} | v{s.version}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </Card>

          <Card title='Strategy Preferences' icon={TrendingUp}>
            {strategies.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: colors.textMuted }}>
                Loading strategies...
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {strategies.map((s: any) => {
                  const pref = preferences?.find((p: any) => p.strategyId === s.id)
                  return (
                    <div key={s.id} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '14px 0', borderBottom: `1px solid ${colors.border}`,
                    }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <span style={{ fontSize: 13, color: colors.textSecondary, fontWeight: 500 }}>{s.name}</span>
                        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: colors.textMuted }}>
                          {s.strategyId} | {s.category}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 11, color: colors.textMuted }}>Enabled</span>
                          <button
                            onClick={() => handleStrategyPreference(s.id, 'enabled')(!pref?.enabled)}
                            style={{
                              width: 36, height: 20, borderRadius: 10,
                              background: pref?.enabled !== false ? colors.green : colors.border,
                              border: 'none', cursor: 'pointer', position: 'relative',
                            }}
                          >
                            <div style={{
                              width: 14, height: 14, borderRadius: 7, background: '#fff',
                              position: 'absolute', top: 3,
                              left: pref?.enabled !== false ? 18 : 4,
                              transition: 'left 150ms ease',
                            }} />
                          </button>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 11, color: colors.textMuted }}>Preferred</span>
                          <button
                            onClick={() => handleStrategyPreference(s.id, 'preferred')(!!pref?.preferred)}
                            style={{
                              width: 36, height: 20, borderRadius: 10,
                              background: pref?.preferred ? colors.blue : colors.border,
                              border: 'none', cursor: 'pointer', position: 'relative',
                            }}
                          >
                            <div style={{
                              width: 14, height: 14, borderRadius: 7, background: '#fff',
                              position: 'absolute', top: 3,
                              left: pref?.preferred ? 18 : 4,
                              transition: 'left 150ms ease',
                            }} />
                          </button>
                        </div>
                        <StrategyBadge status={s.status} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </Card>
        </>
      )}

      {/* PROTECTION TAB */}
      {activeTab === 'protection' && protectionProfile && (
        <>
          <Card title='Synthetic Protection' icon={Lock}
            rightAction={
              <span style={{ fontSize: 11, color: colors.textMuted, fontFamily: 'JetBrains Mono, monospace' }}>
                {isProtectionUpdating ? 'SAVING...' : `v${protectionProfile.version}`}
              </span>
            }>
            <ToggleRow label='Synthetic Stop' value={protectionProfile.syntheticStopEnabled}
              onSave={handleProtectionUpdate('syntheticStopEnabled')}
              description='Monitor stops tick-by-tick without sending market orders' />
            <ToggleRow label='Synthetic Trailing Stop' value={protectionProfile.syntheticTrailEnabled}
              onSave={handleProtectionUpdate('syntheticTrailEnabled')}
              description='Dynamic stop that follows price at trail distance' />
            <SelectRowReactive label='Initial Stop Type' value={protectionProfile.initialStopType ?? 'PERCENTAGE'}
              options={['PERCENTAGE', 'ATR', 'PRICE', 'STRATEGY_DEFAULT']}
              onSave={async () => ({ success: true })} />
            <EditableRow label='Initial Stop Value' value={protectionProfile.initialStopValue ?? 2.0} unit='' type='decimal'
              onSave={handleProtectionUpdate('initialStopValue')} min={0.1} max={50} step={0.1}
              description='Distance for initial hard stop' />
            <SelectRowReactive label='Trail Type' value={protectionProfile.trailType ?? 'PERCENTAGE'}
              options={['PERCENTAGE', 'ATR', 'PRICE', 'DYNAMIC_APMA']}
              onSave={async () => ({ success: true })} />
            <EditableRow label='Trail Value' value={protectionProfile.trailValue ?? 1.5} unit='' type='decimal'
              onSave={handleProtectionUpdate('trailValue')} min={0.1} max={20} step={0.1} />
            <EditableRow label='ATR Multiplier' value={protectionProfile.atrMultiplier ?? 2.0} unit='x' type='decimal'
              onSave={handleProtectionUpdate('atrMultiplier')} min={0.5} max={10} step={0.1} />
            <EditableRow label='Minimum Protection Distance' value={protectionProfile.minimumProtectionDistance ?? 0.10} unit='$' type='currency'
              onSave={handleProtectionUpdate('minimumProtectionDistance')} min={0.01} max={5} step={0.01} />
            <ToggleRow label='Reprice on Trigger' value={protectionProfile.repriceEnabled}
              onSave={handleProtectionUpdate('repriceEnabled')}
              description='Attempt to reprice limit orders when protection triggers' />
            <ToggleRow label='APMA Enabled' value={protectionProfile.apmaEnabled}
              onSave={handleProtectionUpdate('apmaEnabled')}
              description='Adaptive Position Management Agent active' />
          </Card>
        </>
      )}

      {/* HISTORY TAB */}
      {activeTab === 'history' && (
        <Card title='Configuration History' icon={History}>
          {configEvents.length === 0 ? (
            <div style={{ padding: 20, textAlign: 'center', color: colors.textMuted, fontSize: 13 }}>
              No configuration changes recorded yet.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {configEvents.map((evt: any) => (
                <div key={evt.id} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                  padding: '12px 0', borderBottom: `1px solid ${colors.border}`,
                }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <span style={{ fontSize: 12, color: colors.textSecondary, fontWeight: 500 }}>
                      {evt.configurationType}
                    </span>
                    <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: colors.textMuted }}>
                      {evt.settingKey}
                    </span>
                    {evt.reason && <span style={{ fontSize: 10, color: colors.textMuted }}>{evt.reason}</span>}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
                    <StatusBadge state={evt.status} />
                    <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: colors.textMuted }}>
                      {new Date(evt.timestamp).toLocaleString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* NOTIFICATIONS TAB */}
      {activeTab === 'notifications' && (
        <Card title='Notification Preferences' icon={Bell}>
          <ToggleRow label='Strategy Selected' value={true} onSave={async () => ({ success: true })} />
          <ToggleRow label='Order Submitted' value={true} onSave={async () => ({ success: true })} />
          <ToggleRow label='Order Filled' value={true} onSave={async () => ({ success: true })} />
          <ToggleRow label='Position Opened' value={true} onSave={async () => ({ success: true })} />
          <ToggleRow label='Protection Triggered' value={true} onSave={async () => ({ success: true })} />
          <ToggleRow label='APMA Tightened' value={false} onSave={async () => ({ success: true })} />
          <ToggleRow label='Position Exited' value={true} onSave={async () => ({ success: true })} />
          <ToggleRow label='Risk Warning' value={true} onSave={async () => ({ success: true })} />
          <ToggleRow label='Risk Block' value={true} onSave={async () => ({ success: true })} />
          <ToggleRow label='Strategy Suspended' value={true} onSave={async () => ({ success: true })} />
          <ToggleRow label='Kill Switch' value={true} onSave={async () => ({ success: true })} />
        </Card>
      )}

      {/* CHARTS TAB */}
      {activeTab === 'charts' && (
        <Card title='Chart Preferences' icon={BarChart3}>
          <ToggleRow label='Show Volume' value={true} onSave={async () => ({ success: true })} />
          <ToggleRow label='Show VWAP' value={true} onSave={async () => ({ success: true })} />
          <ToggleRow label='EMA 9' value={true} onSave={async () => ({ success: true })} />
          <ToggleRow label='EMA 20' value={true} onSave={async () => ({ success: true })} />
          <ToggleRow label='EMA 50' value={false} onSave={async () => ({ success: true })} />
          <ToggleRow label='Order Markers' value={true} onSave={async () => ({ success: true })} />
          <ToggleRow label='Position Overlay' value={true} onSave={async () => ({ success: true })} />
          <ToggleRow label='Synthetic Stop Line' value={true} onSave={async () => ({ success: true })} />
          <ToggleRow label='Trailing Floor' value={true} onSave={async () => ({ success: true })} />
          <ToggleRow label='APMA Markers' value={true} onSave={async () => ({ success: true })} />
          <ToggleRow label='Earnings Markers' value={true} onSave={async () => ({ success: true })} />
        </Card>
      )}

      {/* LEGAL TAB */}
      {activeTab === 'legal' && (
        <LegalComplianceTab />
      )}

      {/* APMA Settings - show on all tabs as a footer */}
      <Card title='APMA Settings' icon={Activity}>
        {apmaConfig.map((apma: any) => (
          <div key={apma.action} style={{
            marginBottom: 12, padding: 14, background: colors.bgSecondary,
            borderRadius: layout.cardRadiusSmall, border: `1px solid ${colors.border}`,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 14, fontWeight: 600, color: apma.color }}>{apma.action}</span>
            </div>
            <p style={{ fontSize: 12, color: colors.textSecondary, margin: '0 0 6px 0' }}>{apma.desc}</p>
            <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: colors.textMuted, margin: 0 }}>Trigger: {apma.trigger}</p>
          </div>
        ))}
      </Card>

      <Card title='Kill Switch' icon={AlertTriangle}>
        <p style={{ fontSize: 13, color: colors.textMuted, lineHeight: 1.6, margin: '0 0 16px 0' }}>
          The kill switch is armed by default. When triggered, it immediately halts all trading activity, cancels all open orders, and flattens all positions.
          Requires two taps to disarm. One tap arms.
          <span style={{ color: colors.red, fontWeight: 600 }}> The system defaults to ARMED on every restart.</span>
        </p>
        <div style={{ padding: 16, background: `${colors.red}08`, borderRadius: layout.cardRadiusSmall, border: `1px solid ${colors.red}15` }}>
          <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 14, color: colors.red, fontWeight: 600, margin: 0 }}>ARMED</p>
          <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: colors.textMuted, margin: '4px 0 0 0' }}>System is active and monitoring</p>
        </div>
      </Card>
    </div>
  )
}
