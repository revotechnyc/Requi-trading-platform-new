/** When true, /app exposes Intelligence + Autonomous only — other routes redirect home. */
export const intelligenceOnlyMode =
  import.meta.env.VITE_INTELLIGENCE_ONLY === "true" ||
  import.meta.env.VITE_INTELLIGENCE_ONLY === "1";

const PREVIEW_NAV_PATHS = new Set(["/app", "/app/autonomous"]);

export function isPreviewNavItem(to: string): boolean {
  return PREVIEW_NAV_PATHS.has(to);
}
