"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DEMO_TEST_ACCOUNT_EMAIL } from "@/lib/demo/config";

type Phase = "idle" | "sending" | "awaiting_otp" | "finishing";
type DemoPersona = "test" | "new";
/** Mirrors the real flow's sending -> awaiting_otp -> finishing beats. */
type DemoPhase = "idle" | "sending" | "otp" | "confirming";

const APP_ID = process.env.NEXT_PUBLIC_CIRCLE_APP_ID;
const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

// Cosmetic only — never actually verified anywhere. Demo accounts bypass
// real Circle OTP entirely via /api/auth/demo (see that route and
// lib/demo/*); this just walks the UI through the same send-code ->
// enter-code -> confirm beats as the real flow, pre-filled, so the demo
// reads as a working login rather than a shortcut.
const MOCK_OTP_DIGITS = ["4", "8", "2", "9", "1", "3"];

// testAccount only — this is the live demo walkthrough's single account.
// newAccount@snapback.com (new-user onboarding/wallet-generation) still
// exists in full behind this: /api/auth/demo, resetDemoNewAccount(), and
// the real wallet-generation flow it triggers are all untouched. It's just
// not offered here — a freshly-generated, unfunded wallet has nothing to
// show in a live walkthrough. See README's demo-mode section for why.
const DEMO_ACCOUNTS: { value: DemoPersona; email: string; description: string }[] = [
  { value: "test", email: DEMO_TEST_ACCOUNT_EMAIL, description: "existing activity" },
];

