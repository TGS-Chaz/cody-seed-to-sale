import { motion } from "framer-motion";
import {
  Sprout, Leaf, Flower2, Scissors, Package, ShieldAlert, Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PHASE_COLORS } from "./PhaseColorBadge";
import type { CcrsGrowthStage, CcrsPlantState, PlantPhase } from "@/lib/schema-enums";

/** One milestone on the timeline. */
interface Milestone {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  phaseColor: string; // key into PHASE_COLORS
  /** ISO date the plant entered this phase (past). Null if not yet reached. */
  enteredAt: string | null;
  /** ISO date estimate for future phases, computed from strain averages. */
  estimatedAt?: string | null;
  /** Whether this is the plant's current phase. */
  isCurrent: boolean;
  /** Whether we've passed this phase. */
  isPast: boolean;
}

interface PlantTimelineProps {
  /** Phase + state pair — determines which milestone is "current" and
   * whether the plant has branched to a terminal destroyed/quarantine state. */
  phase: PlantPhase | null;
  plantState: CcrsPlantState | null;
  growthStage: CcrsGrowthStage | null;
  /** Date the plant was created (entered Immature). */
  createdAt: string;
  /** Date the plant last changed phase (enters current phase here). */
  phaseChangedAt: string | null;
  /** If harvested, the harvest date. */
  harvestDate: string | null;
  /** If destroyed, the destroyed-at timestamp. */
  destroyedAt: string | null;
  /** Strain's average flower days — used to estimate future milestones. */
  averageFlowerDays: number | null;
  /** Strain's average veg days if known (falls back to 30 if not). */
  averageVegDays?: number | null;
}

const STANDARD_MILESTONES: Array<{ key: string; label: string; icon: any; phaseColor: string }> = [
  { key: "immature",   label: "Immature",   icon: Sprout,   phaseColor: "immature" },
  { key: "vegetative", label: "Vegetative", icon: Leaf,     phaseColor: "vegetative" },
  { key: "flowering",  label: "Flowering",  icon: Flower2,  phaseColor: "flowering" },
  { key: "harvested",  label: "Harvested",  icon: Scissors, phaseColor: "harvested" },
  { key: "inventory",  label: "Inventory",  icon: Package,  phaseColor: "available" },
];

