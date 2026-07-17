export type AgentEntry = {
  role: string;
  monogram: string;
  colorClass: string;
  description: string;
};

export const AGENT_COLOR = {
  buyer: "bg-blue-500/15 text-blue-400",
  estimator: "bg-violet-500/15 text-violet-400",
  seller: "bg-emerald-500/15 text-emerald-400",
  validator: "bg-cyan-500/15 text-cyan-400",
  judges: "bg-pink-500/15 text-pink-400",
} as const;

/** Small "who's working on this" roster — one row per agent role, a
 * monogram + a one-line description of what that agent did. Makes the
 * multi-agent nature of the system visible rather than implicit. */
export default function AgentRoster({
  agents,
  title = "Agents on this task",
}: {
  agents: AgentEntry[];
  title?: string;
}) {
  if (agents.length === 0) return null;
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold text-zinc-200">{title}</h2>
      <div className="space-y-2">
        {agents.map((a, i) => (
          <div
            key={i}
            className="flex items-start gap-3 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2"
          >
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${a.colorClass}`}
            >
              {a.monogram}
            </span>
            <div>
              <div className="text-sm font-medium text-zinc-200">{a.role}</div>
              <div className="text-xs text-zinc-500">{a.description}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
