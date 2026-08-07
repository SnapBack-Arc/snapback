"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { DEMO_TEST_ACCOUNT_EMAIL, DEMO_ADMIN_ACCOUNT_EMAIL } from "@/lib/demo/config";

type Phase = "idle" | "sending" | "awaiting_otp" | "finishing";
type DemoPersona = "test" | "new" | "admin";
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

type DemoOption = {
  key: string;
  persona: DemoPersona;
  email: string;
  label: string;
  destination: string;
};

// Two distinct real demo accounts, each with its own real Circle wallet
// (see lib/demo/seed.ts). testAccount is a normal (non-admin) wallet with
// seeded nanopayment/task history; adminAccount's only job is sitting on the
// ADMIN_WALLET_ADDRESSES allowlist so requireAdmin() actually lets it into
// /admin — same gate a real admin wallet goes through, not a UI-only shortcut.
const DEMO_ACCOUNTS: DemoOption[] = [
  {
    key: "test",
    persona: "test",
    email: DEMO_TEST_ACCOUNT_EMAIL,
    label: DEMO_TEST_ACCOUNT_EMAIL,
    destination: "/dash",
  },
  {
    key: "admin",
    persona: "admin",
    email: DEMO_ADMIN_ACCOUNT_EMAIL,
    label: DEMO_ADMIN_ACCOUNT_EMAIL,
    destination: "/admin/system",
  },
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
  const [demoSelection, setDemoSelection] = useState<string>("");
  const [demoOption, setDemoOption] = useState<DemoOption | null>(null);
  const [demoPhase, setDemoPhase] = useState<DemoPhase>("idle");
  // Demo mode's third "option": switches away from the demo dropdown to the
  // real email-OTP + PIN-setup flow below, still under DEMO_MODE.
  const [showEmailSignup, setShowEmailSignup] = useState(false);

  const busy = phase === "sending" || phase === "finishing";

  function selectDemoAccount(key: string) {
    const option = DEMO_ACCOUNTS.find((a) => a.key === key);
    if (!option) return;
    setError(null);
    setDemoSelection(key);
    setDemoOption(option);
    setDemoPhase("sending");
    // Purely cosmetic beat mirroring the real flow's brief "Sending code…"
    // moment before the OTP entry step appears — no network call here.
    setTimeout(() => setDemoPhase("otp"), 700);
  }

  function cancelDemoOtp() {
    setDemoPhase("idle");
    setDemoOption(null);
    setDemoSelection("");
  }

  async function confirmDemoOtp() {
    if (!demoOption) return;
    setDemoPhase("confirming");
    try {
      const res = await fetch("/api/auth/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ persona: demoOption.persona }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Demo login failed");
      router.push(demoOption.destination);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Demo login failed");
      setDemoPhase("idle");
      setDemoOption(null);
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
          console.error("[diag] onLoginComplete err (full):", JSON.stringify(err, Object.getOwnPropertyNames(err || {})));
          (window as any).__lastOtpErr = err;
          setError(err?.message ?? "OTP verification failed");
          setPhase("idle");
          return;
        }
        setPhase("finishing");
        const userToken = result.userToken;
        const res = await fetch("/api/auth/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: cleanEmail, userToken }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(body.error ?? "Could not create session");
          setPhase("idle");
          return;
        }

        // New user, no wallet yet: Circle returned a PIN-setup challenge.
        // Complete it in the hosted UI, then persist the resulting wallet.
        if (body.challengeId) {
          const sdkInstance = sdkRef.current as {
            execute: (
              challengeId: string,
              onCompleted?: (
                execErr: { message?: string } | undefined,
                execResult: { status?: string } | undefined,
              ) => void,
            ) => void;
          } | null;

          sdkInstance?.execute(body.challengeId, async (execErr, execResult) => {
            if (execErr || execResult?.status !== "COMPLETE") {
              setError(execErr?.message ?? "PIN setup was not completed");
              setPhase("idle");
              return;
            }
            const walletRes = await fetch("/api/auth/wallet-complete", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ userToken }),
            });
            if (!walletRes.ok) {
              const walletBody = await walletRes.json().catch(() => ({}));
              setError(walletBody.error ?? "Could not finish wallet setup");
              setPhase("idle");
              return;
            }
            router.push("/dash");
            router.refresh();
          });
          return;
        }

        router.push("/dash");
        router.refresh();
      };

      const sdk = new W3SSdk({ appSettings: { appId: APP_ID } }, onLoginComplete);
      sdkRef.current = sdk;

      const deviceId = await sdk.getDeviceId();
      // TEMP DIAGNOSTIC
      console.log("[diag] deviceId:", deviceId);
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
      // TEMP DIAGNOSTIC
      console.log("[diag] deviceToken:", deviceToken?.slice(0, 20), "len:", deviceToken?.length);
      console.log(
        "[diag] deviceEncryptionKey:",
        deviceEncryptionKey?.slice(0, 20),
        "len:",
        deviceEncryptionKey?.length,
      );
      console.log("[diag] otpToken:", otpToken?.slice(0, 20), "len:", otpToken?.length);

      const updateConfigsArg = {
        appSettings: { appId: APP_ID },
        loginConfigs: { deviceToken, deviceEncryptionKey, otpToken },
      };
      // TEMP DIAGNOSTIC
      console.log("[diag] updateConfigs arg:", {
        appSettings: updateConfigsArg.appSettings,
        loginConfigs: {
          deviceToken: deviceToken?.slice(0, 20),
          deviceEncryptionKey: deviceEncryptionKey?.slice(0, 20),
          otpToken: otpToken?.slice(0, 20),
        },
      });
      sdk.updateConfigs(updateConfigsArg, onLoginComplete);
      // TEMP DIAGNOSTIC
      console.log("[diag] sdk.configs after updateConfigs:", (sdk as any).configs ?? sdk);

      setPhase("awaiting_otp");
      // TEMP DIAGNOSTIC
      console.log("[diag] about to call verifyOtp");
      // Opens Circle's hosted OTP entry modal; onLoginComplete fires on success.
      sdk.verifyOtp();
    } catch (err) {
      console.error("Login failed - raw error:", err);
      (window as any).__lastLoginError = err;
      const message = err instanceof Error
        ? err.message
        : (typeof err === "object" && err !== null && "message" in err)
          ? String((err as any).message)
          : JSON.stringify(err);
      setError(message || "Login failed");
      setPhase("idle");
    }
  }

  if (DEMO_MODE && (demoPhase === "otp" || demoPhase === "confirming") && demoOption) {
    return (
      <DemoOtpScreen
        email={demoOption.email}
        confirming={demoPhase === "confirming"}
        onConfirm={confirmDemoOtp}
        onCancel={cancelDemoOtp}
      />
    );
  }

  return (
    <div className="w-full max-w-sm space-y-8">
      <div className="space-y-6 rounded-2xl border border-[#ffffff1c] bg-[#111113cc] p-8 shadow-2xl backdrop-blur-[24px]">
        <div className="flex flex-col items-center space-y-4 text-center">
          <LogoMark />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-[#fafafa]">
              Snap<span className="text-[#10b981]">Back</span>
            </h1>
            <p className="mt-2 text-sm text-[#a1a1aa]">
              Payment insurance for agent-to-agent work. Sign in to manage your coverage.
            </p>
          </div>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="email"
              className="text-xs font-medium uppercase tracking-widest text-[#71717a]"
            >
              {DEMO_MODE ? "Select account" : "Email"}
            </label>
            {DEMO_MODE && !showEmailSignup ? (
              <select
                id="email"
                required
                value={demoSelection}
                onChange={(e) => {
                  const value = e.target.value;
                  if (!value) return;
                  if (value === "signup") {
                    setDemoSelection("");
                    setShowEmailSignup(true);
                    return;
                  }
                  selectDemoAccount(value);
                }}
                disabled={demoPhase !== "idle"}
                className="w-full rounded-xl border border-[#3f3f46] bg-[#18181b] px-3 py-2.5 text-sm text-[#fafafa] outline-none transition focus:border-[#10b981] disabled:opacity-60 font-[family-name:var(--font-app-mono)]"
              >
                <option value="" disabled>
                  {demoPhase === "sending" ? "Sending code…" : "Select a demo account"}
                </option>
                {DEMO_ACCOUNTS.map((account) => (
                  <option key={account.key} value={account.key}>
                    {account.label}
                  </option>
                ))}
                <option value="signup">Sign up with email</option>
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
                className="w-full rounded-xl border border-[#3f3f46] bg-[#18181b] px-3 py-2.5 text-[#fafafa] outline-none transition focus:border-[#10b981] disabled:opacity-60"
              />
            )}
          </div>

          {DEMO_MODE && !showEmailSignup ? (
            <p className="text-xs text-[#71717a]">
              Demo mode: selecting an account walks through the same sign-in flow with a
              pre-filled verification code — no real email required.
            </p>
          ) : (
            <>
              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-xl bg-[#10b981] px-4 py-2.5 font-semibold text-[#052e1f] transition hover:bg-[#34d399] disabled:cursor-not-allowed disabled:opacity-60"
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
                <p className="text-xs text-[#a1a1aa]">
                  A one-time code was emailed to you. Enter it in the Circle popup to
                  finish signing in.
                </p>
              )}

              {(phase === "awaiting_otp" || phase === "finishing") && (
                <button
                  type="button"
                  onClick={() => {
                    setPhase("idle");
                    setError(null);
                  }}
                  className="text-xs text-[#71717a] hover:text-[#a1a1aa]"
                >
                  Cancel and try again
                </button>
              )}

              {DEMO_MODE && (
                <button
                  type="button"
                  onClick={() => {
                    setShowEmailSignup(false);
                    setError(null);
                    setPhase("idle");
                  }}
                  className="text-xs text-[#71717a] hover:text-[#a1a1aa]"
                >
                  ← Use a demo account instead
                </button>
              )}
            </>
          )}
          {error && (
            <p className="rounded-lg border border-[#7f1d1d77] bg-[#450a0a66] px-3 py-2 text-sm text-[#f87171]">
              {error}
            </p>
          )}
        </form>
      </div>

      <ArcFooter />
    </div>
  );
}

