import { useState, useEffect } from 'react'
import {
  Activity, Radio, Zap, Layers, TrendingUp, DollarSign, Shield,
  Clock, Database, History, Settings, Menu, X, ChevronRight,
  Play, Pause, Square, Wifi, Server, Cpu,
  Search, Bell, ChevronDown, User, Scale
} from 'lucide-react'
import { colors, layout, anim } from './design'
import { engineConfig } from './autonomous.config'
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
  const [engineRunning, setEngineRunning] = useState(engineConfig.killSwitch !== 'TRIGGERED')
  const [killSwitchArmed, setKillSwitchArmed] = useState(true)
  const [isMobile, setIsMobile] = useState(false)
  const [isTablet, setIsTablet] = useState(false)
  const [sidebarExpanded, setSidebarExpanded] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false)
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

  const modeColor = getModeColor(engineConfig.mode)
  const engineColor = getEngineColor(engineRunning ? 'RUNNING' : 'PAUSED')
  const ibkrColor = getConnectionColor(engineConfig.ibkrConnection)
  const dataColor = getDataColor(engineConfig.dataStatus)

  const handleKillSwitch = () => {
    setKillSwitchArmed(false)
    setEngineRunning(false)
    setDisclosureAccepted(false)
    // Record kill event
    console.log('[COMPLIANCE] Kill switch triggered')
  }

  const checkGateStatus = async () => {
    // Simulated gate check — in production: trpc.autonomous.checkStartEligibility.useQuery
    // For demo: assume first-time user needs disclosures
    const isFirst = !hasAcceptedOnce
    setIsFirstAcceptance(isFirst)
    const status = {
      eligible: hasAcceptedOnce && disclosureAccepted,
      pendingDocuments: isFirst ? 7 : 0,
      pendingReconsents: 0,
      hasBrokerAuthorization: true,
      hasElectronicConsent: true,
      gateFailedReasons: isFirst ? ['PENDING_LEGAL_DOCUMENTS'] as string[] : [],
    }
    setGateStatus(status)
    return status
  }

  const handleStartRequest = async () => {
    if (!killSwitchArmed) return
    const status = await checkGateStatus()
    if (!status.eligible) {
      if (!hasAcceptedOnce) {
        setShowDisclosure(true)
      } else {
        setShowPreStartAuth(true)
      }
    } else {
      setShowPreStartAuth(true)
    }
  }

  const handleDisclosureAccept = (acceptance: { allChecked: boolean; disclosures: Record<string, boolean>; firstTime: boolean; timestamp: number }) => {
    setShowDisclosure(false)
    setHasAcceptedOnce(true)
    setDisclosureAccepted(true)
    // Record acceptance events
    console.log('[COMPLIANCE] Disclosures accepted:', acceptance)
    // Show pre-start auth after first acceptance
    setGateStatus(prev => ({ ...prev, eligible: true, pendingDocuments: 0, gateFailedReasons: [] }))
    setShowPreStartAuth(true)
  }

  const handlePreStartConfirm = () => {
    setShowPreStartAuth(false)
    setEngineRunning(true)
    // Record start event
    console.log('[COMPLIANCE] Engine start authorized')
  }

  const toggleEngine = () => {
    if (!killSwitchArmed) return
    if (engineRunning) {
      // Pause doesn't need gate
      setEngineRunning(false)
    } else {
      handleStartRequest()
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
              {sidebarExpanded && <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: ibkrColor, fontWeight: 500 }}>IBKR {engineConfig.ibkrConnection}</span>}
            </div>
            {sidebarExpanded && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Server size={13} color={dataColor} />
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: dataColor, fontWeight: 500 }}>{engineConfig.dataStatus}</span>
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

          {/* Portfolio Selector */}
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
                <span>Autonomous Console</span>
                <ChevronDown size={14} color={colors.textMuted} />
              </button>
              {portfolioOpen && (
                <div style={{
                  position: 'absolute', top: 44, left: 0,
                  background: colors.bgElevated, border: `1px solid ${colors.borderLight}`,
                  borderRadius: layout.cardRadiusSmall, padding: '6px 0',
                  minWidth: 200, zIndex: 300,
                  boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                }}>
                  {['Autonomous Console', 'Main Portfolio', 'Paper Trading', 'Backtest Lab'].map((p) => (
                    <button key={p} onClick={() => setPortfolioOpen(false)} style={{
                      width: '100%', padding: '10px 16px', background: 'transparent',
                      border: 'none', color: colors.textSecondary, fontSize: 13,
                      textAlign: 'left', cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = colors.activePurpleBg)}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      {p}
                    </button>
                  ))}
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
                  placeholder='Search ticker, event, order...'
                  style={{ background: 'transparent', border: 'none', color: colors.textSecondary, fontSize: 12, outline: 'none', width: '100%', fontFamily: 'inherit' }}
                />
              </div>
            </div>
          )}

          {/* Status pills */}
          {!isMobile && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <StatusPill label='MODE' value={engineConfig.mode} color={modeColor} />
              <StatusPill label='ENGINE' value={engineRunning ? 'RUNNING' : 'PAUSED'} color={engineColor} />
              <StatusPill label='IBKR' value={engineConfig.ibkrConnection} color={ibkrColor} />
            </div>
          )}

          {/* Engine controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
            <button
              onClick={toggleEngine}
              disabled={!killSwitchArmed}
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
              {killSwitchArmed ? 'KILL' : 'KILLED'}
            </button>
            {!isMobile && (
              <>
                <div style={{ width: 1, height: 24, background: colors.border, margin: '0 4px' }} />
                <button style={{ padding: 8, background: 'transparent', border: 'none', cursor: 'pointer', position: 'relative' }}>
                  <Bell size={18} color={colors.textMuted} strokeWidth={1.5} />
                  <div style={{ position: 'absolute', top: 6, right: 6, width: 7, height: 7, borderRadius: 4, background: colors.purple, border: `2px solid ${colors.bgTopBar}` }} />
                </button>
                <div style={{ width: 32, height: 32, borderRadius: 10, background: `linear-gradient(135deg, ${colors.purple}40, ${colors.violet}60)`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                  <User size={16} color={colors.purpleSoft} />
                </div>
              </>
            )}
          </div>
        </div>

        {/* Mobile status bar */}
        {isMobile && (
          <div style={{ padding: '8px 16px', borderBottom: `1px solid ${colors.border}`, display: 'flex', gap: 8, overflowX: 'auto' }}>
            <StatusPill label='MODE' value={engineConfig.mode} color={modeColor} />
            <StatusPill label='ENGINE' value={engineRunning ? 'RUNNING' : 'PAUSED'} color={engineColor} />
            <StatusPill label='IBKR' value={engineConfig.ibkrConnection} color={ibkrColor} />
            <StatusPill label='DATA' value={engineConfig.dataStatus} color={dataColor} />
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
        environment={engineConfig.mode}
      />
    </div>
  )
}
