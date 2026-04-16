import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Building2 } from "lucide-react";
import { useOrg } from "@/lib/org";

/**
 * Top header chip showing current date, time, org name, and org logo.
 * Matches the CRM Dashboard pattern (positioned inline in the page header).
 * Time updates every minute.
 */
export default function OrgHeader() {
  const { org } = useOrg();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const tick = () => setNow(new Date());
    const interval = setInterval(tick, 60_000); // every minute
    return () => clearInterval(interval);
  }, []);

  const dateLabel = now.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const timeLabel = now.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

  const orgName = org?.name ?? "The Green Solution";

  return (
    <div className="flex items-center gap-3">
      <div className="text-right hidden sm:block">
        <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider tabular-nums">
          {dateLabel} · {timeLabel}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">{orgName}</p>
      </div>
      <motion.div whileHover={{ scale: 1.05 }} transition={{ type: "spring", stiffness: 300, damping: 20 }}>
        {org?.logo_url ? (
          <img
            src={org.logo_url}
            alt={`${orgName} logo`}
            className="w-10 h-10 rounded-xl object-cover border border-border bg-card"
          />
        ) : (
          <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center border border-border">
            <Building2 className="w-5 h-5 text-muted-foreground" />
          </div>
        )}
      </motion.div>
    </div>
  );
}
