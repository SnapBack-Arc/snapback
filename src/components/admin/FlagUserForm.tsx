"use client";

import { useState } from "react";
import ConfirmAction from "@/components/admin/ConfirmAction";

export default function FlagUserForm({ walletId }: { walletId: string }) {
  const [reason, setReason] = useState("");
  const valid = reason.trim() !== "";

  return (
    <div className="flex items-center gap-2">
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason for pausing"
        className="w-48 rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-100 outline-none focus:border-emerald-500"
      />
      {valid ? (
        <ConfirmAction
          label="Pause user"
          confirmLabel="pause this user — blocks new quotes, task funding, and contest filing"
          url={`/api/admin/users/${walletId}/flag`}
          body={{ reason: reason.trim() }}
          variant="danger"
        />
      ) : (
        <button
          type="button"
          disabled
          className="cursor-not-allowed rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-600"
        >
          Pause user
        </button>
      )}
    </div>
  );
}
