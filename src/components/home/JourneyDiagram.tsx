type NodeProps = {
  x: number;
  y: number;
  w: number;
  h: number;
  fill: string;
  stroke: string;
  textColor?: string;
  children: string;
  fontSize?: number;
};

function NodeBox({ x, y, w, h, fill, stroke, textColor = "#fafafa", children, fontSize = 11 }: NodeProps) {
  return (
    <>
      <rect x={x} y={y} width={w} height={h} rx={10} fill={fill} stroke={stroke} strokeWidth={1.5} />
      <foreignObject x={x} y={y} width={w} height={h}>
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            padding: "6px 10px",
            fontSize,
            lineHeight: 1.3,
            color: textColor,
            fontFamily: "inherit",
          }}
        >
          {children}
        </div>
      </foreignObject>
    </>
  );
}

function DiamondNode({
  cx,
  cy,
  hw,
  hh,
  fill,
  stroke,
  children,
}: {
  cx: number;
  cy: number;
  hw: number;
  hh: number;
  fill: string;
  stroke: string;
  children: string;
}) {
  const points = `${cx},${cy - hh} ${cx + hw},${cy} ${cx},${cy + hh} ${cx - hw},${cy}`;
  return (
    <>
      <polygon points={points} fill={fill} stroke={stroke} strokeWidth={1.5} />
      <foreignObject x={cx - hw + 20} y={cy - hh / 1.6} width={hw * 2 - 40} height={hh * 1.25}>
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            fontSize: 11,
            lineHeight: 1.25,
            fontWeight: 600,
            color: "#fafafa",
          }}
        >
          {children}
        </div>
      </foreignObject>
    </>
  );
}

function Label({ x, y, color, children }: { x: number; y: number; color: string; children: string }) {
  return (
    <text x={x} y={y} fontSize={10} fontWeight={600} fill={color} textAnchor="middle">
      {children}
    </text>
  );
}

const GREEN = "#10b981";
const GREEN_FILL = "#10b98126";
const CYAN = "#22d3ee";
const CYAN_FILL = "#22d3ee1f";
const INDIGO = "#6366f1";
const INDIGO_FILL = "#6366f126";
const AMBER = "#f59e0b";
const AMBER_FILL = "#f59e0b1f";
const NEUTRAL = "#71717a";
const NEUTRAL_FILL = "#71717a1f";

/**
 * Buyer's real journey through SnapBack's escrow/dispute system, verified
 * against the actual tier-1/tier-2 judge-panel logic (src/lib/disputes) —
 * tier-1 requires a UNANIMOUS vote among 3 judges, not 2-of-3; a split
 * escalates to a fresh 5-judge tier-2 panel that decides by majority.
 */
