// APMA (Adaptive Position Management & Adjustment) Configuration

export interface ApmaConfig {
  action: 'HOLD' | 'TIGHTEN' | 'REDUCE' | 'EXIT';
  desc: string;
  trigger: string;
  color: string;
}

export const apmaConfig: ApmaConfig[] = [
  {
    action: 'HOLD',
    desc: 'Position within expected range. Monitor only.',
    trigger: 'Normal performance',
    color: '#4F8EF7',
  },
  {
    action: 'TIGHTEN',
    desc: 'Reduce risk by moving stop closer to entry or current price.',
    trigger: 'Favorable; market confirming',
    color: '#5ED6C0',
  },
  {
    action: 'REDUCE',
    desc: 'Sell 25-50% of position to lower exposure.',
    trigger: 'Deteriorating but not at stop',
    color: '#F4A261',
  },
  {
    action: 'EXIT',
    desc: 'Close entire position.',
    trigger: 'Stop hit, severe deterioration, reversal, or timeout',
    color: '#EF4444',
  },
];

export const protectionStates = [
  { label: 'BROKER_PROTECTED', desc: 'Stop order placed at broker', color: '#5ED6C0' },
  { label: 'SYNTHETIC_PROTECTION_ACTIVE', desc: 'Internal monitoring active', color: '#F4A261' },
  { label: 'GAP_EXPOSED', desc: 'No protection against gap moves', color: '#EF4444' },
] as const;

export type ProtectionState = (typeof protectionStates)[number]['label'];
