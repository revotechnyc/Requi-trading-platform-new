/**
 * LEGAL DOCUMENT LIBRARY (Legal Revision §5, §40–§42)
 *
 * Counsel-review drafts. Every document is seeded with status LEGAL_REVIEW and
 * version "0.9-counsel-review". NOTHING in this file is represented as approved
 * legal advice or final compliance: every material legal determination is marked
 * REQUIRES FINAL REVIEW BY QUALIFIED U.S. COUNSEL BEFORE PRODUCTION LAUNCH.
 * Missing facts use [COUNSEL/COMPANY INPUT REQUIRED] — never invented.
 * Arbitration / class-action / liability-cap clauses are marked COUNSEL APPROVAL
 * REQUIRED and are intentionally absent pending counsel direction (§34–§35).
 */

export interface LegalDocSeed {
  slug: string;
  title: string;
  category: "GENERAL" | "TRADING_DISCLOSURES" | "MARKETPLACE" | "PRIVACY_SECURITY" | "BUSINESS";
  /** Documents a user must affirmatively accept before app access / a feature. */
  requiresReconsent: boolean;
  content: string;
}

export const SEED_VERSION = "0.9-counsel-review";

const ENTITY = "Requi LLC";
const ADDRESS = "800 North King Street, Wilmington, Delaware 19801, United States";
const CONTACT = "[COUNSEL/COMPANY INPUT REQUIRED — legal contact email]";
const REVIEW_NOTE =
  "> **Status: counsel-review draft — REQUIRES FINAL REVIEW BY QUALIFIED U.S. COUNSEL BEFORE PRODUCTION LAUNCH.** " +
  "This draft describes what the Requi software actually does as of its version date. It is published for transparency " +
  "and review and is not represented as a final, binding agreement until approved and activated through Requi's legal " +
  "document workflow.";

