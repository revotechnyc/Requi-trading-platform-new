import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value && process.env.NODE_ENV === "production") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value ?? "";
}

export const env = {
  appId: required("APP_ID"),
  appSecret: required("APP_SECRET"),
  isProduction: process.env.NODE_ENV === "production",
  /** HTTP listen port — set PORT in .env (default 3000). */
  port: Number.parseInt(process.env.PORT || "3000", 10) || 3000,

  /**
   * PostgreSQL (canonical system of record; Supabase-compatible).
   * Production: DATABASE_URL = postgres://postgres:[pwd]@db.[project].supabase.co:5432/postgres
   * Local dev: unix socket via PG_SOCKET_DIR/PG_DATABASE/PG_USER (embedded Postgres).
   */
  // Only postgres:// URLs are accepted — a legacy mysql:// value injected by
  // a hosting platform is ignored so the embedded-Postgres fallback engages.
  databaseUrl: /^postgres(ql)?:\/\//.test(process.env.DATABASE_URL ?? "")
    ? (process.env.DATABASE_URL as string)
    : "",
  pgSocketDir: process.env.PG_SOCKET_DIR ?? "",
  pgDatabase: process.env.PG_DATABASE ?? "requi",
  pgUser: process.env.PG_USER ?? "postgres",

  /** Supabase Auth — when URL+anon key are set, Supabase is the identity provider. */
  supabaseUrl: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "",
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "",
  /** Server-only. NEVER exposed to the frontend. Used for admin user operations. */
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  /** HS256 legacy JWT secret (optional; JWKS from Supabase is preferred). */
  supabaseJwtSecret: process.env.SUPABASE_JWT_SECRET ?? "",

  /** Legacy Kimi OAuth — retained as the development fallback while Supabase is unconfigured. */
  kimiAuthUrl: process.env.KIMI_AUTH_URL ?? "",
  kimiOpenUrl: process.env.KIMI_OPEN_URL ?? "",
  ownerUnionId: process.env.OWNER_UNION_ID ?? "",

  /** Google Sign-In via Supabase provider (configured in the Supabase dashboard). */
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",

  /** Key that encrypts the private governance vault. MUST be set in production. */
  governanceVaultKey: process.env.GOVERNANCE_VAULT_KEY ?? "",

  /** Payments — Stripe. Webhooks are signature-verified and idempotent. */
  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
  stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY ?? "",

  /** AI providers / broker / market data / email / storage / monitoring (never hard-coded). */
  openaiApiKey: process.env.OPENAI_API_KEY ?? "",
  kimiApiKey: process.env.KIMI_API_KEY ?? "",
  robinhoodMcpToken: process.env.ROBINHOOD_MCP_TOKEN ?? "",
  marketDataApiKey: process.env.MARKET_DATA_API_KEY ?? "",
  emailFrom: process.env.EMAIL_FROM ?? "",
  emailApiKey: process.env.EMAIL_API_KEY ?? "",
  storageBucket: process.env.STORAGE_BUCKET ?? "",
  monitoringDsn: process.env.MONITORING_DSN ?? "",

  /** Comma-separated emails granted the SAAS_OWNER platform role at first sign-in. */
  platformOwnerEmails: (process.env.PLATFORM_OWNER_EMAILS ?? "")
    .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
};

export const supabaseAuthConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey);
