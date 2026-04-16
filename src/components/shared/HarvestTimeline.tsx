import { motion } from "framer-motion";
import {
  Scissors, Gauge, Wind, Beaker, Timer, CheckCircle2, Package,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Harvest } from "@/hooks/useHarvests";

type StepKey =
  | "harvested"
  | "wet_weighed"
  | "drying"
  | "dry_weighed"
  | "curing"
  | "cured"
  | "inventory";

interface Step {
  key: StepKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Tailwind color classes — which phase's palette this step inherits. */
  color: string;
  bgColor: string;
  hex: string;
}

const STEPS: Step[] = [
  { key: "harvested",   label: "Harvested",     icon: Scissors,    color: "text-amber-500",   bgColor: "bg-amber-500",   hex: "#F59E0B" },
  { key: "wet_weighed", label: "Wet Weighed",   icon: Gauge,       color: "text-orange-500",  bgColor: "bg-orange-500",  hex: "#F97316" },
  { key: "drying",      label: "Drying",        icon: Wind,        color: "text-orange-500",  bgColor: "bg-orange-500",  hex: "#F97316" },
  { key: "dry_weighed", label: "Dry Weighed",   icon: Gauge,       color: "text-orange-600",  bgColor: "bg-orange-600",  hex: "#EA580C" },
  { key: "curing",      label: "Curing",        icon: Beaker,      color: "text-orange-600",  bgColor: "bg-orange-600",  hex: "#EA580C" },
  { key: "cured",       label: "Cured",         icon: CheckCircle2, color: "text-teal-500",   bgColor: "bg-teal-500",    hex: "#14B8A6" },
  { key: "inventory",   label: "Inventory",     icon: Package,     color: "text-primary",     bgColor: "bg-primary",     hex: "#00D4AA" },
];

/** Derive the current step + per-step metadata (completion + date + weight) from
 * the harvest record. Each step has specific conditions we check. */
function stepsFromHarvest(harvest: Harvest): Array<Step & { completed: boolean; current: boolean; at: string | null; value: string | null }> {
  const hasWet = harvest.wet_weight_grams != null;
  const hasDry = harvest.dry_weight_grams != null;
  const hasCureStart = !!harvest.cure_started_at;
  const hasCured = !!harvest.cured_at;
  const isFinalized = harvest.status === "completed";

  // Determine current step — the first incomplete one in the chain
  let currentKey: StepKey = "harvested";
  if (isFinalized) currentKey = "inventory";
  else if (hasCured) currentKey = "cured";
  else if (hasCureStart) currentKey = "curing";
  else if (hasDry) currentKey = "dry_weighed";
  else if (hasWet) currentKey = "drying";
  else currentKey = "wet_weighed";

  const currentIdx = STEPS.findIndex((s) => s.key === currentKey);

  return STEPS.map((s, i) => {
    const completed = i < currentIdx || (i === currentIdx && isFinalized);
    const current = i === currentIdx && !isFinalized;

    let at: string | null = null;
    let value: string | null = null;
    switch (s.key) {
      case "harvested":
        at = harvest.harvest_started_at;
        if (harvest.total_plants_harvested != null) value = `${harvest.total_plants_harvested} plant${harvest.total_plants_harvested === 1 ? "" : "s"}`;
        break;
      case "wet_weighed":
        if (hasWet) { at = harvest.updated_at; value = `${Number(harvest.wet_weight_grams).toFixed(0)}g`; }
        break;
      case "drying":
        if (hasWet && !hasDry) at = harvest.updated_at;
        break;
      case "dry_weighed":
        if (hasDry) { at = harvest.updated_at; value = `${Number(harvest.dry_weight_grams).toFixed(0)}g`; }
        break;
      case "curing":
        at = harvest.cure_started_at;
        break;
      case "cured":
        at = harvest.cured_at;
        break;
      case "inventory":
        at = harvest.completed_at;
        break;
    }

    return { ...s, completed, current, at, value };
  });
}

interface Props {
  harvest: Harvest;
  /** Click handler fired when a user clicks a step. The parent decides
   * which modal to open based on the step key. Completed steps just show
   * the info; clicking a future step opens its recording modal. */
  onStepClick?: (step: StepKey) => void;
}

