// Decision state machine configuration for the Requi Autonomous Engine

export const decisionStates = [
  { state: 'NO_ACTION', desc: 'Symbol on watchlist', category: 'normal' },
  { state: 'WATCH', desc: 'Research complete; intraday monitoring', category: 'normal' },
  { state: 'RESEARCH_LOCKED', desc: 'Pre-event research finalized', category: 'normal' },
  { state: 'ARMED', desc: 'System armed for event', category: 'normal' },
  { state: 'EVENT_DETECTED', desc: 'Earnings event payload received', category: 'normal' },
  { state: 'FUNDAMENTALS_CONFIRMED', desc: 'FIS threshold met', category: 'normal' },
  { state: 'REACTION_OBSERVING', desc: 'Monitoring market reaction', category: 'normal' },
  { state: 'REACTION_CONFIRMED', desc: 'RCS threshold met', category: 'normal' },
  { state: 'RISK_APPROVED', desc: 'Within pre-computed envelope', category: 'normal' },
  { state: 'ORDER_READY', desc: 'Order within execution constraints', category: 'normal' },
  { state: 'SUBMITTED', desc: 'Sent to broker', category: 'normal' },
  { state: 'ACKNOWLEDGED', desc: 'Broker ack received', category: 'normal' },
  { state: 'PARTIALLY_FILLED', desc: 'Partial fill confirmed', category: 'normal' },
  { state: 'FILLED', desc: 'Order fully filled', category: 'normal' },
  { state: 'PROTECTION_ACTIVE', desc: 'APMA protection engaged', category: 'normal' },
  { state: 'MANAGED', desc: 'APMA active monitoring', category: 'normal' },
  { state: 'EXIT_PENDING', desc: 'Exit order queued', category: 'normal' },
  { state: 'EXITED', desc: 'Position closed', category: 'normal' },
  { state: 'RECONCILED', desc: 'Event fully reconciled', category: 'normal' },
] as const;

export const failureStates = [
  { state: 'REJECTED', desc: 'Order rejected by broker', category: 'failure' },
  { state: 'STALE_DATA', desc: 'Data exceeded freshness threshold', category: 'failure' },
  { state: 'BROKER_BLOCKED', desc: 'Broker connectivity issue', category: 'failure' },
  { state: 'LIQUIDITY_BLOCKED', desc: 'Insufficient liquidity', category: 'failure' },
  { state: 'RISK_BLOCKED', desc: 'Risk limit exceeded', category: 'failure' },
  { state: 'KILL_SWITCH', desc: 'Kill switch activated', category: 'failure' },
  { state: 'ERROR', desc: 'System error', category: 'failure' },
] as const;

export type DecisionState = (typeof decisionStates)[number]['state'];
export type FailureState = (typeof failureStates)[number]['state'];
export type EngineState = DecisionState | FailureState;

export const allStates = [...decisionStates, ...failureStates];
