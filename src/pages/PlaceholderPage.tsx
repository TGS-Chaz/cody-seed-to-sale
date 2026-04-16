import { useLocation } from "react-router-dom";
import { Construction } from "lucide-react";
import EmptyState from "@/components/shared/EmptyState";
import PageHeader from "@/components/shared/PageHeader";

export default function PlaceholderPage() {
  const location = useLocation();
  const segments = location.pathname.split("/").filter(Boolean);
  const pageName = segments[segments.length - 1]
    ?.replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase()) ?? "Page";

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      <PageHeader title={pageName} />
      <EmptyState
        icon={Construction}
        title="Coming Soon"
        description={`The ${pageName} module is under construction. It will be available in the next update.`}
      />
    </div>
  );
}
