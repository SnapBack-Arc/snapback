"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Phase = "idle" | "sending" | "awaiting_otp" | "finishing";

const APP_ID = process.env.NEXT_PUBLIC_CIRCLE_APP_ID;

export default function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  // Keep the SDK instance across the async OTP flow.
  const sdkRef = useRef<unknown>(null);

  const busy = phase === "sending" || phase === "finishing";

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
      </div>

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
      {error && <p className="text-sm text-red-400">{error}</p>}
    </form>
  );
}
