/** When true, /app exposes Intelligence only — other routes redirect home. */
export const intelligenceOnlyMode =
  import.meta.env.VITE_INTELLIGENCE_ONLY === "true" ||
  import.meta.env.VITE_INTELLIGENCE_ONLY === "1";
