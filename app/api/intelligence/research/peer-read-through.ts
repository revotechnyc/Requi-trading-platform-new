/**
 * Peer Read-Through engine — mock peers from estimates vendor; scores partial OK with WAIT.
 */
import { fetchEstimatePeers } from "../../intelligence-data/providers/estimates";
import { fetchHistoricalEarnings, summarizeBeatHistory } from "../../intelligence-data/providers/earnings-history";
import { runEventStudy } from "./event-study";

export type PeerScores = {
  peerRelevanceScore: number | null;
  peerFundamentalScore: number | null;
  peerExpectationResetScore: number | null;
  peerMarketReactionScore: number | null;
  peerSensitivityScore: number | null;
  incomplete: boolean;
  mock: boolean;
  peers: string[];
  detail: string;
};

export async function runPeerReadThrough(symbol: string): Promise<{
  available: boolean;
  scores: PeerScores;
  reportMarkdown: string;
}> {
  const sym = symbol.toUpperCase();
  const peerRes = await fetchEstimatePeers(sym);
  if (!peerRes.available || !peerRes.peers.length) {
    return {
      available: false,
      scores: {
        peerRelevanceScore: null,
        peerFundamentalScore: null,
        peerExpectationResetScore: null,
        peerMarketReactionScore: null,
        peerSensitivityScore: null,
        incomplete: true,
        mock: peerRes.mock,
        peers: [],
        detail: peerRes.error ?? "No peer map available",
      },
      reportMarkdown: [
        "PEER_READ_THROUGH_UNAVAILABLE",
        "",
        `## Peer Read-Through — **${sym}**`,
        "",
        peerRes.error ?? "Peer map unavailable from estimates vendor / mock fixtures.",
        "",
        "No peer scores were invented.",
      ].join("\n"),
    };
  }

  const peers = peerRes.peers.slice(0, 5);
  let fundPts = 0;
  let reactPts = 0;
  let n = 0;
  for (const p of peers) {
    const hist = await fetchHistoricalEarnings(p, { allowAlphaVantageBackfill: false });
    const summary = hist.available ? summarizeBeatHistory(hist.rows) : null;
    const evt = await runEventStudy(p).catch(() => null);
    n += 1;
    if (summary?.epsBeatRate != null) fundPts += summary.epsBeatRate;
    if (evt?.avgGapPct != null) reactPts += Math.max(-50, Math.min(50, evt.avgGapPct));
  }

  const peerFundamentalScore = n ? Math.round(fundPts / n) : null;
  const peerMarketReactionScore = n ? Math.round(reactPts / n) : null;
  const peerRelevanceScore = Math.min(100, 40 + peers.length * 10);
  const incomplete = peerFundamentalScore === null || peerMarketReactionScore === null;
  const scores: PeerScores = {
    peerRelevanceScore,
    peerFundamentalScore,
    peerExpectationResetScore: incomplete ? null : Math.round(((peerFundamentalScore ?? 0) - 50) * 1.2),
    peerMarketReactionScore,
    peerSensitivityScore: incomplete ? null : 55,
    incomplete,
    mock: peerRes.mock,
    peers,
    detail: `Peers: ${peers.join(", ")}${peerRes.mock ? " (MOCK)" : ""}`,
  };

  const lines = [
    `## Peer Read-Through — **${sym}**`,
    "",
    `- **Source:** ${peerRes.source}`,
    `- **Peers:** ${peers.join(", ")}`,
    `- **PEER_RELEVANCE_SCORE:** ${scores.peerRelevanceScore ?? "n/a"}`,
    `- **PEER_FUNDAMENTAL_SCORE:** ${scores.peerFundamentalScore ?? "n/a"}`,
    `- **PEER_MARKET_REACTION_SCORE:** ${scores.peerMarketReactionScore ?? "n/a"}`,
    `- **PEER_EXPECTATION_RESET_SCORE:** ${scores.peerExpectationResetScore ?? "n/a"}`,
    `- **PEER_SENSITIVITY_SCORE:** ${scores.peerSensitivityScore ?? "n/a"}`,
    scores.incomplete ? "- **Status:** WAIT — incomplete peer history/reactions" : "- **Status:** partial scores from available factors",
    peerRes.mock ? "- **Note:** MOCK peer map — not live vendor data." : "",
    "",
    "Scores use retrieved peer beat rates / event gaps only — nothing invented.",
  ].filter(Boolean);

  return { available: true, scores, reportMarkdown: lines.join("\n") };
}
