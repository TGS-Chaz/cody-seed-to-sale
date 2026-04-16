import { motion, animate } from "framer-motion";
import { useEffect, useRef } from "react";

interface StatCardProps {
  label: string;
  value: string | number;
  trend?: string;
  children?: React.ReactNode;
  onClick?: () => void;
  accentClass?: string;
  delay?: number;
}

function AnimatedNumber({ value }: { value: string | number }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (typeof value === "number") {
      const controls = animate(0, value, {
        duration: 1.5,
        ease: [0.25, 0.46, 0.45, 0.94],
        onUpdate(v) {
          node.textContent = Math.round(v).toString();
        },
      });
      return controls.stop;
    }

    const match = String(value).match(/^\$?([\d.]+)(.*)$/);
    if (match) {
      const numPart = parseFloat(match[1]);
      const suffix = match[2];
      const prefix = String(value).startsWith("$") ? "$" : "";
      const controls = animate(0, numPart, {
        duration: 1.5,
        ease: [0.25, 0.46, 0.45, 0.94],
        onUpdate(v) {
          node.textContent = `${prefix}${v.toFixed(numPart % 1 !== 0 ? 1 : 0)}${suffix}`;
        },
      });
      return controls.stop;
    }

    node.textContent = String(value);
  }, [value]);

  return <span ref={ref}>0</span>;
}

export default function StatCard({
  label,
  value,
  trend,
  children,
  onClick,
  accentClass,
  delay = 0,
}: StatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
      whileHover={{ y: -3, transition: { type: "spring", stiffness: 300, damping: 20 } }}
      onClick={onClick}
      className={`group relative rounded-xl border border-border bg-card p-5 transition-all duration-200 hover:shadow-lg hover:border-primary/20 ${
        onClick ? "cursor-pointer" : ""
      } ${accentClass || ""}`}
      style={{ boxShadow: "0 1px 3px var(--shadow-color), inset 0 1px 0 var(--glass-bg)" }}
    >
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground mb-1">
        {label}
      </p>
      <p className="text-[36px] font-extrabold mt-1 text-foreground tabular-nums leading-none tracking-tight">
        <AnimatedNumber value={value} />
      </p>
      {trend && <p className="text-[12px] text-muted-foreground mt-2">{trend}</p>}
      {children}
    </motion.div>
  );
}