function formatDate(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

/**
 * Horizontal timeline visual for a single plant.
 *
 * Past milestones render as filled circles in their phase color with the date
 * entered. The current phase pulses with "You are here" and "Day X" below.
 * Future phases render outlined with dashed lines and estimated dates pulled
 * from the strain's average flower days.
 *
 * Terminal states (Destroyed / Quarantined) branch off the main line:
 * - Destroyed: red branch with Trash icon at the current milestone
 * - Quarantined: blue branch with ShieldAlert
 */
export default function PlantTimeline({
  phase, plantState, growthStage, createdAt, phaseChangedAt,
  harvestDate, destroyedAt, averageFlowerDays, averageVegDays,
}: PlantTimelineProps) {
  // Figure out which standard key corresponds to the plant's current state
  const currentKey: string = (() => {
    if (plantState === "Destroyed") return "destroyed";
    if (plantState === "Harvested" || phase === "harvested") return "harvested";
    if (plantState === "Inventory") return "inventory";
    if (growthStage === "Flowering" || phase === "flowering") return "flowering";
    if (growthStage === "Vegetative" || phase === "vegetative") return "vegetative";
    return "immature";
  })();

  const vegDays = averageVegDays ?? 30;
  const flowerDays = averageFlowerDays ?? 63;

  // Milestone dates. Past milestones use actual dates if known; future
  // estimates stack from the most recent known event.
  const vegEnteredAt = (currentKey === "vegetative" ? phaseChangedAt : null)
    ?? (["flowering", "harvested", "inventory"].includes(currentKey) ? addDays(createdAt, vegDays) : null);
  const flowerEnteredAt = (currentKey === "flowering" ? phaseChangedAt : null)
    ?? (["harvested", "inventory"].includes(currentKey) ? (vegEnteredAt ? addDays(vegEnteredAt, vegDays) : null) : null);
  const harvestedAt = (["harvested", "inventory"].includes(currentKey) ? (harvestDate ?? phaseChangedAt) : null);

  // Future estimates (only when not yet reached)
  const estimatedFlowerAt = currentKey === "vegetative" && phaseChangedAt ? addDays(phaseChangedAt, vegDays) : null;
  const estimatedHarvestAt = (() => {
    if (currentKey === "flowering" && phaseChangedAt) return addDays(phaseChangedAt, flowerDays);
    if (currentKey === "vegetative" && estimatedFlowerAt) return addDays(estimatedFlowerAt, flowerDays);
    if (currentKey === "immature") return addDays(createdAt, vegDays + flowerDays);
    return null;
  })();

  const getPastEnteredAt = (key: string): string | null => {
    if (key === "immature") return createdAt;
    if (key === "vegetative") return vegEnteredAt;
    if (key === "flowering") return flowerEnteredAt;
    if (key === "harvested") return harvestedAt;
    return null;
  };

  const getEstimatedAt = (key: string): string | null => {
    if (key === "vegetative" && !vegEnteredAt) return addDays(createdAt, 7);
    if (key === "flowering" && !flowerEnteredAt) return estimatedFlowerAt;
    if (key === "harvested" && !harvestedAt) return estimatedHarvestAt;
    if (key === "inventory" && currentKey !== "inventory") {
      return estimatedHarvestAt ? addDays(estimatedHarvestAt, 14) : null;
    }
    return null;
  };

  const orderIndex = (k: string) => STANDARD_MILESTONES.findIndex((m) => m.key === k);
  const currentIdx = orderIndex(currentKey);

  const milestones: Milestone[] = STANDARD_MILESTONES.map((m, i) => {
    const isPast = i < currentIdx;
    const isCurrent = i === currentIdx && plantState !== "Destroyed";
    return {
      ...m,
      isPast,
      isCurrent,
      enteredAt: isPast || isCurrent ? getPastEnteredAt(m.key) : null,
      estimatedAt: !isPast && !isCurrent ? getEstimatedAt(m.key) : null,
    };
  });

  // Day counter for current phase
  const daysInCurrent = phaseChangedAt
    ? Math.floor((Date.now() - new Date(phaseChangedAt).getTime()) / 86400000)
    : Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000);

  // Branch state for Destroyed / Quarantined
  const branch: "destroyed" | "quarantined" | null =
    plantState === "Destroyed" ? "destroyed"
      : plantState === "Quarantined" ? "quarantined"
      : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
      className="relative rounded-xl border border-border bg-card p-6"
    >
      <h3 className="text-[12px] uppercase tracking-wider font-semibold text-muted-foreground mb-5">Phase Timeline</h3>

      {/* Milestone row */}
      <div className="relative">
        {/* Connecting line behind the dots */}
        <div className="absolute left-0 right-0 top-5 flex">
          {milestones.slice(0, -1).map((m, i) => {
            const next = milestones[i + 1];
            const completed = m.isPast && (next.isPast || next.isCurrent);
            return (
              <div
                key={m.key}
                className={cn(
                  "flex-1 h-0.5 mx-4",
                  completed ? "bg-primary/40" : next.isCurrent ? "bg-gradient-to-r from-primary/40 to-border" : "bg-border border-t border-dashed",
                )}
              />
            );
          })}
        </div>

        <div className="relative flex items-start justify-between gap-2">
          {milestones.map((m, i) => (
            <MilestoneDot key={m.key} milestone={m} daysInCurrent={daysInCurrent} index={i} />
          ))}
        </div>
      </div>

      {/* Terminal branch */}
      {branch && (
        <div className="mt-4 flex items-center gap-2 pt-3 border-t border-dashed border-border">
          <div
            className={cn(
              "w-8 h-8 rounded-full flex items-center justify-center",
              branch === "destroyed" ? "bg-red-500/15 text-red-500" : "bg-blue-500/15 text-blue-500",
            )}
          >
            {branch === "destroyed" ? <Trash2 className="w-4 h-4" /> : <ShieldAlert className="w-4 h-4" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-semibold text-foreground">
              {branch === "destroyed" ? "Plant destroyed" : "Plant quarantined"}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {branch === "destroyed" && destroyedAt
                ? `Recorded ${formatDate(destroyedAt)} — lineage preserved in grow_disposals for CCRS`
                : branch === "quarantined"
                  ? "Hold period in effect. Move back to Growing from the detail page when cleared."
                  : ""}
            </p>
          </div>
        </div>
      )}
    </motion.div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function MilestoneDot({ milestone, daysInCurrent, index }: { milestone: Milestone; daysInCurrent: number; index: number }) {
  const Icon = milestone.icon;
  const color = PHASE_COLORS[milestone.phaseColor] ?? PHASE_COLORS.default;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: index * 0.08, duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
      className="flex-1 flex flex-col items-center min-w-0"
    >
      {/* Circle */}
      <div className="relative">
        {milestone.isCurrent && (
          <span
            className="absolute inset-0 rounded-full animate-ping opacity-75"
            style={{ background: color.hex }}
          />
        )}
        <div
          className={cn(
            "relative w-10 h-10 rounded-full flex items-center justify-center z-10",
            milestone.isCurrent ? "ring-4 ring-offset-2 ring-offset-card" : "",
          )}
          style={{
            background: milestone.isPast || milestone.isCurrent ? color.hex : "transparent",
            border: milestone.isPast || milestone.isCurrent ? "none" : `2px dashed ${color.hex}40`,
          }}
        >
          <Icon className={cn("w-4 h-4", milestone.isPast || milestone.isCurrent ? "text-white" : "text-muted-foreground/60")} />
        </div>
      </div>
      <p
        className={cn(
          "mt-3 text-[11px] font-semibold text-center",
          milestone.isCurrent ? color.text : milestone.isPast ? "text-foreground" : "text-muted-foreground/70",
        )}
      >
        {milestone.label}
      </p>
      {milestone.isCurrent ? (
        <>
          <p className={cn("text-[10px] font-bold", color.text)}>Day {daysInCurrent}</p>
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground/80 font-medium">You are here</p>
        </>
      ) : milestone.isPast && milestone.enteredAt ? (
        <p className="text-[10px] text-muted-foreground font-mono">{formatDate(milestone.enteredAt)}</p>
      ) : milestone.estimatedAt ? (
        <p className="text-[10px] text-muted-foreground/50 italic font-mono">~{formatDate(milestone.estimatedAt)}</p>
      ) : (
        <p className="text-[10px] text-muted-foreground/40">—</p>
      )}
    </motion.div>
  );
}
