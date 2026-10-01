/** When true, /app exposes Intelligence (+ gated tabs) only — other routes redirect home. */
export const intelligenceOnlyMode =
  import.meta.env.VITE_INTELLIGENCE_ONLY === "true" ||
  import.meta.env.VITE_INTELLIGENCE_ONLY === "1";

/** Temporary static allowlist — Autonomous + Accounts visible only to these emails. */
const AUTONOMOUS_ACCOUNTS_ALLOWED_EMAILS = new Set(["test1@yopmail.com"]);

export function canAccessAutonomousAndAccounts(email?: string | null): boolean {
  if (!email) return false;
  return AUTONOMOUS_ACCOUNTS_ALLOWED_EMAILS.has(email.trim().toLowerCase());
}

const PREVIEW_NAV_PATHS = new Set(["/app", "/app/autonomous", "/app/accounts"]);

export function isPreviewNavItem(to: string): boolean {
  return PREVIEW_NAV_PATHS.has(to);
}

/** Sidebar visibility — email-gates Autonomous/Accounts; respects preview mode. */
export function isNavItemVisible(to: string, email?: string | null): boolean {
  if (to === "/app/autonomous" || to === "/app/accounts") {
    if (!canAccessAutonomousAndAccounts(email)) return false;
  }
  if (intelligenceOnlyMode) return isPreviewNavItem(to);
  return true;
}
