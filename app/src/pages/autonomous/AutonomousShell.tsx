import { useState, useEffect } from 'react'
import {
  Activity, Radio, Zap, Layers, TrendingUp, DollarSign, Shield,
  Clock, Database, History, Settings, Menu, X, ChevronRight,
  Play, Pause, Square, Wifi, Server, Cpu,
  Search, Bell, ChevronDown, User, Scale
} from 'lucide-react'
import { colors, layout, anim } from './design'
import { trpc } from '@/providers/trpc'
import DisclosureModal from './legal/DisclosureModal'
import PreStartAuth from './legal/PreStartAuth'
import OverviewTab from './OverviewTab'
import EventsTab from './EventsTab'
import ReactionTab from './ReactionTab'
import OrdersTab from './OrdersTab'
import PositionsTab from './PositionsTab'
import FinancialsTab from './FinancialsTab'
import RiskTab from './RiskTab'
import LatencyTab from './LatencyTab'
import DataFeedsTab from './DataFeedsTab'
import AuditReplayTab from './AuditReplayTab'
import SettingsTab from './SettingsTab'

const navItems = [
  { id: 'overview', label: 'Overview', icon: Activity },
  { id: 'events', label: 'Events', icon: Radio },
  { id: 'reaction', label: 'Reaction', icon: Zap },
  { id: 'orders', label: 'Orders', icon: Layers },
  { id: 'positions', label: 'Positions', icon: TrendingUp },
  { id: 'financials', label: 'Financials', icon: DollarSign },
  { id: 'risk', label: 'Risk', icon: Shield },
  { id: 'latency', label: 'Latency', icon: Clock },
  { id: 'data', label: 'Data Feeds', icon: Database },
  { id: 'audit', label: 'Audit', icon: History },
  { id: 'settings', label: 'Settings', icon: Settings },
]

const mobilePrimaryTabs = ['overview', 'events', 'orders', 'positions', 'more']
const mobileMoreItems = ['reaction', 'financials', 'risk', 'latency', 'data', 'audit', 'settings']

function getModeColor(mode: string) {
  switch (mode) {
    case 'SHADOW': return colors.chipGray
    case 'PAPER': return colors.chipOrange
    case 'LIVE': return colors.chipBlue
    default: return colors.chipGray
  }
}

function getEngineColor(status: string) {
  switch (status) {
    case 'RUNNING': return colors.chipGreen
    case 'PAUSED': return colors.chipOrange
    case 'TRIGGERED': return colors.chipRed
    default: return colors.chipGray
  }
}

function getConnectionColor(status: string) {
  switch (status) {
    case 'CONNECTED': return colors.chipGreen
    case 'CONNECTING': return colors.chipOrange
    case 'DISCONNECTED': return colors.chipRed
    default: return colors.chipGray
  }
}

function getDataColor(status: string) {
  switch (status) {
    case 'LIVE': return colors.chipGreen
    case 'DELAYED': return colors.chipOrange
    case 'STALE': return colors.chipRed
    default: return colors.chipGray
  }
}

function StatusPill({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '4px 10px',
      background: `${color}10`,
      borderRadius: layout.pillRadius,
      border: `1px solid ${color}20`,
    }}>
      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, fontWeight: 600, color }}>{value}</span>
    </div>
  )
}

type AutonomousShellProps = {
  /** One screen (Overview only), no section sidebar. */
  singleScreen?: boolean
  /** Render inside AppLayout main area (not full viewport). */
  embedded?: boolean
}

