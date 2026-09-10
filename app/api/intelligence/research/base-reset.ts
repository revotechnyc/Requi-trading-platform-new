/**
 * Base Reset / Bar Reset classifier — honest WAIT when inputs incomplete.
 */
import type { EstimateRevisionSnapshot } from "../../intelligence-data/providers/estimates/types";
import type { GuidanceExtractResult } from "../../intelligence-data/providers/edgar-guidance";
import type { EventStudyResult } from "./event-study";
import type { PeerScores } from "./peer-read-through";

export type BaseResetClass = "BASE_RESET" | "BAR_RESET" | "BOTH" | "NEITHER" | "WAIT";

export type BaseResetInput = {
  symbol: string;
  revisions: EstimateRevisionSnapshot | null;
  guidance: GuidanceExtractResult | null;
  eventStudy: EventStudyResult | null;
  peers: PeerScores | null;
};

export type BaseResetResult = {
  classification: BaseResetClass;
  mock: boolean;
  reasons: string[];
  reportMarkdown: string;
};

export function classifyBaseReset(input: BaseResetInput): BaseResetResult {
  const reasons: string[] = [];
  const mock = Boolean(
    input.revisions?.mock || input.guidance?.mock || input.eventStudy?.mock || input.peers?.mock,
  );

  const revOk = Boolean(input.revisions?.available);
  const guidOk = Boolean(input.guidance?.available);
  const evtOk = Boolean(input.eventStudy?.available && !input.eventStudy.incomplete);
  const peerOk = Boolean(input.peers && !input.peers.incomplete && input.peers.peers.length);

  if (!revOk) {
    reasons.push("Estimate revisions unavailable — cannot classify Base Reset honestly");
    return finish(input.symbol, "WAIT", reasons, mock);
  }

  const r = input.revisions!;
  const rising =
    (r.epsRevisionPct30d ?? 0) > 0 &&
    (r.epsRevisionPct60d ?? 0) > 0 &&
    (r.epsRevisionPct90d ?? 0) >= (r.epsRevisionPct30d ?? 0);
  const falling =
    (r.epsRevisionPct30d ?? 0) < 0 && (r.epsRevisionPct90d ?? 0) < 0;

  const guidanceRaise = input.guidance?.raisesOrMaintains === true;
  const guidanceCut = input.guidance?.raisesOrMaintains === false;

  // Base Reset: prior expectation structure invalidated (revisions + guidance shift).
  const baseReset = (rising || falling) && (guidOk ? guidanceRaise || guidanceCut : false);
  // Bar Reset: market reaction distribution shifted (event study) with peer confirmation.
  const barReset =
    evtOk &&
    peerOk &&
    Math.abs(input.eventStudy!.avgGapPct ?? 0) >= 2 &&
    (input.peers!.peerMarketReactionScore ?? 0) !== 0;

  if (!guidOk && !evtOk) {
    reasons.push("Guidance and event-study incomplete — WAIT");
    return finish(input.symbol, "WAIT", reasons, mock);
  }

  let classification: BaseResetClass = "NEITHER";
  if (baseReset && barReset) classification = "BOTH";
  else if (baseReset) classification = "BASE_RESET";
  else if (barReset) classification = "BAR_RESET";
  else classification = "NEITHER";

  if (rising) reasons.push("EPS revisions positive across 30/60/90 windows");
  if (falling) reasons.push("EPS revisions negative");
  if (guidanceRaise) reasons.push("Guidance raise/maintain signal from 8-K extract");
  if (guidanceCut) reasons.push("Guidance cut/withdraw signal from 8-K extract");
  if (evtOk) reasons.push(`Avg gap ${input.eventStudy!.avgGapPct?.toFixed(2)}% over event sample`);
  if (peerOk) reasons.push(`Peers ${input.peers!.peers.join(", ")}`);
  if (!baseReset && !barReset) reasons.push("No Base/Bar Reset triggers on available factors");

  return finish(input.symbol, classification, reasons, mock);
}

function finish(
  symbol: string,
  classification: BaseResetClass,
  reasons: string[],
  mock: boolean,
): BaseResetResult {
  const reportMarkdown = [
    `## Base Reset classifier — **${symbol}**`,
    "",
    `- **Classification:** ${classification}`,
    mock ? "- **Data mode:** MOCK (not live vendor)" : "- **Data mode:** live/partial",
    "",
    "### Reasons",
    ...reasons.map((r) => `- ${r}`),
    "",
    "Missing critical inputs remain WAIT — nothing invented.",
  ].join("\n");
  return { classification, mock, reasons, reportMarkdown };
}