function LogoMark() {
  return (
    <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#ffffff14] bg-[#10b981]/10">
      <svg
        viewBox="0 0 24 24"
        className="h-6 w-6"
        fill="none"
        stroke="#10b981"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" />
        <path d="M9 12l2 2 4-4" />
      </svg>
    </div>
  );
}

/**
 * Stand-in for Circle's hosted OTP popup, used only for the demo account(s)
 * in DEMO_ACCOUNTS (see selectDemoAccount/confirmDemoOtp above). The code
 * shown is fixed and never actually checked anywhere — /api/auth/demo
 * bypasses real OTP entirely — this exists purely so the demo walks
 * through the same send-code / enter-code / confirm beats as a real login.
 */
function DemoOtpScreen({
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
    <div className="w-full max-w-sm space-y-8">
      <h1 className="text-center text-2xl font-semibold tracking-tight">
        <span className="text-[#71717a]">Snap</span>
        <span className="text-[#10b981]">Back</span>
      </h1>

      <div className="space-y-6 rounded-2xl border border-[#ffffff1c] bg-[#111113cc] p-8 shadow-2xl backdrop-blur-[24px]">
        <div className="space-y-1 text-center">
          <h2 className="text-lg font-semibold text-[#fafafa]">Enter verification code</h2>
          <p className="text-sm text-[#a1a1aa]">
            We sent a 6-digit code to{" "}
            <span className="font-[family-name:var(--font-app-mono)] text-[#fafafa]">
              {email}
            </span>
            .
          </p>
        </div>

        <div className="flex justify-center gap-2">
          {MOCK_OTP_DIGITS.map((digit, i) => (
            <div
              key={i}
              className="flex h-12 w-10 items-center justify-center rounded-xl border border-[#ffffff14] bg-[#18181b73] font-[family-name:var(--font-app-mono)] text-lg text-[#fafafa] backdrop-blur-[28px]"
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
            className="flex-1 rounded-xl border border-[#3f3f46] px-4 py-2.5 text-sm font-medium text-[#a1a1aa] transition hover:bg-[#ffffff0a] disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={confirming}
            className="flex-1 rounded-xl bg-[#10b981] px-4 py-2.5 text-sm font-semibold text-[#052e1f] transition hover:bg-[#34d399] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {confirming ? "Signing in…" : "Confirm"}
          </button>
        </div>
      </div>

      <ArcFooter />
    </div>
  );
}

function ArcFooter() {
  return (
    <div className="space-y-6 text-center">
      <p className="text-xs text-[#52525b]">
        Powered by Circle User-Controlled Wallets · Arc Testnet
      </p>
      {/*
        Official Arc "Built on" badge — white lockup (public/arc-logo-white.png,
        from Circle's own Arc_Logos.zip brand asset kit), the correct variant for
        this page's dark background. Unmodified, undistorted (width/height
        preserve the source's exact 500:171 aspect ratio), rendered at 52px
        height (above the 50px minimum, kept close to the floor and
        monochrome/muted so it stays secondary to the SnapBack wordmark above).
        space-y-6 above gives it ~24px of clear space from the text line, and
        nothing else sits beside or below it, comfortably clearing Arc's "1x
        inner-arch-height" clear-space rule on every side.
      */}
      <div className="flex justify-center">
        <Image src="/arc-logo-white.png" alt="Built on Arc" width={152} height={52} priority />
      </div>
    </div>
  );
}