export default function JourneyDiagram() {
  return (
    <svg
      viewBox="0 0 500 860"
      className="w-full max-w-md"
      role="img"
      aria-label="Diagram of a buyer's journey: commission a task, AI validator review, approval or dispute, judge-panel voting, and automatic refund or payout."
    >
      <defs>
        <marker id="arrowNeutral" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill={NEUTRAL} />
        </marker>
        <marker id="arrowGreen" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill={GREEN} />
        </marker>
        <marker id="arrowAmber" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill={AMBER} />
        </marker>
      </defs>

      {/* 1. Buyer commissions a task */}
      <NodeBox x={130} y={20} w={220} h={82} fill={GREEN_FILL} stroke={GREEN}>
        Buyer commissions a task — pays one quote (small fee, protection built in)
      </NodeBox>
      <line x1={240} y1={102} x2={240} y2={214} stroke={NEUTRAL} strokeWidth={1.5} markerEnd="url(#arrowNeutral)" />

      {/* 2. AI Validator checks the delivery */}
      <NodeBox x={130} y={128} w={220} h={66} fill={CYAN_FILL} stroke={CYAN}>
        AI Validator checks the delivery — automatic, no human
      </NodeBox>

      {/* 3. Decision: Approved / Rejected */}
      <DiamondNode cx={240} cy={262} hw={100} hh={46} fill={INDIGO_FILL} stroke={INDIGO}>
        Approved?
      </DiamondNode>

      {/* Approved branch -> seller paid, contest window */}
      <polyline
        points="140,262 95,262 95,348"
        fill="none"
        stroke={GREEN}
        strokeWidth={1.5}
        markerEnd="url(#arrowGreen)"
      />
      <Label x={148} y={252} color={GREEN}>Approved</Label>
      <NodeBox x={5} y={350} w={180} h={86} fill={GREEN_FILL} stroke={GREEN}>
        Seller paid automatically (buyer still has a window to contest)
      </NodeBox>

      {/* Rejected branch -> judge panel */}
      <polyline
        points="340,262 385,262 385,348"
        fill="none"
        stroke={AMBER}
        strokeWidth={1.5}
        markerEnd="url(#arrowAmber)"
      />
      <Label x={340} y={252} color={AMBER}>Rejected</Label>

      {/* 4. Three AI judges vote, must be unanimous */}
      <NodeBox x={285} y={350} w={200} h={66} fill={CYAN_FILL} stroke={CYAN}>
        3 independent AI judges vote — must be UNANIMOUS
      </NodeBox>
      <line x1={385} y1={416} x2={385} y2={438} stroke={NEUTRAL} strokeWidth={1.5} markerEnd="url(#arrowNeutral)" />

      {/* 5. Decision: Unanimous? */}
      <DiamondNode cx={385} cy={484} hw={100} hh={46} fill={INDIGO_FILL} stroke={INDIGO}>
        Unanimous?
      </DiamondNode>

      {/* Unanimous -> straight to verdict, bypassing tier-2 */}
      <polyline
        points="285,484 240,484 240,658"
        fill="none"
        stroke={GREEN}
        strokeWidth={1.5}
        markerEnd="url(#arrowNeutral)"
      />
      <Label x={230} y={474} color={GREEN}>Unanimous</Label>

      {/* Split -> escalates to fresh 5-judge tier-2 panel */}
      <polyline
        points="385,530 385,554"
        fill="none"
        stroke={AMBER}
        strokeWidth={1.5}
        markerEnd="url(#arrowAmber)"
      />
      <Label x={430} y={520} color={AMBER}>Split</Label>

      <NodeBox x={285} y={556} w={200} h={72} fill={AMBER_FILL} stroke={AMBER}>
        Escalates to a fresh 5-judge panel — majority decides
      </NodeBox>
      <polyline
        points="385,628 385,650 240,650 240,658"
        fill="none"
        stroke={NEUTRAL}
        strokeWidth={1.5}
        markerEnd="url(#arrowNeutral)"
      />

      {/* 6. Verdict is always automatic */}
      <NodeBox x={140} y={660} w={200} h={72} fill={NEUTRAL_FILL} stroke={NEUTRAL}>
        Verdict is always automatic — no human ever clicks approve
      </NodeBox>
      <polyline points="240,732 240,752 140,752 140,770" fill="none" stroke={GREEN} strokeWidth={1.5} markerEnd="url(#arrowGreen)" />
      <polyline points="240,732 240,752 340,752 340,770" fill="none" stroke={NEUTRAL} strokeWidth={1.5} markerEnd="url(#arrowNeutral)" />
      <Label x={150} y={758} color={GREEN}>Buyer wins</Label>
      <Label x={335} y={758} color={NEUTRAL}>Seller wins</Label>

      {/* 7. Buyer wins -> refunded automatically */}
      <NodeBox x={40} y={772} w={200} h={62} fill={GREEN_FILL} stroke={GREEN}>
        Buyer wins → refunded automatically
      </NodeBox>

      {/* 8. Seller wins -> payment stands */}
      <NodeBox x={240} y={772} w={200} h={62} fill={NEUTRAL_FILL} stroke={NEUTRAL}>
        Seller wins → payment stands
      </NodeBox>
    </svg>
  );
}
