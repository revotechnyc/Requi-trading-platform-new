import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { LogoMark } from "@/components/Brand";
import { trpc } from "@/providers/trpc";

/**
 * OAuth redirect target for Robinhood Agentic MCP.
 * Completes PKCE code exchange via tRPC, then returns to Accounts.
 */
export default function RobinhoodCallback() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const complete = trpc.trading.robinhoodMcpComplete.useMutation();
  const [message, setMessage] = useState("Connecting Robinhood Agentic MCP…");

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const error = params.get("error");
      const errorDesc = params.get("error_description");
      if (error) {
        setMessage(errorDesc || error || "Robinhood authorization was denied.");
        setTimeout(() => navigate("/app/accounts", { replace: true }), 2500);
        return;
      }

      const code = params.get("code");
      const state = params.get("state");
      if (!code || !state) {
        setMessage("Missing OAuth code/state — start Connect again from Accounts.");
        setTimeout(() => navigate("/app/accounts", { replace: true }), 2500);
        return;
      }

      try {
        const res = await complete.mutateAsync({ code, state });
        if (cancelled) return;
        setMessage(res.lastHealthDetail ?? "Robinhood connected. Returning to Accounts…");
        setTimeout(() => navigate("/app/accounts", { replace: true }), 900);
      } catch (err) {
        console.error("[robinhood/callback]", err);
        if (cancelled) return;
        setMessage(err instanceof Error ? err.message : "Robinhood connect failed.");
        setTimeout(() => navigate("/app/accounts", { replace: true }), 2800);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, []);

  return (
    <div className="grid min-h-screen place-items-center bg-background px-5">
      <div className="flex max-w-sm flex-col items-center gap-4 text-center">
        <LogoMark className="h-12 w-12 animate-pulse" />
        <p className="text-sm text-slate-600">{message}</p>
        <Link to="/app/accounts" className="text-sm font-medium text-sky-600 hover:underline">
          Back to Accounts
        </Link>
      </div>
    </div>
  );
}
