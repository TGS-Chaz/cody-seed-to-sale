import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, CheckCheck, X, Loader2 } from "lucide-react";
import DateTime from "@/components/shared/DateTime";
import {
  useNotifications, useUnreadCount, useMarkAsRead, useMarkAllRead, useDismissNotification,
} from "@/hooks/useNotifications";
import { cn } from "@/lib/utils";

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { data: notifications, loading, refresh } = useNotifications(20);
  const { count, refresh: refreshCount } = useUnreadCount();
  const markAsRead = useMarkAsRead();
  const markAllRead = useMarkAllRead();
  const dismiss = useDismissNotification();

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const handleClick = async (n: typeof notifications[number]) => {
    if (!n.read_at) await markAsRead(n.id);
    refresh(); refreshCount();
    if (n.action_url) navigate(n.action_url);
    setOpen(false);
  };

  const handleMarkAll = async () => {
    await markAllRead();
    refresh(); refreshCount();
  };

  const handleDismiss = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await dismiss(id);
    refresh(); refreshCount();
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        title="Notifications"
        aria-label="Notifications"
      >
        <Bell className="w-4 h-4" />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold flex items-center justify-center">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-1 w-[360px] rounded-xl border border-border bg-card shadow-xl z-[70]"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h3 className="text-[13px] font-semibold">Notifications</h3>
              {count > 0 && (
                <button onClick={handleMarkAll} className="text-[11px] text-primary hover:underline inline-flex items-center gap-1">
                  <CheckCheck className="w-3 h-3" /> Mark all read
                </button>
              )}
            </div>
            <div className="max-h-[420px] overflow-y-auto">
              {loading ? (
                <div className="flex justify-center py-8"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
              ) : notifications.length === 0 ? (
                <div className="py-10 text-center">
                  <Bell className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
                  <p className="text-[12px] text-muted-foreground">No notifications</p>
                </div>
              ) : (
                <ul className="divide-y divide-border/50">
                  {notifications.map((n) => (
                    <li
                      key={n.id}
                      onClick={() => handleClick(n)}
                      className={cn("group flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-accent/30",
                        !n.read_at && "bg-primary/5")}
                    >
                      <span className={cn("w-2 h-2 rounded-full shrink-0 mt-2", !n.read_at ? "bg-primary" : "bg-transparent")} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <h4 className="text-[12px] font-semibold truncate">{n.title}</h4>
                          <button onClick={(e) => handleDismiss(n.id, e)} className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                        {n.content && <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{n.content}</p>}
                        {n.created_at && <DateTime value={n.created_at} className="text-[10px] text-muted-foreground/70 mt-1" />}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="px-4 py-2 border-t border-border text-center">
              <button onClick={() => { setOpen(false); }} className="text-[11px] text-muted-foreground hover:text-foreground">
                View all
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
