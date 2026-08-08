"use client";

import { useEffect } from "react";

/** Shared modal shell — overlay, escape-to-close, click-outside-to-close,
 *  and the header row. Used by the wallet page's Deposit/Withdraw/Swap
 *  modals (same visual pattern as the dashboard's transaction detail modal). */
export default function Modal({
  title,
  onClose,
  children,
  widthClass = "max-w-md",
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  widthClass?: string;
}) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className={`glass-card max-h-[85vh] w-full ${widthClass} overflow-y-auto bg-[#0c0c0ef2] p-6`}
      >
        <div className="mb-4 flex items-center justify-between gap-4">
          <div className="text-xs uppercase tracking-wide text-[#71717a]">{title}</div>
          <button type="button" onClick={onClose} className="text-[#71717a] hover:text-[#fafafa]" aria-label="Close">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
