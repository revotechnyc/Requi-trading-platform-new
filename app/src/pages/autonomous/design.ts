/** Autonomous console tokens — aligned with Requi Trading app (light theme). */
export const colors = {
  bgBase: '#FFFFFF',
  bgPanel: '#FFFFFF',
  bgElevated: '#F8FAFC',
  bgSecondary: '#F1F5F9',
  bgSidebar: '#FFFFFF',
  bgTopBar: '#FFFFFF',
  textPrimary: '#0F172A',
  textSecondary: '#475569',
  textMuted: '#64748B',
  purple: '#446EE6',
  purpleSoft: '#5B7FEF',
  purpleMuted: '#3D5FD9',
  violet: '#446EE6',
  blue: '#446EE6',
  blueSoft: '#5B7FEF',
  green: '#0D9488',
  greenMuted: '#0F766E',
  orange: '#D97706',
  red: '#DC2626',
  redSoft: '#EF4444',
  yellow: '#CA8A04',
  cream: '#FDE68A',
  gray: '#94A3B8',
  border: 'rgba(15, 23, 42, 0.08)',
  borderLight: 'rgba(15, 23, 42, 0.06)',
  borderPurple: 'rgba(68, 110, 230, 0.35)',
  activePurpleBg: 'rgba(68, 110, 230, 0.08)',
  activeRedBg: 'rgba(220, 38, 38, 0.08)',
  chipGray: '#64748B',
  chipOrange: '#D97706',
  chipBlue: '#446EE6',
  chipPurple: '#446EE6',
  chipGreen: '#0D9488',
  chipRed: '#DC2626',
  chartPurple: '#446EE6',
  chartYellow: '#CA8A04',
  chartBlue: '#446EE6',
  chartGreen: '#0D9488',
  chartRed: '#DC2626',
} as const

export const layout = {
  sidebarWidth: 72,
  sidebarWidthExpanded: 220,
  topBarHeight: 56,
  mobileTopHeight: 52,
  mobileBottomNav: 64,
  contentPadding: 24,
  cardRadiusLarge: 16,
  cardRadius: 12,
  cardRadiusSmall: 10,
  cardRadiusControl: 8,
  pillRadius: 9999,
} as const

export const typography = {
  pageTitle: { fontSize: 28, weight: 600, lineHeight: 34 },
  majorValue: { fontSize: 32, weight: 600, lineHeight: 38 },
  cardValue: { fontSize: 22, weight: 600, lineHeight: 28 },
  sectionTitle: { fontSize: 16, weight: 600 },
  primary: { fontSize: 14, weight: 500 },
  secondary: { fontSize: 12, weight: 400 },
  telemetry: { fontSize: 11, weight: 500, letterSpacing: '0.04em' },
  micro: { fontSize: 10, weight: 500 },
} as const

export const breakpoints = {
  desktop: 1200,
  tablet: 768,
} as const

export const anim = {
  fast: 150,
  normal: 200,
} as const
