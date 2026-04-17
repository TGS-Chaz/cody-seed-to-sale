import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BookmarkCheck, Star, StarOff, Trash2, Save, Users, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
  DropdownMenuTrigger, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  useSavedViews, useCreateView, useUpdateView, useDeleteView, useSetDefaultView,
  SavedView,
} from "@/hooks/useSavedViews";
import { useAuth } from "@/lib/auth";

interface SavedViewsDropdownProps {
  pageKey: string;
  currentFilters: Record<string, any>;
  currentSort?: Record<string, any> | null;
  onApplyView: (filters: Record<string, any>, sort: Record<string, any> | null) => void;
  /** Optional label override */
  label?: string;
}

/**
 * Dropdown that lists this user's saved filter views + org-shared views for the given pageKey.
 * Lets the user save the current filter+sort state as a new view, set a default, share/unshare, or delete.
 */
export default function SavedViewsDropdown({
  pageKey, currentFilters, currentSort = null, onApplyView, label = "Views",
}: SavedViewsDropdownProps) {
  const { user } = useAuth();
  const { data: views, loading, refresh } = useSavedViews(pageKey);
  const createView = useCreateView(pageKey);
  const updateView = useUpdateView();
  const deleteView = useDeleteView();
  const setDefault = useSetDefaultView(pageKey);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [defaultApplied, setDefaultApplied] = useState(false);

  // On initial mount, if a default view exists and no view has been applied yet, apply it
  useEffect(() => {
    if (defaultApplied || loading) return;
    const def = views.find((v) => v.is_default && v.user_id === user?.id);
    if (def) {
      onApplyView(def.filter_config ?? {}, def.sort_config ?? null);
      setActiveId(def.id);
      setDefaultApplied(true);
    } else if (views.length > 0 || !loading) {
      // Mark as applied even if no default, so we don't re-run
      setDefaultApplied(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, views, user?.id]);

  const handleApply = (v: SavedView) => {
    onApplyView(v.filter_config ?? {}, v.sort_config ?? null);
    setActiveId(v.id);
    toast.success(`Applied view: ${v.name}`);
  };

  const handleSaveNew = async () => {
    const name = window.prompt("Name for this view:")?.trim();
    if (!name) return;
    const shareAnswer = window.confirm("Share this view with your whole organization? OK = share, Cancel = keep private.");
    try {
      const v = await createView({
        name,
        filter_config: currentFilters,
        sort_config: currentSort ?? null,
        is_shared: shareAnswer,
      });
      setActiveId(v.id);
      toast.success(`View "${name}" saved`);
      refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save view");
    }
  };

  const handleOverwrite = async (v: SavedView) => {
    try {
      await updateView(v.id, { filter_config: currentFilters, sort_config: currentSort ?? null });
      toast.success(`Updated "${v.name}" with current filters`);
      refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to update view");
    }
  };

  const handleSetDefault = async (v: SavedView) => {
    try {
      await setDefault(v.is_default ? null : v.id);
      toast.success(v.is_default ? "Default cleared" : `"${v.name}" set as default`);
      refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    }
  };

  const handleToggleShare = async (v: SavedView) => {
    try {
      await updateView(v.id, { is_shared: !v.is_shared });
      toast.success(v.is_shared ? `"${v.name}" unshared` : `"${v.name}" shared with org`);
      refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    }
  };

  const handleDelete = async (v: SavedView) => {
    if (!window.confirm(`Delete view "${v.name}"?`)) return;
    try {
      await deleteView(v.id);
      if (activeId === v.id) setActiveId(null);
      toast.success("View deleted");
      refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    }
  };

  const ownViews = views.filter((v) => v.user_id === user?.id);
  const sharedViews = views.filter((v) => v.user_id !== user?.id && v.is_shared);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 h-9">
          <BookmarkCheck className="w-3.5 h-3.5" />
          {label}
          {activeId && <span className="w-1.5 h-1.5 rounded-full bg-primary" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuItem onClick={handleSaveNew} className="gap-2">
          <Save className="w-3.5 h-3.5" />
          Save current filters as…
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {loading ? (
          <div className="px-2 py-3 text-[11px] text-muted-foreground">Loading…</div>
        ) : views.length === 0 ? (
          <div className="px-2 py-3 text-[11px] text-muted-foreground">No saved views yet</div>
        ) : (
          <>
            {ownViews.length > 0 && <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">Your views</DropdownMenuLabel>}
            {ownViews.map((v) => (
              <ViewRow
                key={v.id}
                view={v}
                active={activeId === v.id}
                owned
                onApply={() => handleApply(v)}
                onOverwrite={() => handleOverwrite(v)}
                onSetDefault={() => handleSetDefault(v)}
                onToggleShare={() => handleToggleShare(v)}
                onDelete={() => handleDelete(v)}
              />
            ))}
            {sharedViews.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">Shared with org</DropdownMenuLabel>
                {sharedViews.map((v) => (
                  <ViewRow
                    key={v.id}
                    view={v}
                    active={activeId === v.id}
                    owned={false}
                    onApply={() => handleApply(v)}
                  />
                ))}
              </>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface ViewRowProps {
  view: SavedView;
  active: boolean;
  owned: boolean;
  onApply: () => void;
  onOverwrite?: () => void;
  onSetDefault?: () => void;
  onToggleShare?: () => void;
  onDelete?: () => void;
}

function ViewRow({ view, active, owned, onApply, onOverwrite, onSetDefault, onToggleShare, onDelete }: ViewRowProps) {
  return (
    <div className="group flex items-center px-1 py-0.5 hover:bg-accent/50 rounded">
      <button
        onClick={onApply}
        className="flex-1 text-left flex items-center gap-1.5 px-1 py-1 text-[12px]"
      >
        {active && <Check className="w-3 h-3 text-primary shrink-0" />}
        {!active && view.is_default && <Star className="w-3 h-3 text-amber-500 shrink-0" fill="currentColor" />}
        {!active && !view.is_default && <span className="w-3 shrink-0" />}
        <span className="truncate">{view.name}</span>
        {view.is_shared && <Users className="w-3 h-3 text-muted-foreground shrink-0" />}
      </button>
      {owned && (
        <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => { e.stopPropagation(); onOverwrite?.(); }}
            title="Overwrite with current filters"
            className="p-1 hover:text-primary"
          >
            <Save className="w-3 h-3" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onSetDefault?.(); }}
            title={view.is_default ? "Clear default" : "Set as default"}
            className="p-1 hover:text-amber-500"
          >
            {view.is_default ? <StarOff className="w-3 h-3" /> : <Star className="w-3 h-3" />}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onToggleShare?.(); }}
            title={view.is_shared ? "Unshare" : "Share with org"}
            className="p-1 hover:text-primary"
          >
            <Users className="w-3 h-3" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete?.(); }}
            title="Delete view"
            className="p-1 hover:text-destructive"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
}
