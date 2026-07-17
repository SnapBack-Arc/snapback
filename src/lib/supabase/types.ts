/**
 * Supabase types for SnapBack.
 *
 * `types.generated.ts` is produced from the live schema with:
 *   supabase gen types typescript --linked --schema public > src/lib/supabase/types.generated.ts
 * Regenerate it after any migration. This file re-exports it and adds concise
 * Row / Enum aliases used throughout the app.
 */
export type { Database, Json } from "./types.generated";
import type { Database } from "./types.generated";

type Tables = Database["public"]["Tables"];
type Enums = Database["public"]["Enums"];

export type UserRow = Tables["users"]["Row"];
export type WalletRow = Tables["wallets"]["Row"];
export type PolicyRow = Tables["policies"]["Row"];
export type TaskRow = Tables["tasks"]["Row"];
export type QuoteRow = Tables["quotes"]["Row"];
export type PaymentRow = Tables["payments"]["Row"];
export type DisputeRow = Tables["disputes"]["Row"];
export type JudgeVoteRow = Tables["judge_votes"]["Row"];
export type ReputationRow = Tables["reputation"]["Row"];
export type ListingRow = Tables["listings"]["Row"];
export type ValidationRow = Tables["validations"]["Row"];

export type TaskStatus = Enums["task_status"];
export type PaymentStatus = Enums["payment_status"];
export type PaymentKind = Enums["payment_kind"];
export type DisputeStatus = Enums["dispute_status"];
export type DisputeOutcome = Enums["dispute_outcome"];
export type VoteChoice = Enums["vote_choice"];
export type WalletControl = Enums["wallet_control"];
