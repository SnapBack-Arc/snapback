"use client";

import { useState } from "react";
import ConfirmAction from "@/components/admin/ConfirmAction";

export default function InsurancePoolForm() {
  const [direction, setDirection] = useState<"top_up" | "withdraw">("top_up");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");

  const amountUsdc = Number(amount);
  const valid = amount.trim() !== "" && amountUsdc > 0 && reason.trim() !== "";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={direction}
        onChange={(e) => setDirection(e.target.value as "top_up" | "withdraw")}
        className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-200"
      >
        <option value="top_up">Top up</option>
        <option value="withdraw">Withdraw</option>
      </select>
      <input
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="Amount USDC"
        inputMode="decimal"
        className="w-28 rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-100 outline-none focus:border-emerald-500"
      />
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason"
        className="w-48 rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-100 outline-none focus:border-emerald-500"
      />
      {valid ? (
        <ConfirmAction
          label={direction === "top_up" ? "Top up" : "Withdraw"}
          confirmLabel={`${direction === "top_up" ? "add" : "remove"} ${amount} USDC ${
            direction === "top_up" ? "to" : "from"
          } the insurance pool allocation`}
          url="/api/admin/insurance-pool/adjust"
          body={{ direction, amount_usdc: amountUsdc, reason: reason.trim() }}
          onDone={() => {
            setAmount("");
            setReason("");
          }}
        />
      ) : (
        <button
          type="button"
          disabled
          className="cursor-not-allowed rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-600"
        >
          {direction === "top_up" ? "Top up" : "Withdraw"}
        </button>
      )}
    </div>
  );
}