export const LEGAL_DOC_SEEDS: LegalDocSeed[] = [
  {
    slug: "terms-of-service",
    title: "Terms of Service",
    category: "GENERAL",
    requiresReconsent: true,
    content: `${REVIEW_NOTE}

# Terms of Service

**Entity:** ${ENTITY} ("Requi", "we", "us") · **Address:** ${ADDRESS}
**Version:** ${SEED_VERSION} · **Effective date:** set at activation · **Contact:** ${CONTACT}

## 1. The Service
Requi is a software platform that provides trading-strategy tooling, portfolio analytics, market-data displays, AI-assisted analysis, and connectivity to third-party brokerages that you separately authorize. Requi LLC is a technology company. **Requi is not a broker-dealer, not a registered investment adviser, not a commodity trading advisor, not a bank, and not a custodian.** Requi does not hold, take custody of, or safeguard your money or securities at any time. Regulatory classification of specific features is under review by qualified counsel; features may be gated or modified as that review concludes.

## 2. Eligibility
You must be at least 18 years old and capable of forming a binding contract. If your jurisdiction or your brokerage requires a higher minimum age for trading activity, the higher requirement controls. The Service is not directed to children under 13 and we do not knowingly collect their information.

## 3. Your Account
Accounts are provisioned via our authentication provider. You are responsible for activity under your credentials and for maintaining their confidentiality.

## 4. No Investment Advice Unless Explicitly Stated
Content, analytics, AI-generated output, signals, and strategy tools are informational software features. Nothing on the Service is personalized investment, legal, accounting, or tax advice unless a separate written agreement with a properly registered entity says so. You are solely responsible for your investment decisions.

## 5. Brokerage Relationships
When you connect a brokerage account, your relationship is with that brokerage under its own terms. The brokerage — not Requi — holds your assets, executes, clears, and settles trades, and issues confirmations and statements. You grant Requi only the technical authority you configure; you can revoke it by disconnecting the account.

## 6. Autonomous and Automated Features
Automated and autonomous features operate only within parameters you set, and only after you complete the dedicated activation consent for those features. You can stop them at any time using the kill switch in the Autonomous module. See the Autonomous Trading Disclosure.

## 7. Marketplace
Buying or selling strategies is governed by the Strategy Marketplace Terms, the Strategy Seller Agreement, and the Strategy Buyer Terms. A platform transaction fee (currently 3.5% of the listing price, itemized before checkout) applies to marketplace purchases.

## 8. Acceptable Use
The Acceptable Use Policy is incorporated by reference.

## 9. Electronic Communications (E-SIGN)
You consent to receive agreements, disclosures, and notices electronically. This consent is effective until you withdraw it by closing your account; withdrawal may limit Service availability.

## 10. Fees
Paid features, if any, are disclosed at the point of purchase. Marketplace fees are itemized before you commit to a transaction.

## 11. Disclaimers
THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE". WE DISCLAIM IMPLIED WARRANTIES TO THE MAXIMUM EXTENT PERMITTED BY LAW. MARKET DATA MAY BE DELAYED OR ERRONEOUS; SOFTWARE MAY FAIL; EXECUTION IS PERFORMED BY YOUR BROKERAGE. See the Trading Risk Disclosure.

## 12. Limitation of Liability
[COUNSEL APPROVAL REQUIRED — do not activate a liability cap, damages exclusion, or shortened limitation period without qualified counsel; certain liabilities cannot be waived under applicable law.]

## 13. Disputes; Governing Law
[COUNSEL APPROVAL REQUIRED — arbitration, class-action waiver, jury waiver, opt-out mechanics, governing law and venue to be determined by qualified counsel with California enforceability analysis.]

## 14. Changes
We maintain prior versions of these Terms. Material changes are presented for re-acceptance where required; historical versions remain retrievable in the Legal Center.

## 15. Termination
You may deactivate your account at any time from the Privacy Center. See the Account Deletion & Data Rights Policy for what is deleted and what must be retained by law.`,
  },
  {
    slug: "privacy-policy",
    title: "Privacy Policy",
    category: "GENERAL",
    requiresReconsent: true,
    content: `${REVIEW_NOTE}

# Privacy Policy

**Entity:** ${ENTITY} · **Address:** ${ADDRESS} · **Version:** ${SEED_VERSION} · **Contact:** ${CONTACT}

This policy describes the data the Requi software actually collects as of its version date, verified against the codebase — not a generic template. If our practices change, this document is versioned and, where required, re-presented for acknowledgment.

## 1. What we collect
| Category | Source | Purpose | Retention |
|---|---|---|---|
| Identity (name, email, avatar) | Authentication provider sign-in | Account provisioning, support | Life of account |
| Authentication identifiers (union ID, session token) | Sign-in flow | Sessions, security | Life of account; sessions per token expiry |
| Device/browser metadata (IP address, user-agent, locale) | Automatic | Security, consent records, fraud prevention | Security logs: 12 months target [COMPANY INPUT REQUIRED] |
| Strategies you create (rules, prompts, parameters) | You | Core service | Until you delete them |
| AI chat interactions (prompts, replies) | You / AI provider | Core service, quality | Until you delete them |
| Brokerage connection metadata (broker name, account label, connection status) | You | Connectivity | Until disconnected |
| Orders, positions, signals, P&L records (paper and, where connected, broker-reported) | System activity | Core service, financial reporting, audit | Retained as financial records — see Account Deletion & Data Rights Policy |
| Audit and consent records | System | Legal proof, security, compliance | Retained per legal obligations |
| Marketplace activity (listings, purchases, entitlements) | System / Stripe (when enabled) | Transactions, payouts | Per payment-law retention |
| Support communications | You | Support | 24 months target [COMPANY INPUT REQUIRED] |
| Cookie/consent preferences | You | Honoring your choices | Until changed |

## 2. What we do NOT do
We do not sell your personal information. We do not share it for cross-context behavioral advertising. We do not run advertising trackers, pixels, or third-party analytics SDKs on the Service as of this version. We never claim "we do not share X" beyond what is technically verified — the table above is the authoritative inventory.

## 3. Service providers (subprocessors)
| Provider | Data shared | Purpose |
|---|---|---|
| Authentication provider (Kimi / Moonshot AI) | Sign-in profile | Identity |
| AI model provider (OpenAI API) | Chat prompts you send, strategy text | AI features |
| Managed database host (TiDB) | All stored records | Data storage |
| Brokerage APIs you connect (e.g., Interactive Brokers) | Orders you instruct, account queries | Execution connectivity |
| Stripe (when marketplace payments enable) | Payment details (processed by Stripe, not stored by Requi) | Marketplace payments |
| Hosting/infrastructure provider | Service traffic | Operations [COMPANY INPUT REQUIRED — provider identity] |

## 4. Your rights and choices
Depending on your state of residence you may have rights to know/access, delete, correct, portability, opt out of sale/sharing, limit sensitive-PI use, and non-discrimination. Exercise them in the in-app **Privacy Center** (authenticated, logged, and verifiable) or via ${CONTACT}. California residents: see the California Privacy Notice. We honor Global Privacy Control (GPC) signals and display confirmation when honored. Statutory choices are stored server-side, not only in browser cookies.

## 5. Security
Encryption in transit, encrypted managed storage, least-privilege access, audit logging. See the Security Statement. No method is 100% secure; see the incident framework therein.

## 6. Children
Not directed to children under 13; we do not knowingly collect their data.

## 7. Changes
Versioned; material changes presented for re-acknowledgment where required.`,
  },
  {
    slug: "cookie-policy",
    title: "Cookie Policy",
    category: "GENERAL",
    requiresReconsent: false,
    content: `${REVIEW_NOTE}

# Cookie Policy

**Version:** ${SEED_VERSION} · Generated from the actual cookie/tracker inventory of the codebase, not a template.

## Inventory (complete as of this version)
| Cookie / storage | Category | Purpose | Duration | Party |
|---|---|---|---|---|
| Session cookie (httpOnly JWT) | Strictly Necessary | Authentication session | Session-length per token expiry | First |
| Sidebar layout cookie | Functional | Remembers sidebar open/closed | 7 days | First |
| Sidebar width (localStorage) | Functional | UI preference | Persistent until cleared | First |
| Cookie-consent ID cookie | Strictly Necessary | References your server-side consent record | 12 months | First |

**Analytics cookies:** none deployed. **Advertising/targeting cookies:** none deployed. **Third-party trackers, pixels, or session-replay tools:** none deployed as of this version. No cookie is labeled "necessary" to bypass consent — the two functional items are genuine UI preferences you can decline.

## Your controls
The consent banner lets you accept or decline Functional and Analytics categories individually; nothing optional is pre-checked. If your browser sends a **Global Privacy Control (GPC)** signal, we treat it as a valid opt-out preference signal, set optional categories off, store that choice server-side, and display "Opt-Out Preference Signal Honored". Changing your browser's cookie settings may affect layout preferences but not security cookies required to operate the Service.`,
  },
  {
      slug: "acceptable-use-policy",
      title: "Acceptable Use Policy",
      category: "GENERAL",
      requiresReconsent: false,
      content: `${REVIEW_NOTE}

# Acceptable Use Policy

**Version:** ${SEED_VERSION}

You may not use the Service to: violate any law or securities regulation; engage in market manipulation (including spoofing, layering, wash trading, or pump-and-dump schemes); submit strategies designed to deceive other users; misrepresent performance in the marketplace; probe or disrupt the Service or its providers; access another user's data; reverse-engineer except as permitted by law; resell the Service without written permission; or use the Service if under the minimum age. Strategy sellers may not use listings to distribute malware, harvest credentials, or make prohibited claims (see Strategy Performance Disclosure). Violations may result in suspension or termination and, where required, referral to authorities.`,
  },
  {
    slug: "trading-risk-disclosure",
    title: "Trading Risk Disclosure",
    category: "TRADING_DISCLOSURES",
    requiresReconsent: true,
    content: `${REVIEW_NOTE}

# Trading Risk Disclosure

**Version:** ${SEED_VERSION}

**Trading involves substantial risk of loss and is not suitable for every person. You can lose more than you deposit when using leverage or margin. Past performance — live, simulated, or hypothetical — does not guarantee future results.**

Risks include, without limitation: equities, ETF, options, short-selling, and leverage/margin risks; volatile and gapping markets; liquidity risk; partial fills and rejected orders; stale or erroneous market data; brokerage, exchange, API, and connectivity outages; software defects; and strategy failure. Algorithmic and automated execution can amplify losses because orders continue to fire while conditions deteriorate and without human review of each order.

Paper-trading results are simulated: they omit slippage, market impact, partial fills, and psychology, and they are not a promise of live results. Backtested or hypothetical results have inherent limitations — they are prepared with hindsight, do not represent actual trading, and may over- or under-state the effect of material market conditions.

Requi provides software tools only; your brokerage executes and reports your trades. No disclosure substitutes for engineering safeguards, and none is offered as one: review your risk-control settings before enabling any automation. You should carefully consider whether trading is appropriate for you in light of your circumstances and financial resources.`,
  },
  {
    slug: "autonomous-trading-disclosure",
    title: "Autonomous Trading Disclosure",
    category: "TRADING_DISCLOSURES",
    requiresReconsent: true,
    content: `${REVIEW_NOTE}

# Autonomous Trading Disclosure

**Version:** ${SEED_VERSION} · This disclosure is presented inside a dedicated activation flow before autonomous features can be enabled; acceptance is recorded with document version, timestamp, and method.

## What autonomous mode does
When you enable Autonomous features, the Requi engine may, within the parameters you configure: build and maintain a watchlist (auto-universe), monitor market data, generate entry proposals, manage stops and trailing exits, and — **only if you separately enable auto-execution** — submit orders without requiring you to type a confirmation for each one. Auto-execution is OFF by default and fails closed: if the system cannot read your setting, it does not auto-execute.

## What it does not do
It does not guarantee profits, prevent losses, or monitor every conceivable risk. It can misbehave under stale data, provider outages, software defects, or extreme markets. You remain responsible for activity in your account.

## Controls you have
- Master kill switch in the Autonomous module — immediately stops autonomous operation.
- AUTONOMOUS TRADING ON / OFF state is displayed unmistakably whenever the module is active.
- Position limits, stop modes, and per-trade parameters you configure.
- Broker connections can be revoked at any time.

## Scope of authority
Your activation grants Requi the technical authority to operate the configured automation on accounts you connect. Orders are submitted to your brokerage under your brokerage agreement. **Whether autonomous operation of a user's brokerage account constitutes discretionary investment management requiring registration is under review by qualified U.S. counsel; this feature may be gated pending that determination.**

## Paper vs. live
Paper-mode autonomous operation uses simulated fills. Live-broker autonomous operation requires a connected supported brokerage and counsel-cleared launch gating.`,
  },
  {
    slug: "ai-algorithmic-disclosure",
    title: "AI & Algorithmic Trading Disclosure",
    category: "TRADING_DISCLOSURES",
    requiresReconsent: false,
    content: `${REVIEW_NOTE}

# AI & Algorithmic Trading Disclosure

**Version:** ${SEED_VERSION}

Requi includes AI-assisted features (natural-language analysis, strategy parsing, research narration) and deterministic algorithmic features (the execution engine, risk gates, session logic).

**How they are separated:** a deterministic intent router classifies each message. Ordinary conversation and research go to the AI model; anything that could become an order is routed into the deterministic pipeline (advisory → staged ticket → explicit confirmation). **An AI-generated natural-language response never directly becomes a broker order.** Trade execution requires the deterministic ticket flow, and chat-originated or manual trades always require your typed confirmation. The AI model cannot access the trade tool except during a single deterministic staging step.

**AI limitations:** AI output can be wrong, incomplete, stale, or confidently incorrect. AI-generated content is information, not investment advice, and is not a solicitation to buy or sell any security. Deterministic advisories shown alongside AI narration are computed by the rules engine — narrate them, verify them, but never treat them as guarantees.

**Automated decision-making (California ADMT notice, counsel-review):** certain features process your parameters to produce automated outputs (proposals, watchlists). You may opt out of automated processing by not enabling autonomous features and by using the manual modules; core account functions remain available. [COUNSEL/COMPANY INPUT REQUIRED — final ADMT notice wording under the 2026 CCPA regulations.]`,
  },
  {
    slug: "market-data-disclosure",
    title: "Market Data Disclosure",
    category: "TRADING_DISCLOSURES",
    requiresReconsent: false,
    content: `${REVIEW_NOTE}

# Market Data Disclosure

**Version:** ${SEED_VERSION}

Market data displayed by the Service may be delayed, aggregated, erroneous, or unavailable, depending on the provider and your entitlements. Unless a display explicitly identifies its source and timestamp, do not assume data is real-time. Stale data is labeled where the system can detect it; absence of a label is not a warranty of freshness. Market-session state (open/closed, holidays, early closes) is derived from an embedded NYSE calendar with a documented coverage range; beyond that range a fallback rule is used and labeled.

You may not redistribute market data obtained through the Service. Exchange and vendor terms apply to your use of their data; additional agreements may be required for live-brokerage data entitlements. [COUNSEL/COMPANY INPUT REQUIRED — exchange/vendor attribution and redistribution terms per final data agreements.]`,
  },
  {
    slug: "brokerage-integration-disclosure",
    title: "Brokerage Integration Disclosure",
    category: "TRADING_DISCLOSURES",
    requiresReconsent: true,
    content: `${REVIEW_NOTE}

# Brokerage Integration Disclosure

**Version:** ${SEED_VERSION}

**The relationship:** You → your brokerage (custody, execution, clearing, statements, confirmations) ; You → Requi (software tools and connectivity you authorize). Requi LLC does not hold customer assets, does not execute or clear trades, does not issue confirmations or statements, and does not have custody of your funds or securities at any time.

**Authority you grant:** when you connect a brokerage account, you authorize Requi to submit the instructions you configure (and, where you enable automation, the instructions your configured automation generates) through that brokerage's API. You can revoke authority at any time by disconnecting the account; revocation stops future instructions but cannot cancel orders already accepted by the brokerage.

**Protection schemes:** SIPC and other protections, where applicable, attach to your brokerage account and are provided by your brokerage's arrangements — not by Requi LLC. **Requi LLC is not a member of SIPC and is not FDIC-insured.** If a connected brokerage represents that it carries such protection, that protection covers custody at that brokerage under its terms; it does not insure you against trading losses, and it does not cover Requi.

**Failures:** brokerage, API, or connectivity failures can prevent, delay, or duplicate-intent instructions; Requi's execution pipeline is idempotent by design, but your brokerage's records are the authoritative record of your trades.`,
  },
];