export default function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  // Keep the SDK instance across the async OTP flow.
  const sdkRef = useRef<unknown>(null);

  // Demo mode only — the email field becomes a dropdown of DEMO_ACCOUNTS
  // instead of free text. Kept as separate state from `email` so the
  // real-OTP path above is untouched either way.
  const [demoSelection, setDemoSelection] = useState<DemoPersona | "">("");
  const [demoPersona, setDemoPersona] = useState<DemoPersona | null>(null);
  const [demoPhase, setDemoPhase] = useState<DemoPhase>("idle");

  const busy = phase === "sending" || phase === "finishing";

  function selectDemoAccount(persona: DemoPersona) {
    setError(null);
    setDemoSelection(persona);
    setDemoPersona(persona);
    setDemoPhase("sending");
    // Purely cosmetic beat mirroring the real flow's brief "Sending code…"
    // moment before the OTP entry step appears — no network call here.
    setTimeout(() => setDemoPhase("otp"), 700);
  }

  function cancelDemoOtp() {
    setDemoPhase("idle");
    setDemoPersona(null);
    setDemoSelection("");
  }

  async function confirmDemoOtp() {
    if (!demoPersona) return;
    setDemoPhase("confirming");
    try {
      const res = await fetch("/api/auth/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ persona: demoPersona }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Demo login failed");
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Demo login failed");
      setDemoPhase("idle");
      setDemoPersona(null);
      // Reset back to the placeholder so re-selecting the same option (which
      // wouldn't otherwise fire a change event) can retry.
      setDemoSelection("");
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!APP_ID) {
      setError("NEXT_PUBLIC_CIRCLE_APP_ID is not set.");
      return;
    }
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) return;

    try {
      setPhase("sending");
      // Load the web SDK in the browser only.
      const { W3SSdk } = await import("@circle-fin/w3s-pw-web-sdk");

      // Param types are structural supertypes of the SDK's callback signature
      // (its Error type lacks `name`, so plain `Error` isn't assignable).
      const onLoginComplete = async (
        err: { message?: string } | undefined,
        result: { userToken?: string } | undefined,
      ) => {
        if (err || !result?.userToken) {
          setError(err?.message ?? "OTP verification failed");
          setPhase("idle");
          return;
        }
        setPhase("finishing");
        const res = await fetch("/api/auth/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: cleanEmail, userToken: result.userToken }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError(body.error ?? "Could not create session");
          setPhase("idle");
          return;
        }
        router.push("/dashboard");
        router.refresh();
      };

      const sdk = new W3SSdk({ appSettings: { appId: APP_ID } }, onLoginComplete);
      sdkRef.current = sdk;

      const deviceId = await sdk.getDeviceId();
      const res = await fetch("/api/auth/device-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: cleanEmail, deviceId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to start login");
      }
      const { deviceToken, deviceEncryptionKey, otpToken } = await res.json();

      sdk.updateConfigs(
        {
          appSettings: { appId: APP_ID },
          loginConfigs: { deviceToken, deviceEncryptionKey, otpToken },
        },
        onLoginComplete,
      );

      setPhase("awaiting_otp");
      // Opens Circle's hosted OTP entry modal; onLoginComplete fires on success.
      sdk.verifyOtp();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
      setPhase("idle");
    }
  }

  return (
    <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4">
      <div className="space-y-1">
        <label htmlFor="email" className="text-sm font-medium text-zinc-300">
          Email
        </label>
        {DEMO_MODE ? (
          <select
            id="email"
            required
            value={demoSelection}
            onChange={(e) => {
              const persona = e.target.value as DemoPersona | "";
              if (persona) selectDemoAccount(persona);
            }}
            disabled={demoPhase !== "idle"}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-100 outline-none focus:border-emerald-500 disabled:opacity-60"
          >
            <option value="" disabled>
              {demoPhase === "sending" ? "Sending code…" : "Select a demo account"}
            </option>
            {DEMO_ACCOUNTS.map((account) => (
              <option key={account.value} value={account.value}>
                {account.email} — {account.description}
              </option>
            ))}
          </select>
        ) : (
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            disabled={busy}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-100 outline-none focus:border-emerald-500 disabled:opacity-60"
          />
        )}
      </div>

      {DEMO_MODE ? (
        <p className="text-xs text-zinc-500">
          Demo mode: selecting an account walks through the same sign-in flow with a pre-filled verification code — no real email required.
        </p>
      ) : (
        <>
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-emerald-500 px-4 py-2 font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {phase === "sending"
              ? "Sending code…"
              : phase === "awaiting_otp"
                ? "Enter the code in the popup"
                : phase === "finishing"
                  ? "Signing in…"
                  : "Continue with email"}
          </button>

          {phase === "awaiting_otp" && (
            <p className="text-xs text-zinc-400">
              A one-time code was emailed to you. Enter it in the Circle popup to
              finish signing in.
            </p>
          )}
        </>
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}

      {DEMO_MODE && (demoPhase === "otp" || demoPhase === "confirming") && demoPersona && (
        <DemoOtpDialog
          email={DEMO_ACCOUNTS.find((a) => a.value === demoPersona)?.email ?? ""}
          confirming={demoPhase === "confirming"}
          onConfirm={confirmDemoOtp}
          onCancel={cancelDemoOtp}
        />
      )}
    </form>
  );
}

/**
 * Stand-in for Circle's hosted OTP popup, used only for the demo account(s)
 * in DEMO_ACCOUNTS (see selectDemoAccount/confirmDemoOtp above). The code
 * shown is fixed and never actually checked anywhere — /api/auth/demo
 * bypasses real OTP entirely — this exists purely so the demo walks
 * through the same send-code / enter-code / confirm beats as a real login.
 */
function DemoOtpDialog({
  email,
  confirming,
  onConfirm,
  onCancel,
}: {
  email: string;
  confirming: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm space-y-4 rounded-xl border border-zinc-800 bg-zinc-900 p-6">
        <div>
          <h2 className="text-lg font-semibold text-white">Enter verification code</h2>
          <p className="mt-1 text-sm text-zinc-400">
            We sent a 6-digit code to <span className="text-zinc-200">{email}</span>.
          </p>
        </div>

        <div className="flex justify-center gap-2">
          {MOCK_OTP_DIGITS.map((digit, i) => (
            <div
              key={i}
              className="flex h-12 w-10 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-950 font-mono text-lg text-zinc-100"
            >
              {digit}
            </div>
          ))}
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={confirming}
            className="flex-1 rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={confirming}
            className="flex-1 rounded-lg bg-emerald-500 px-4 py-2 font-semibold text-zinc-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {confirming ? "Signing in…" : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}
