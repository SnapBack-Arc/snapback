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
        className="w-48 rounded border border-[#3f3f46] bg-[#18181b] px-2 py-1.5 text-xs text-[#fafafa] outline-none focus:border-[#10b981]"
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
          className="cursor-not-allowed rounded-lg border border-[#ffffff14] bg-[#18181b] px-3 py-1.5 text-xs font-medium text-[#52525b]"
        >
          Pause user
        </button>
      )}
    </div>
  );
}
