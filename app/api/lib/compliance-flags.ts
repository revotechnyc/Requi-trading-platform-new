/**
 * COMPLIANCE FEATURE FLAGS (Legal Revision §45) — server-side launch gating.
 *
 * Regulatory classification for several features is unresolved pending counsel
 * review. These env flags let production keep a regulated feature disabled
 * WITHOUT a code change, and they are enforced in the routers — never by
 * frontend visibility alone (§45).
 *
 * Defaults preserve current behavior for paper-only surfaces; anything that
 * touches money movement defaults to closed until counsel approval lands.
 */
export const ComplianceFlags = {
  /** Autonomous engine (paper) — enabled; live-broker autonomous is separately gated. */
  autonomousTradingLegalApproved: process.env.AUTONOMOUS_TRADING_LEGAL_APPROVED !== "false",
  /** Marketplace purchases — CLOSED until counsel classification + Stripe build. */
  strategyMarketplaceLegalApproved: process.env.STRATEGY_MARKETPLACE_LEGAL_APPROVED === "true",
  /** Personalized AI investment recommendations — chat stays advisory/educational. */
  investmentAdviceLegalApproved: process.env.INVESTMENT_ADVICE_LEGAL_APPROVED === "true",
  /** Live-brokerage execution — requires counsel clearance + broker binding. */
  brokerageExecutionLegalApproved: process.env.BROKERAGE_EXECUTION_LEGAL_APPROVED === "true",
} as const;

export type ComplianceFlagReport = {
  flag: string;
  enabled: boolean;
  note: string;
};

export function complianceFlagReport(): ComplianceFlagReport[] {
  return [
    {
      flag: "AUTONOMOUS_TRADING_LEGAL_APPROVED",
      enabled: ComplianceFlags.autonomousTradingLegalApproved,
      note: "Gates the autonomous engine surface (paper). Live-broker autonomy additionally requires BROKERAGE_EXECUTION_LEGAL_APPROVED.",
    },
    {
      flag: "STRATEGY_MARKETPLACE_LEGAL_APPROVED",
      enabled: ComplianceFlags.strategyMarketplaceLegalApproved,
      note: "Gates marketplace purchases. LAUNCH BLOCKER: seller/fee regulatory classification unresolved.",
    },
    {
      flag: "INVESTMENT_ADVICE_LEGAL_APPROVED",
      enabled: ComplianceFlags.investmentAdviceLegalApproved,
      note: "Gates personalized-recommendation framing in AI features. Chat remains advisory/educational.",
    },
    {
      flag: "BROKERAGE_EXECUTION_LEGAL_APPROVED",
      enabled: ComplianceFlags.brokerageExecutionLegalApproved,
      note: "Gates live-broker order routing. LAUNCH BLOCKER: counsel classification of transmission-only vs. broker activity.",
    },
  ];
}