export default function HarvestTimeline({ harvest, onStepClick }: Props) {
  const steps = stepsFromHarvest(harvest);

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
      className="rounded-xl border border-border bg-card p-5"
    >
      <h3 className="text-[12px] uppercase tracking-wider font-semibold text-muted-foreground mb-5">Harvest Workflow</h3>

      <div className="relative">
        {/* Connecting line */}
        <div className="absolute left-0 right-0 top-5 flex">
          {steps.slice(0, -1).map((s, i) => {
            const completed = steps[i].completed && (steps[i + 1].completed || steps[i + 1].current);
            return (
              <div
                key={s.key}
                className={cn(
                  "flex-1 h-0.5 mx-4",
                  completed ? "bg-primary/40" : steps[i + 1].current ? "bg-gradient-to-r from-primary/40 to-border" : "bg-border border-t border-dashed",
                )}
              />
            );
          })}
        </div>

        <div className="relative flex items-start justify-between gap-1">
          {steps.map((s, i) => (
            <StepDot key={s.key} step={s} index={i} onClick={() => onStepClick?.(s.key)} />
          ))}
        </div>
      </div>
    </motion.div>
  );
}

function StepDot({ step, index, onClick }: {
  step: ReturnType<typeof stepsFromHarvest>[number];
  index: number;
  onClick: () => void;
}) {
  const { completed, current, label, icon: Icon, at, value, bgColor, color, hex } = step;
  const clickable = !completed;

  return (
    <motion.button
      type="button"
      onClick={clickable ? onClick : undefined}
      disabled={!clickable}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: index * 0.05, duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
      className={cn(
        "flex-1 flex flex-col items-center min-w-0 group",
        clickable ? "cursor-pointer" : "cursor-default",
      )}
    >
      <div className="relative">
        {current && (
          <span
            className="absolute inset-0 rounded-full animate-ping opacity-75"
            style={{ background: hex }}
          />
        )}
        <div
          className={cn(
            "relative w-10 h-10 rounded-full flex items-center justify-center z-10",
            current && "ring-4 ring-offset-2 ring-offset-card",
            clickable && !current && "group-hover:ring-2 group-hover:ring-offset-2 group-hover:ring-offset-card group-hover:ring-border transition-all",
          )}
          style={{
            background: completed || current ? hex : "transparent",
            border: completed || current ? "none" : `2px dashed ${hex}40`,
          }}
        >
          <Icon className={cn("w-4 h-4", completed || current ? "text-white" : "text-muted-foreground/60")} />
        </div>
      </div>
      <p className={cn(
        "mt-3 text-[11px] font-semibold text-center",
        current ? color : completed ? "text-foreground" : "text-muted-foreground/70",
      )}>
        {label}
      </p>
      {current && (
        <>
          <p className={cn("text-[10px] font-bold", color)}>Current</p>
          {clickable && <p className="text-[9px] uppercase tracking-wider text-primary font-medium">Click to record →</p>}
        </>
      )}
      {completed && value && (
        <p className="text-[10px] font-mono font-semibold text-foreground">{value}</p>
      )}
      {completed && at && (
        <p className="text-[9px] text-muted-foreground font-mono">
          {new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
        </p>
      )}
      {!current && !completed && clickable && (
        <p className="text-[9px] text-muted-foreground/40 group-hover:text-primary transition-colors">Click →</p>
      )}
    </motion.button>
  );
}

/** Reusable mapping from timeline step key → the modal type to open. */
export function timelineStepToModal(step: StepKey): "wet" | "dry" | "cure" | "cured" | "finish" | null {
  switch (step) {
    case "wet_weighed": return "wet";
    case "drying":
    case "dry_weighed": return "dry";
    case "curing": return "cure";
    case "cured": return "cured";
    case "inventory": return "finish";
    default: return null;
  }
}

/** Indicate whether a step is something a user can click to advance. */
export function timelineStepIsActionable(step: StepKey): boolean {
  return step !== "harvested";
}

export type { StepKey };
export { Timer };