export default function AutonomousShell({ singleScreen = false, embedded = true }: AutonomousShellProps) {
  const [activeTab, setActiveTab] = useState('overview')
  const [isMobile, setIsMobile] = useState(false)
  const [isTablet, setIsTablet] = useState(false)
  const [sidebarExpanded, setSidebarExpanded] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false)
  const [globalSearch, setGlobalSearch] = useState('')
  const [portfolioOpen, setPortfolioOpen] = useState(false)

  // Legal / Compliance Gate State
  const [showDisclosure, setShowDisclosure] = useState(false)
  const [showPreStartAuth, setShowPreStartAuth] = useState(false)
  const [isFirstAcceptance, setIsFirstAcceptance] = useState(false)
  const [gateStatus, setGateStatus] = useState({
    eligible: false,
    pendingDocuments: 0,
    pendingReconsents: 0,
    hasBrokerAuthorization: false,
    hasElectronicConsent: false,
    gateFailedReasons: [] as string[],
  })
  const [hasAcceptedOnce, setHasAcceptedOnce] = useState(false)
  const [disclosureAccepted, setDisclosureAccepted] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const utils = trpc.useUtils()
  const { data: autoState } = trpc.autonomous.state.useQuery(undefined, { refetchInterval: 4000 })
  const { data: ibkrStatus } = trpc.trading.ibkrStatus.useQuery(undefined, { refetchInterval: 10000 })
  const startMut = trpc.autonomous.start.useMutation({
    onSuccess: async () => {
      setShowPreStartAuth(false)
      setActionError(null)
      await utils.autonomous.state.invalidate()
    },
    onError: (err) => setActionError(err.message),
  })
  const pauseMut = trpc.autonomous.pause.useMutation({
    onSuccess: () => utils.autonomous.state.invalidate(),
    onError: (err) => setActionError(err.message),
  })
  const stopMut = trpc.autonomous.emergencyStop.useMutation({
    onSuccess: () => utils.autonomous.state.invalidate(),
    onError: (err) => setActionError(err.message),
  })
  const releaseMut = trpc.autonomous.releaseKillSwitch.useMutation({
    onSuccess: () => {
      setActionError(null)
      utils.autonomous.state.invalidate()
    },
    onError: (err) => setActionError(err.message),
  })

  const sessionStatus = autoState?.session?.status ?? null
  const engineRunning = sessionStatus === 'RUNNING'
  const engineLabel = !sessionStatus
    ? 'IDLE'
    : sessionStatus === 'RUNNING'
      ? 'RUNNING'
      : sessionStatus === 'PAUSED'
        ? 'PAUSED'
        : sessionStatus === 'BROKER_DISCONNECTED'
          ? 'IBKR DOWN'
          : sessionStatus === 'ERROR'
            ? 'ERROR'
            : sessionStatus === 'STOPPED'
              ? 'STOPPED'
              : String(sessionStatus)
  // Hide probe/debug leftovers and empty strings — only surface real session faults.
  const rawSessionError = autoState?.session?.lastError ?? null
  const sessionError =
    rawSessionError &&
    !/^PROBE_/i.test(rawSessionError) &&
    rawSessionError.trim().length > 0
      ? rawSessionError
      : null
  const killSwitchArmed = autoState ? !autoState.killSwitch : true
  const modeLabel = autoState?.config?.mode ?? 'PAPER'
  const dataStatusLabel = !ibkrStatus
    ? '…'
    : ibkrStatus.gatewayOk && ibkrStatus.connectedForUser
      ? 'LIVE'
      : ibkrStatus.gatewayOk
        ? 'GATEWAY'
        : 'OFFLINE'
  const accountLabel = (() => {
    const id = ibkrStatus?.accountId ?? autoState?.account?.label
    const equity = Number(ibkrStatus?.equity || autoState?.account?.equity || 0)
    const cash = Number(ibkrStatus?.cash || 0)
    if (!id && equity <= 0) return null
    const name = ibkrStatus?.accountId
      ? `Interactive Brokers Paper (${ibkrStatus.accountId})`
      : String(autoState?.account?.label ?? 'IBKR Paper')
    const parts = [`${name}`]
    if (equity > 0) parts.push(`Equity $${equity.toLocaleString('en-US', { maximumFractionDigits: 0 })}`)
    if (cash > 0) parts.push(`Cash $${cash.toLocaleString('en-US', { maximumFractionDigits: 0 })}`)
    return parts.join(' · ')
  })()
  const ibkrLabel = !ibkrStatus
    ? '…'
    : ibkrStatus.connectedForUser && ibkrStatus.gatewayOk
      ? 'PAPER'
      : ibkrStatus.gatewayOk
        ? 'READY'
        : ibkrStatus.configured
          ? 'LOGIN'
          : 'OFF'
  const ibkrConn = ibkrStatus?.connectedForUser && ibkrStatus.gatewayOk
    ? 'CONNECTED'
    : ibkrStatus?.configured
      ? 'CONNECTING'
      : 'DISCONNECTED'

  useEffect(() => {
    const check = () => {
      const w = window.innerWidth
      setIsMobile(w < 768)
      setIsTablet(w >= 768 && w < 1200)
    }
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const sidebarW = sidebarExpanded && !isTablet ? layout.sidebarWidthExpanded : layout.sidebarWidth
  const topBarH = isMobile ? layout.mobileTopHeight : layout.topBarHeight

  const modeColor = getModeColor(modeLabel)
  const engineColor = getEngineColor(
    engineRunning ? 'RUNNING' : sessionStatus === 'BROKER_DISCONNECTED' || sessionStatus === 'ERROR' ? 'ERROR' : 'PAUSED',
  )
  const ibkrColor = getConnectionColor(ibkrConn)
  const dataColor = getDataColor(
    dataStatusLabel === 'LIVE' ? 'CONNECTED' : dataStatusLabel === 'GATEWAY' ? 'DEGRADED' : 'DISCONNECTED',
  )

  const handleKillSwitch = () => {
    if (!killSwitchArmed) {
      releaseMut.mutate({ confirm: 'RELEASE' })
      return
    }
    if (!window.confirm('Engage emergency stop? Autonomous cannot start again until you release the kill switch.')) return
    setDisclosureAccepted(false)
    stopMut.mutate({ confirm: 'STOP' })
  }

  const checkGateStatus = async () => {
    // Simulated gate check — in production: trpc.autonomous.checkStartEligibility.useQuery
    const isFirst = !hasAcceptedOnce
    setIsFirstAcceptance(isFirst)
    const status = {
      eligible: true,
      pendingDocuments: 0,
      pendingReconsents: 0,
      hasBrokerAuthorization: true,
      hasElectronicConsent: true,
      gateFailedReasons: [] as string[],
    }
    setGateStatus(status)
    return status
  }

  /** Client feedback: no PreStart / type-START confirmation for Autonomous events — start directly. */
  const handleStartRequest = async () => {
    if (!killSwitchArmed) return
    await checkGateStatus()
    setHasAcceptedOnce(true)
    setDisclosureAccepted(true)
    setShowDisclosure(false)
    setShowPreStartAuth(false)
    setActionError(null)
    startMut.mutate()
  }

  const handleDisclosureAccept = (acceptance: { allChecked: boolean; disclosures: Record<string, boolean>; firstTime: boolean; timestamp: number }) => {
    setShowDisclosure(false)
    setHasAcceptedOnce(true)
    setDisclosureAccepted(true)
    console.log('[COMPLIANCE] Disclosures accepted:', acceptance)
    setGateStatus(prev => ({ ...prev, eligible: true, pendingDocuments: 0, gateFailedReasons: [] }))
    // No second confirmation modal — start immediately after disclosure accept.
    setActionError(null)
    startMut.mutate()
  }

  const handlePreStartConfirm = () => {
    setShowPreStartAuth(false)
    setActionError(null)
    startMut.mutate()
  }

  const toggleEngine = () => {
    if (!killSwitchArmed) return
    if (engineRunning) {
      pauseMut.mutate()
    } else {
      void handleStartRequest()
    }
  }

  const renderTab = () => {
    if (singleScreen) return <OverviewTab />
    switch (activeTab) {
      case 'overview': return <OverviewTab />
      case 'events': return <EventsTab />
      case 'reaction': return <ReactionTab />
      case 'orders': return <OrdersTab />
      case 'positions': return <PositionsTab />
      case 'financials': return <FinancialsTab />
      case 'risk': return <RiskTab />
      case 'latency': return <LatencyTab />
      case 'data': return <DataFeedsTab />
      case 'audit': return <AuditReplayTab />
      case 'settings': return <SettingsTab />
      default: return <OverviewTab />
    }
  }

  const shellHeight = embedded ? 'min(100%, calc(100vh - 8rem))' : '100vh'
  const shellWidth = embedded ? '100%' : '100vw'

  return (
    <div style={{
      display: 'flex',
      width: shellWidth,
      height: embedded ? shellHeight : '100vh',
      minHeight: embedded ? 'calc(100vh - 8rem)' : undefined,
      background: colors.bgBase,
      overflow: 'hidden',
      borderRadius: embedded ? layout.cardRadius : 0,
      border: embedded ? `1px solid ${colors.border}` : 'none',
      boxShadow: embedded ? '0 1px 3px rgba(15, 23, 42, 0.06)' : 'none',
    }}>
      {/* Sidebar - Desktop / Tablet */}
      {!singleScreen && !isMobile && (
        <div style={{
          width: sidebarW,
          minWidth: sidebarW,
          height: '100%',
          background: colors.bgSidebar,
          borderRight: `1px solid ${colors.border}`,
          display: 'flex',
          flexDirection: 'column',
          zIndex: 100,
          transition: `width ${anim.normal}ms ease`,
        }}
          onMouseEnter={() => !isTablet && setSidebarExpanded(true)}
          onMouseLeave={() => setSidebarExpanded(false)}
        >
          {/* Logo */}
          <div style={{ padding: '20px 16px', borderBottom: `1px solid ${colors.border}`, display: 'flex', alignItems: 'center', gap: 10, justifyContent: sidebarExpanded ? 'flex-start' : 'center' }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: `linear-gradient(135deg, ${colors.purple}, ${colors.violet})`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Cpu size={20} color='#fff' strokeWidth={2.5} />
            </div>
            {sidebarExpanded && (
              <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 15, fontWeight: 700, color: colors.textPrimary, letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>REQUI</span>
            )}
          </div>

          {/* Nav Items */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 10px' }}>
            {navItems.map((item) => {
              const isActive = activeTab === item.id
              const Icon = item.icon
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  title={item.label}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: sidebarExpanded ? 12 : 0,
                    padding: '11px 0',
                    marginBottom: 4,
                    borderRadius: layout.cardRadiusSmall,
                    background: isActive ? colors.activePurpleBg : 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    transition: `all ${anim.normal}ms ease`,
                    justifyContent: sidebarExpanded ? 'flex-start' : 'center',
                    position: 'relative',
                  }}
                >
                  {isActive && (
                    <div style={{
                      position: 'absolute',
                      left: 0,
                      top: 8,
                      bottom: 8,
                      width: 3,
                      background: colors.purple,
                      borderRadius: '0 3px 3px 0',
                    }} />
                  )}
                  <Icon size={20} color={isActive ? colors.purple : colors.textMuted} strokeWidth={isActive ? 2.5 : 1.5} />
                  {sidebarExpanded && (
                    <span style={{ fontSize: 13, fontWeight: isActive ? 500 : 400, color: isActive ? colors.textPrimary : colors.textSecondary, transition: `color ${anim.normal}ms ease`, whiteSpace: 'nowrap' }}>
                      {item.label}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {/* Bottom status */}
          <div style={{ padding: '12px 16px', borderTop: `1px solid ${colors.border}`, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: sidebarExpanded ? 'flex-start' : 'center' }}>
              <Wifi size={13} color={ibkrColor} />
              {sidebarExpanded && <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: ibkrColor, fontWeight: 500 }}>IBKR {ibkrLabel}</span>}
            </div>
            {sidebarExpanded && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Server size={13} color={dataColor} />
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: dataColor, fontWeight: 500 }}>{dataStatusLabel}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Top System Bar */}
        <div style={{
          height: topBarH,
          background: colors.bgTopBar,
          borderBottom: `1px solid ${colors.border}`,
          display: 'flex',
          alignItems: 'center',
          padding: isMobile ? '0 16px' : '0 24px',
          gap: 16,
          flexShrink: 0,
        }}>
          {/* Mobile hamburger */}
          {!singleScreen && isMobile && (
            <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
              {mobileMenuOpen ? <X size={22} color={colors.textPrimary} /> : <Menu size={22} color={colors.textPrimary} />}
            </button>
          )}

          {/* Portfolio Selector — live IBKR Paper account only (no fake portfolios) */}
          {!isMobile && (
            <div style={{ position: 'relative' }}>
              <button onClick={() => setPortfolioOpen(!portfolioOpen)} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 14px',
                background: colors.bgElevated,
                border: `1px solid ${colors.borderLight}`,
                borderRadius: layout.cardRadiusControl,
                color: colors.textPrimary,
                fontSize: 13, fontWeight: 500,
                cursor: 'pointer',
              }}>
                <span>
                  {ibkrStatus?.accountId
                    ? `IBKR Paper · ${ibkrStatus.accountId}`
                    : 'Autonomous Console'}
                </span>
                <ChevronDown size={14} color={colors.textMuted} />
              </button>
              {portfolioOpen && (
                <div style={{
                  position: 'absolute', top: 44, left: 0,
                  background: colors.bgElevated, border: `1px solid ${colors.borderLight}`,
                  borderRadius: layout.cardRadiusSmall, padding: '10px 14px',
                  minWidth: 260, zIndex: 300,
                  boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: 11,
                  color: colors.textSecondary,
                }}>
                  <div style={{ color: colors.textPrimary, marginBottom: 6 }}>Active trading account</div>
                  <div>
                    {ibkrStatus?.accountId
                      ? `Interactive Brokers Paper (${ibkrStatus.accountId})`
                      : 'No IBKR Paper account linked — connect on Accounts'}
                  </div>
                  {ibkrStatus?.cash != null && ibkrStatus.cash > 0 && (
                    <div style={{ marginTop: 8, color: colors.textMuted }}>
                      Equity ${Number(ibkrStatus.equity || 0).toLocaleString()} · Cash ${Number(ibkrStatus.cash).toLocaleString()}
                    </div>
                  )}
                  <button
                    type='button'
                    onClick={() => setPortfolioOpen(false)}
                    style={{
                      marginTop: 10, padding: '6px 10px', background: colors.bgSecondary,
                      border: `1px solid ${colors.border}`, borderRadius: 6,
                      color: colors.textSecondary, cursor: 'pointer', fontSize: 10,
                      fontFamily: 'inherit',
                    }}
                  >
                    Close
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Page title - mobile only */}
          {isMobile && (
            <h1 style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 15, fontWeight: 600, color: colors.textPrimary, margin: 0, whiteSpace: 'nowrap' }}>
              Autonomous Engine
            </h1>
          )}

          {/* Search */}
          {!isMobile && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, maxWidth: 320 }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 14px', background: colors.bgElevated,
                border: `1px solid ${colors.border}`, borderRadius: layout.cardRadiusControl,
                flex: 1,
              }}>
                <Search size={14} color={colors.textMuted} />
                <input
                  value={globalSearch}
                  onChange={(e) => setGlobalSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter') return
                    const q = globalSearch.trim()
                    if (!q) return
                    try { sessionStorage.setItem('autonomous.globalSearch', q) } catch { /* ignore */ }
                    // Route: ticker-like → Positions; otherwise Orders/Events.
                    if (/^[A-Za-z.]{1,6}$/.test(q)) setActiveTab('positions')
                    else setActiveTab('orders')
                  }}
                  placeholder='Search ticker… (Enter)'
                  style={{ background: 'transparent', border: 'none', color: colors.textSecondary, fontSize: 12, outline: 'none', width: '100%', fontFamily: 'inherit' }}
                />
              </div>
            </div>
          )}

          {/* Status pills */}
          {!isMobile && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <StatusPill label='MODE' value={modeLabel} color={modeColor} />
              <StatusPill label='ENGINE' value={engineLabel} color={engineColor} />
              <StatusPill label='IBKR' value={ibkrLabel} color={ibkrColor} />
            </div>
          )}

          {/* Engine controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
            <button
              onClick={toggleEngine}
              disabled={!killSwitchArmed || startMut.isPending || pauseMut.isPending}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '6px 12px',
                background: engineRunning ? `${colors.chipOrange}12` : `${colors.chipGreen}12`,
                border: `1px solid ${engineRunning ? colors.chipOrange : colors.chipGreen}`,
                borderRadius: layout.cardRadiusControl,
                color: engineRunning ? colors.chipOrange : colors.chipGreen,
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 10, fontWeight: 600,
                cursor: killSwitchArmed ? 'pointer' : 'not-allowed',
                opacity: killSwitchArmed ? 1 : 0.4,
              }}
            >
              {engineRunning ? <Pause size={12} /> : <Play size={12} />}
              {engineRunning ? 'PAUSE' : 'START'}
            </button>
            <button
              onClick={handleKillSwitch}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '6px 12px',
                background: killSwitchArmed ? `${colors.chipRed}12` : colors.bgElevated,
                border: `1px solid ${killSwitchArmed ? colors.chipRed : colors.border}`,
                borderRadius: layout.cardRadiusControl,
                color: killSwitchArmed ? colors.chipRed : colors.textMuted,
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 10, fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <Square size={12} fill={killSwitchArmed ? colors.chipRed : 'none'} />
              {killSwitchArmed ? 'KILL' : 'RELEASE'}
            </button>
            {!isMobile && (
              <>
                <div style={{ width: 1, height: 24, background: colors.border, margin: '0 4px' }} />
                <button
                  type='button'
                  title='Open Audit'
                  onClick={() => setActiveTab('audit')}
                  style={{ padding: 8, background: 'transparent', border: 'none', cursor: 'pointer', position: 'relative' }}
                >
                  <Bell size={18} color={colors.textMuted} strokeWidth={1.5} />
                </button>
                <button
                  type='button'
                  title='Open Settings'
                  onClick={() => setActiveTab('settings')}
                  style={{ width: 32, height: 32, borderRadius: 10, background: `linear-gradient(135deg, ${colors.purple}40, ${colors.violet}60)`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', border: 'none', padding: 0 }}
                >
                  <User size={16} color={colors.purpleSoft} />
                </button>
              </>
            )}
          </div>
        </div>

        {/* Mobile status bar */}
        {isMobile && (
          <div style={{ padding: '8px 16px', borderBottom: `1px solid ${colors.border}`, display: 'flex', gap: 8, overflowX: 'auto' }}>
            <StatusPill label='MODE' value={modeLabel} color={modeColor} />
            <StatusPill label='ENGINE' value={engineLabel} color={engineColor} />
            <StatusPill label='IBKR' value={ibkrLabel} color={ibkrColor} />
            <StatusPill label='DATA' value={dataStatusLabel} color={dataColor} />
          </div>
        )}

        {/* Mobile full nav overlay */}
        {!singleScreen && isMobile && mobileMenuOpen && (
          <div style={{
            position: 'fixed',
            top: topBarH,
            left: 0, right: 0, bottom: 0,
            background: colors.bgBase,
            zIndex: 200, padding: 16,
            overflowY: 'auto',
          }}>
            {navItems.map((item) => {
              const isActive = activeTab === item.id
              const Icon = item.icon
              return (
                <button
                  key={item.id}
                  onClick={() => { setActiveTab(item.id); setMobileMenuOpen(false) }}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                    padding: '14px 16px', marginBottom: 4,
                    borderRadius: layout.cardRadiusSmall,
                    background: isActive ? colors.activePurpleBg : 'transparent',
                    border: 'none', cursor: 'pointer',
                  }}
                >
                  <Icon size={20} color={isActive ? colors.purple : colors.textMuted} />
                  <span style={{ fontSize: 15, fontWeight: isActive ? 500 : 400, color: isActive ? colors.textPrimary : colors.textSecondary }}>{item.label}</span>
                  {isActive && <ChevronRight size={16} color={colors.purple} style={{ marginLeft: 'auto' }} />}
                </button>
              )
            })}
          </div>
        )}

        {/* Main scrollable content */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: isMobile ? '16px' : '24px',
          paddingBottom: isMobile && !singleScreen ? `${layout.mobileBottomNav + 16}px` : '24px',
        }}>
          {(actionError || sessionError || accountLabel) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
              {accountLabel && (
                <div style={{
                  padding: '10px 14px',
                  background: `${colors.chipBlue}12`,
                  border: `1px solid ${colors.chipBlue}40`,
                  borderRadius: layout.cardRadiusSmall,
                  color: colors.textPrimary,
                  fontSize: 12,
                  fontFamily: 'JetBrains Mono, monospace',
                }}>
                  Trading account: {accountLabel}
                </div>
              )}
              {actionError && (
                <div style={{
                  padding: '10px 14px',
                  background: `${colors.chipRed}12`,
                  border: `1px solid ${colors.chipRed}40`,
                  borderRadius: layout.cardRadiusSmall,
                  color: colors.chipRed,
                  fontSize: 12,
                }}>
                  {actionError}
                </div>
              )}
              {sessionError && (
                <div style={{
                  padding: '10px 14px',
                  background: `${colors.chipOrange}12`,
                  border: `1px solid ${colors.chipOrange}40`,
                  borderRadius: layout.cardRadiusSmall,
                  color: colors.chipOrange,
                  fontSize: 12,
                }}>
                  Session: {sessionError}
                </div>
              )}
            </div>
          )}
          {renderTab()}
        </div>

        {/* Mobile Bottom Nav */}
        {!singleScreen && isMobile && (
          <div style={{
            position: 'fixed', bottom: 0, left: 0, right: 0,
            height: layout.mobileBottomNav,
            background: colors.bgSidebar,
            borderTop: `1px solid ${colors.border}`,
            display: 'flex', justifyContent: 'space-around', alignItems: 'center',
            zIndex: 150, padding: '0 8px',
          }}>
            {mobilePrimaryTabs.map((tabId) => {
              if (tabId === 'more') {
                return (
                  <button
                    key='more'
                    onClick={() => setMobileMoreOpen(!mobileMoreOpen)}
                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer' }}
                  >
                    <div style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                        <div style={{ width: 4, height: 4, borderRadius: 1, background: mobileMoreOpen ? colors.purple : colors.textMuted }} />
                        <div style={{ width: 4, height: 4, borderRadius: 1, background: mobileMoreOpen ? colors.purple : colors.textMuted }} />
                        <div style={{ width: 4, height: 4, borderRadius: 1, background: mobileMoreOpen ? colors.purple : colors.textMuted }} />
                        <div style={{ width: 4, height: 4, borderRadius: 1, background: mobileMoreOpen ? colors.purple : colors.textMuted }} />
                      </div>
                    </div>
                    <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: mobileMoreOpen ? colors.purple : colors.textMuted, fontWeight: 500 }}>More</span>
                  </button>
                )
              }
              const item = navItems.find((n) => n.id === tabId)
              if (!item) return null
              const isActive = activeTab === tabId
              const Icon = item.icon
              return (
                <button
                  key={tabId}
                  onClick={() => { setActiveTab(tabId); setMobileMoreOpen(false) }}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer', position: 'relative' }}
                >
                  {isActive && (
                    <div style={{ position: 'absolute', top: 0, width: 28, height: 2, background: colors.purple, borderRadius: '0 0 2px 2px' }} />
                  )}
                  <Icon size={22} color={isActive ? colors.purple : colors.textMuted} strokeWidth={isActive ? 2.5 : 1.5} />
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: isActive ? colors.purple : colors.textMuted, fontWeight: isActive ? 600 : 400 }}>{item.label}</span>
                </button>
              )
            })}

            {mobileMoreOpen && (
              <div style={{
                position: 'absolute', bottom: layout.mobileBottomNav, right: 8,
                background: colors.bgPanel, border: `1px solid ${colors.border}`,
                borderRadius: layout.cardRadiusSmall, padding: '8px 0',
                minWidth: 180, boxShadow: '0 -4px 20px rgba(0,0,0,0.5)',
              }}>
                {mobileMoreItems.map((itemId) => {
                  const item = navItems.find((n) => n.id === itemId)
                  if (!item) return null
                  const isActive = activeTab === itemId
                  const Icon = item.icon
                  return (
                    <button
                      key={itemId}
                      onClick={() => { setActiveTab(itemId); setMobileMoreOpen(false) }}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                        padding: '10px 16px', background: isActive ? colors.activePurpleBg : 'transparent',
                        border: 'none', cursor: 'pointer',
                      }}
                    >
                      <Icon size={18} color={isActive ? colors.purple : colors.textMuted} />
                      <span style={{ fontSize: 13, color: isActive ? colors.textPrimary : colors.textSecondary, fontWeight: isActive ? 500 : 400 }}>{item.label}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Legal / Compliance Modals */}
      <DisclosureModal
        isOpen={showDisclosure}
        onClose={() => setShowDisclosure(false)}
        onAccept={handleDisclosureAccept}
        firstTime={isFirstAcceptance}
      />
      <PreStartAuth
        isOpen={showPreStartAuth}
        onClose={() => setShowPreStartAuth(false)}
        onConfirm={handlePreStartConfirm}
        gateStatus={gateStatus}
        environment={ibkrStatus?.connectedForUser ? 'IBKR Paper' : modeLabel}
      />
    </div>
  )
}
