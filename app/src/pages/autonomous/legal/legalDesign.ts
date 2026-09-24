import { colors } from '../design';

export const legalColors = {
  borderLegal: 'rgba(168,177,185,0.15)',
  textLegalPrimary: '#E8ECF0',
  textLegalMuted: '#8896A9',
  textLegalWarning: '#F5C542',
  textLegalError: '#E05B5B',
  textLegalInfo: '#7ECEF7',
  bgLegalHeader: '#1A1D24',
  bgLegalBody: '#15181E',
  bgLegalCheckbox: '#0F1116',
  bgLegalHighlight: 'rgba(245,197,66,0.08)',
  textLegalCheckbox: '#E8ECF0',
  textLegalDisclaimer: '#8896A9',
};

export const disclosureText = {
  MATERIAL_RISK: [
    'Trading securities involves substantial risk of loss and is not suitable for all investors.',
    'You should consider your financial condition, investment objectives, and risk tolerance before using this software.',
    'Past performance is not indicative of future results.',
    'You may lose more than your initial investment.',
    'Leverage amplifies both gains and losses.',
  ],
  AUTONOMOUS_TRADING: [
    'This software may execute trades without human intervention.',
    'Once enabled, orders may be placed automatically based on algorithmic signals.',
    'You are responsible for monitoring all autonomous activity.',
    'Kill switch functionality is available but may not prevent all losses.',
    'Algorithmic decisions are probabilistic and may result in unexpected outcomes.',
  ],
  EXTENDED_HOURS: [
    'Extended hours trading carries additional risks including reduced liquidity.',
    'Price movements may be exaggerated due to lower volume.',
    'News events outside regular hours can cause significant volatility.',
    'Order execution quality may differ from regular market hours.',
  ],
  OPTIONS: [
    'Options involve risk and are not suitable for all investors.',
    'Option strategies may entail complex risks including assignment and expiration.',
    'Writing uncovered options involves potentially unlimited risk.',
    'The Options Disclosure Document (ODD) is available at OCC website.',
    'Please read Characteristics and Risks of Standardized Options before trading.',
  ],
  BROKER_RELATIONSHIP: [
    'Your orders are routed through your designated broker.',
    'This software is not a broker-dealer and does not hold your funds.',
    'Execution quality depends on your broker and market conditions.',
    'Commission and fee schedules are determined by your broker.',
    'You authorize this software to place orders on your behalf.',
  ],
  ELECTRONIC_COMMUNICATIONS: [
    'You consent to receive all disclosures and communications electronically.',
    'You may withdraw consent at any time but may lose access to services.',
    'Electronic records satisfy legal writing requirements under E-SIGN and UETA.',
    'You must maintain valid email and electronic access to receive notices.',
  ],
  CONSTITUTION: [
    'The system constitution defines the operational boundaries for autonomous trading.',
    'Modifications to the constitution require explicit authorization.',
    'Constitution overrides may trigger compliance review events.',
    'You acknowledge understanding of system operating parameters.',
  ],
};

export const disclosureKeys = [
  { key: 'MATERIAL_RISK', title: 'Material Risk Disclosure', icon: 'AlertTriangle' },
  { key: 'AUTONOMOUS_TRADING', title: 'Autonomous Trading Disclosure', icon: 'Bot' },
  { key: 'EXTENDED_HOURS', title: 'Extended Hours Trading Disclosure', icon: 'Clock' },
  { key: 'OPTIONS', title: 'Options Risk Disclosure (ODD)', icon: 'TrendingUp' },
  { key: 'BROKER_RELATIONSHIP', title: 'Broker Relationship Consent', icon: 'Building2' },
  { key: 'ELECTRONIC_COMMUNICATIONS', title: 'Electronic Communications Consent', icon: 'Mail' },
  { key: 'CONSTITUTION', title: 'Constitution Disclosure', icon: 'Scale' },
];
