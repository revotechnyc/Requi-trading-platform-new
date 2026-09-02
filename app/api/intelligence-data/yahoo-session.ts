/**
 * Yahoo Finance cookie + crumb session for intelligence-data providers (earnings).
 * Mirrors the market-data gateway provider — keeps intelligence modules independent.
 */
const UA = "Mozilla/5.0 (compatible; RequiTrading/1.0; intelligence-data)";

let authSession: { cookie: string; crumb: string; at: number } | null = null;
let authInflight: Promise<{ cookie: string; crumb: string } | null> | null = null;

export async function getYahooAuthSession(): Promise<{ cookie: string; crumb: string } | null> {
  if (authSession && Date.now() - authSession.at < 30 * 60_000) return authSession;
  if (authInflight) return authInflight;
  authInflight = (async () => {
    try {
      const cookieRes = await fetch("https://fc.yahoo.com", {
        headers: { "User-Agent": UA },
        redirect: "manual",
      }).catch(() => null);
      const cookie = cookieRes?.headers.get("set-cookie")?.split(";")[0];
      if (!cookie) return null;
      const crumbRes = await fetch("https://query1.finance.yahoo.com/v1/test/getcrumb", {
        headers: { "User-Agent": UA, Cookie: cookie },
      });
      if (!crumbRes.ok) return null;
      const crumb = (await crumbRes.text()).trim();
      if (!crumb || crumb.includes("<")) return null;
      authSession = { cookie, crumb, at: Date.now() };
      return authSession;
    } catch {
      return null;
    } finally {
      authInflight = null;
    }
  })();
  return authInflight;
}

export async function fetchYahooQuoteSummary(
  symbol: string,
  modules: string,
): Promise<Response> {
  const base = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${encodeURIComponent(modules)}`;

  const attempt = async (auth: { cookie: string; crumb: string } | null): Promise<Response> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    try {
      const url = auth ? `${base}&crumb=${encodeURIComponent(auth.crumb)}` : base;
      return await fetch(url, {
        headers: { "User-Agent": UA, ...(auth ? { Cookie: auth.cookie } : {}) },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  };

  let res = await attempt(null);
  if (res.status === 401 || res.status === 403 || res.status === 429) {
    const auth = await getYahooAuthSession();
    if (auth) res = await attempt(auth);
  }
  return res;
}
