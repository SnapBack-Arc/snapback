"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import Modal from "@/components/Modal";
import CopyButton from "@/components/CopyButton";
import { shortAddress } from "@/lib/format";

/**
 * The real "receive funds" flow — separate from "Send to Gateway" (which
 * locks USDC into Circle's Gateway contract, a different action entirely
 * that used to be mislabeled "Deposit"). This modal needs nothing beyond
 * the wallet's own address: real QR code, real address, real network name.
 */
export default function ReceiveModal({ address, onClose }: { address: string; onClose: () => void }) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(address, { width: 240, margin: 1, color: { dark: "#0c0c0e", light: "#fafafa" } })
      .then((url) => {
        if (active) setQrDataUrl(url);
      })
      .catch(() => {
        if (active) setQrDataUrl(null);
      });
    return () => {
      active = false;
    };
  }, [address]);

  return (
    <Modal title="Deposit" onClose={onClose}>
      <div className="flex flex-col items-center gap-4">
        <div className="flex h-[240px] w-[240px] items-center justify-center rounded-xl bg-[#fafafa] p-3">
          {qrDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- data: URL, no next/image benefit
            <img src={qrDataUrl} alt="Wallet address QR code" width={216} height={216} />
          ) : (
            <span className="text-xs text-[#71717a]">Generating…</span>
          )}
        </div>

        <div className="w-full">
          <div className="mb-1 text-xs uppercase tracking-wide text-[#71717a]">Arc Testnet address</div>
          <div className="flex items-center justify-between gap-3 rounded-lg border border-[#ffffff14] bg-[#18181b73] px-3 py-2.5">
            <span className="truncate font-mono text-sm text-[#fafafa]" title={address}>
              {shortAddress(address)}
            </span>
            <CopyButton value={address} label="Copy address" />
          </div>
        </div>

        <div className="w-full rounded-lg border border-[#ffffff14] bg-[#18181b73] px-3 py-2.5 text-xs text-[#a1a1aa]">
          Network: <span className="text-[#fafafa]">Arc Testnet</span> — only send assets on Arc Testnet to this
          address. Assets sent on another network cannot be recovered.
        </div>
      </div>
    </Modal>
  );
}