/** Marketplace + privacy/security documents (appended seed set 2). */
export const LEGAL_DOC_SEEDS_2: LegalDocSeed[] = [
  {
    slug: "marketplace-terms",
    title: "Strategy Marketplace Terms",
    category: "MARKETPLACE",
    requiresReconsent: true,
    content: `${REVIEW_NOTE}

# Strategy Marketplace Terms

**Version:** ${SEED_VERSION}

## 1. What the marketplace is
A venue where independent sellers offer strategy definitions (rules, parameters, prompts) and buyers purchase a license to use them on the Requi platform. **LAUNCH-GATED:** marketplace purchases remain disabled until regulatory classification review by qualified U.S. counsel is complete (whether sellers may be providing regulated investment advice, and how the platform fee is characterized).

## 2. What a strategy is not
A purchased strategy is software/content licensed to you. It is not a managed account, not a guarantee, and — unless counsel determines a listing constitutes registered advice — not personalized investment advice. Requi does not sponsor, verify trading skill of, or endorse sellers.

## 3. Fees
Each purchase is itemized before checkout: **Strategy Price + Platform Transaction Fee (currently 3.5% of the Strategy Price, computed in integer cents and rounded half-up) + applicable taxes = Total.** The fee is never hidden or blended. Checkout records the document versions governing the transaction.

## 4. Performance information
Listings must label any performance figure as LIVE, PAPER/SIMULATED, BACKTESTED, or HYPOTHETICAL, per the Strategy Performance Disclosure. Figures are shown only where they can be computed from canonical platform records for the exact listed version; otherwise they are withheld.

## 5. Entitlements
A completed purchase creates a server-side entitlement for the specific strategy version bought. No entitlement, no deployment. Purchasing grants access — it never auto-deploys; deployment still passes the standard confirmation ceremony.

## 6. Listing rules and prohibited claims
Sellers may not claim guaranteed returns, "risk-free" results, or use cherry-picked or unlabeled backtests. Requi may suspend listings that violate these terms.

## 7. Refunds and disputes
Governed by the Refund Policy. Payment disputes are handled through Stripe's dispute process with the marketplace ledger as the record of the transaction.

## 8. Suspension/termination
Requi may suspend or remove listings or sellers for violations, legal risk, or regulatory direction, with ledger-preserving treatment of completed sales.`,
  },
  {
    slug: "strategy-seller-agreement",
    title: "Strategy Seller Agreement",
    category: "MARKETPLACE",
    requiresReconsent: true,
    content: `${REVIEW_NOTE}

# Strategy Seller Agreement

**Version:** ${SEED_VERSION}

## 1. Eligibility and onboarding
Sellers must be 18+, complete Stripe Connect onboarding (KYC) before payout eligibility, and accept these terms plus the Marketplace Terms.

## 2. Your obligations
You represent that your listings are your own work or properly licensed; that descriptions are accurate; that performance figures you supply are computed from verifiable records and correctly labeled (LIVE / PAPER/SIMULATED / BACKTESTED / HYPOTHETICAL); and that you will not make prohibited claims (guaranteed returns, risk-free, cherry-picked results).

## 3. Regulatory status — no bypass by clickthrough
**Clicking this agreement does not make regulated activity legal.** If your activity constitutes providing investment advice, managing portfolios, or receiving transaction-based compensation tied to securities recommendations, registration or an applicable exemption may be required. [COUNSEL REVIEW REQUIRED — seller-flow regulatory screening and representations.] Requi may require attestations, restrict listing types, or decline sellers based on compliance review.

## 4. Compensation
You receive the Strategy Price minus Stripe processing costs; Requi retains the disclosed platform fee charged to the buyer. Payouts occur via Stripe Connect per its schedule. **No compensation you receive through Requi is tied to the trading results of any buyer's account, to transaction volume in securities, or to assets under management.**

## 5. IP license
You grant Requi a license to host, display, and deliver your strategy to buyers, and grant each buyer a non-exclusive license to use the purchased version on the platform. Buyers receive no right to redistribute.

## 6. Takedown
Listings may be removed for legal, compliance, or quality reasons; completed entitlements are honored or refunded per the Refund Policy.`,
  },
  {
    slug: "strategy-buyer-terms",
    title: "Strategy Buyer Terms",
    category: "MARKETPLACE",
    requiresReconsent: true,
    content: `${REVIEW_NOTE}

# Strategy Buyer Terms

**Version:** ${SEED_VERSION}

1. **License.** Your purchase grants a non-exclusive, non-transferable license to use the specific purchased strategy version on the Requi platform. No redistribution, resale, or extraction for off-platform sale.
2. **No advice.** A purchased strategy is content/software, not personalized investment advice and not portfolio management. You decide whether and how to deploy it; deployment always requires your explicit confirmation.
3. **Performance.** Treat all performance information per the Strategy Performance Disclosure. Historical, simulated, backtested, or hypothetical results do not guarantee future results.
4. **Fees and taxes.** You pay the itemized total shown at checkout (price + 3.5% platform fee + taxes if applicable). Checkout records the governing document versions.
5. **Refunds.** Per the Refund Policy.
6. **Risk.** Deploying any strategy can lose money. Use paper mode first; configure risk controls; see the Trading Risk Disclosure.`,
  },
  {
    slug: "strategy-performance-disclosure",
    title: "Strategy Performance & Backtesting Disclosure",
    category: "MARKETPLACE",
    requiresReconsent: false,
    content: `${REVIEW_NOTE}

# Strategy Performance & Backtesting Disclosure

**Version:** ${SEED_VERSION}

Any performance figure shown anywhere on Requi must be labeled with exactly one of:

- **LIVE** — actual fills in a real brokerage account, verifiable from platform records;
- **PAPER/SIMULATED** — simulated fills from the paper engine (no slippage, market impact, or partial fills);
- **BACKTESTED** — historical simulation over past data;
- **HYPOTHETICAL** — modeled results not derived from actual or simulated order flow.

These are never blended into a single number. Each figure must display its period, version scope (the exact strategy version measured), and key assumptions.

**Inherent limitations:** backtested and hypothetical results are prepared with hindsight; they do not involve financial risk, can under- or over-estimate the impact of liquidity and market conditions, and do not represent actual trading. **No representation is made that any account will achieve results similar to those shown.** Guaranteed-return claims, "risk-free" claims, misleading annualization, and cherry-picked windows are prohibited platform-wide.

Performance-marketing functionality requires compliance approval before activation. [COUNSEL REVIEW REQUIRED — SEC marketing-rule-style substantiation standards if Requi or sellers are ever within Advisers Act scope.]`,
  },
  {
    slug: "platform-fee-disclosure",
    title: "Payment & Platform Fee Disclosure",
    category: "MARKETPLACE",
    requiresReconsent: false,
    content: `${REVIEW_NOTE}

# Payment & Platform Fee Disclosure

**Version:** ${SEED_VERSION}

**Itemization before you commit:**
- Strategy Price — set by the seller;
- Platform Transaction Fee — currently **3.5% of the Strategy Price**, charged to the buyer, computed in integer cents and rounded half-up;
- Taxes — where applicable;
- **Total** — the amount charged.

Payments are processed by Stripe; Requi does not store card numbers. Sellers are paid through Stripe Connect, net of Stripe processing costs. All marketplace money is computed in integer minor currency units — never floating point.

**What the fee compensates:** platform operation, marketplace infrastructure, entitlement delivery, and payment processing coordination. The fee is **not** calculated from or tied to securities transactions in your brokerage account, trading volume, or investment performance. [COUNSEL REVIEW REQUIRED — final characterization of the fee relative to securities-activity compensation before marketplace launch.]

Checkout records the document versions governing each transaction.`,
  },
  {
    slug: "refund-policy",
    title: "Refund Policy",
    category: "MARKETPLACE",
    requiresReconsent: false,
    content: `${REVIEW_NOTE}

# Refund Policy

**Version:** ${SEED_VERSION}

**Marketplace strategy purchases:** refundable within 14 days of purchase **if the strategy has not been deployed** (no live or paper deployment of the purchased version). Because strategies are digital content delivered immediately, deployment consumes the purchase; deployed strategies are non-refundable except where required by law.

**Defective or misdescribed listings:** if a listing materially misdescribed its contents, contact support within 30 days; verified cases are refunded in full (price and platform fee).

**Processing:** refunds are issued through Stripe to the original payment method; the marketplace ledger records refund entries and the corresponding entitlement is revoked.

**Subscriptions (if and when offered):** cancel anytime; access continues to the end of the paid period; no partial-period refunds except where required by law. [COUNSEL/COMPANY INPUT REQUIRED — confirm final subscription terms before any subscription launch.]`,
  },
  {
    slug: "california-privacy-notice",
    title: "California Privacy Notice",
    category: "PRIVACY_SECURITY",
    requiresReconsent: false,
    content: `${REVIEW_NOTE}

# California Privacy Notice (CCPA/CPRA)

**Version:** ${SEED_VERSION} · Applies to California residents; supplements the Privacy Policy.

## Applicability analysis (as of this version)
Requi LLC has evaluated the CCPA thresholds: (a) annual gross revenue above the adjusted statutory threshold (currently $26,625,000); (b) buying/selling/sharing the personal information of 100,000+ California consumers or households annually; (c) deriving 50%+ of revenue from selling or sharing personal information. **[COMPANY INPUT REQUIRED — confirm revenue and California user counts annually.]** Requi does not sell or share personal information for cross-context behavioral advertising, and is not a data broker under the California Delete Act (we maintain direct relationships with our users). Even where a right is not yet legally compelled, the Privacy Center already implements it — the controls are built to activate without rebuilding.

## Notice at Collection
We collect: identifiers (name, email, IP, device identifiers); commercial/activity records (orders, positions, signals, marketplace activity); internet activity (service logs); professional information you provide; and inferences limited to service operation. Purposes: provide the Service, security, legal compliance, records. We do **not** sell or share this information. Retention: per category in the Privacy Policy table.

## Your California rights
Know/access; delete; correct; portability; opt out of sale/sharing (we do not sell or share); limit sensitive-PI use (we do not use sensitive PI beyond permitted purposes); non-discrimination. **How to exercise:** the in-app Privacy Center (identity-verified via your authenticated session; every request is logged and tracked to completion) or ${CONTACT}. Authorized agents may submit with proof of authorization. We honor **Global Privacy Control** signals and display "Opt-Out Preference Signal Honored" when processed; your choice is stored server-side. We will not re-ask a declined consent for the same purpose within 6 months.

## Automated decision-making
See the AI & Algorithmic Disclosure for the ADMT pre-use notice and how to opt out of automated processing. [COUNSEL REVIEW REQUIRED — final ADMT compliance mapping under the 2026 CCPA regulations, including risk-assessment documentation.]`,
  },
  {
    slug: "account-deletion-data-rights",
    title: "Account Deletion & Data Rights Policy",
    category: "PRIVACY_SECURITY",
    requiresReconsent: false,
    content: `${REVIEW_NOTE}

# Account Deletion & Data Rights Policy

**Version:** ${SEED_VERSION}

Three different things, kept distinct:

1. **Deactivate account** — stops logins and disables automation. Reversible within a grace period by signing back in. No data is deleted by deactivation alone.
2. **Delete eligible personal data** — on a verified deletion request we delete: profile details, chat history, strategies you own, cookie/consent preferences, support threads, and disconnected-broker metadata.
3. **Retain legally required records** — financial records (orders, fills, positions, P&L), audit trails, consent records, marketplace purchase/ledger records, and records subject to legal holds are retained for their required retention periods and are not deleted on request. [COUNSEL/COMPANY INPUT REQUIRED — finalize the retention schedule per applicable securities, tax, and payment-record obligations.] Retained records are access-restricted and used only for compliance, audit, dispute, and legal purposes.

**Workflow:** submit via the Privacy Center → identity verification (authenticated session) → request logged with an ID → processing → completion notice with a summary of what was deleted and what was retained and why. Target completion: 45 days, with one permitted extension where allowed by law.`,
  },
  {
    slug: "security-statement",
    title: "Security Statement",
    category: "PRIVACY_SECURITY",
    requiresReconsent: false,
    content: `${REVIEW_NOTE}

# Security Statement

**Version:** ${SEED_VERSION}

**Program controls (as implemented):** TLS encryption in transit; encrypted managed database storage; httpOnly session cookies; least-privilege service credentials; secrets held in environment configuration, never in the repository or client bundle; idempotent financial operations; append-only audit logging of sensitive actions; role-based access for administrative surfaces.

**Brokerage credentials:** connection secrets are used only for the connectivity you authorize [COMPANY INPUT REQUIRED — finalize secret-storage description after credential-vault implementation].

**What we do not claim:** we do not claim SOC 2, ISO 27001, or any certification we do not hold. [COMPANY INPUT REQUIRED — list certifications only when actually achieved.]

**Incident response:** incidents follow Detect → Classify → Legal Review → Notification Determination → Required Notifications (California Civil Code §1798.82 and other applicable state laws, plus contractual/vendor obligations) → Evidence Preservation → Remediation. Breach notices are a legal determination, never an automated email blast. [COUNSEL REVIEW REQUIRED — FTC Safeguards Rule applicability mapping; if Requi is ever a covered "financial institution" under 16 CFR Part 314, a Written Information Security Program, Qualified Individual, and 30-day FTC breach reporting (500+ consumers) apply.]

**Vulnerability reports:** see the Responsible Disclosure Policy.`,
  },
  {
    slug: "responsible-disclosure-policy",
    title: "Responsible Disclosure Policy",
    category: "PRIVACY_SECURITY",
    requiresReconsent: false,
    content: `${REVIEW_NOTE}

# Responsible Disclosure Policy

**Version:** ${SEED_VERSION}

We welcome good-faith security research. Report vulnerabilities to ${CONTACT} with steps to reproduce, impact, and your contact information. **Scope:** the Requi web application and API. **Do not:** access or exfiltrate user data, degrade service, perform social engineering, or publicly disclose before we have had a reasonable opportunity to remediate (target: 90 days). Good-faith research consistent with this policy will not be pursued legally by us. We will acknowledge reports within 5 business days and provide status updates at reasonable intervals. No bug bounty is offered unless separately announced.`,
  },
];
