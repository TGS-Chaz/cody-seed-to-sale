import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Truck, UserCheck, Users, AlertTriangle, MapPin, Map as MapIcon,
  Plus, MoreHorizontal, Edit, Archive, FileText, Eye,
} from "lucide-react";
import { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import PageHeader from "@/components/shared/PageHeader";
import StatCard from "@/components/shared/StatCard";
import DataTable, { RowActionsCell } from "@/components/shared/DataTable";
import FiltersBar from "@/components/shared/FiltersBar";
import StatusPill from "@/components/shared/StatusPill";
import CopyableId from "@/components/shared/CopyableId";
import DateTime from "@/components/shared/DateTime";
import { useShortcut } from "@/components/shared/KeyboardShortcuts";
import { useCodyContext } from "@/hooks/useCodyContext";
import { useDrivers, useDriverStats, Driver, DriverInput } from "@/hooks/useDrivers";
import { useVehicles, useVehicleStats, Vehicle, VehicleInput } from "@/hooks/useVehicles";
import { useRoutes, useRouteStats, Route, RouteInput, DAY_LABELS } from "@/hooks/useRoutes";
import DriverFormModal from "./DriverFormModal";
import VehicleFormModal from "./VehicleFormModal";
import RouteFormModal from "./RouteFormModal";
import { cn } from "@/lib/utils";

type TabKey = "drivers" | "vehicles" | "routes";

export default function FleetPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = (searchParams.get("tab") as TabKey) ?? "drivers";
  const setActiveTab = (t: TabKey) => {
    const next = new URLSearchParams(searchParams);
    next.set("tab", t);
    setSearchParams(next, { replace: true });
  };

  useShortcut(["1"], () => setActiveTab("drivers"), { description: "Switch to Drivers tab", scope: "Fleet" });
  useShortcut(["2"], () => setActiveTab("vehicles"), { description: "Switch to Vehicles tab", scope: "Fleet" });
  useShortcut(["3"], () => setActiveTab("routes"), { description: "Switch to Routes tab", scope: "Fleet" });

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      <PageHeader
        title="Fleet"
        description="Drivers, vehicles, and delivery routes used for CCRS manifests"
        breadcrumbs={[{ label: "Settings", to: "/settings" }, { label: "Fleet" }]}
      />
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabKey)} className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="drivers">Drivers</TabsTrigger>
          <TabsTrigger value="vehicles">Vehicles</TabsTrigger>
          <TabsTrigger value="routes">Routes</TabsTrigger>
        </TabsList>
        <TabsContent value="drivers"><DriversTab active={activeTab === "drivers"} /></TabsContent>
        <TabsContent value="vehicles"><VehiclesTab active={activeTab === "vehicles"} /></TabsContent>
        <TabsContent value="routes"><RoutesTab active={activeTab === "routes"} /></TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Tab 1: Drivers ───────────────────────────────────────────────────────────

function DriversTab({ active }: { active: boolean }) {
  const navigate = useNavigate();
  const { data: drivers, loading, createDriver, updateDriver, archiveDriver } = useDrivers();
  const stats = useDriverStats(drivers);
  const [searchValue, setSearchValue] = useState("");
  const [typeFilter, setTypeFilter] = useState<"delivery" | "pickup" | "">("");
  const [statusFilter, setStatusFilter] = useState<"active" | "inactive" | "">("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Driver | null>(null);
  const { setContext, clearContext } = useCodyContext();

  const takenEmployeeIds = useMemo(() => drivers.filter((d) => d.employee_id).map((d) => d.employee_id!), [drivers]);

  const signature = useMemo(() => drivers.map((d) => `${d.id}:${d.is_active ? 1 : 0}`).join(","), [drivers]);
  const payload = useMemo(() => ({
    counts: stats,
    drivers: drivers.map((d) => ({
      name: `${d.first_name} ${d.last_name}`,
      type: d.driver_type,
      license: d.drivers_license_number,
      license_expires: d.drivers_license_expires,
      is_active: d.is_active,
      linked_employee: d.employee?.first_name ? `${d.employee.first_name} ${d.employee.last_name}` : null,
      linked_account: d.client_account?.company_name,
    })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [signature, stats.total, stats.delivery, stats.pickup, stats.licenseExpiring]);

  useEffect(() => {
    if (!active) return;
    setContext({ context_type: "drivers_list", page_data: payload });
    return () => clearContext();
  }, [active, setContext, clearContext, payload]);

  useShortcut(["n"], () => { setEditing(null); setModalOpen(true); }, { description: "Add driver", scope: "Drivers", enabled: active && !modalOpen });
  useShortcut(["/"], () => document.querySelector<HTMLInputElement>("[data-filters-search]")?.focus(), { description: "Focus search", scope: "Drivers", enabled: active && !modalOpen });

  const filtered = useMemo(() => {
    const q = searchValue.trim().toLowerCase();
    return drivers.filter((d) => {
      if (q) {
        const hay = `${d.first_name} ${d.last_name} ${d.drivers_license_number} ${d.phone ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (typeFilter && d.driver_type !== typeFilter) return false;
      if (statusFilter === "active" && !d.is_active) return false;
      if (statusFilter === "inactive" && d.is_active) return false;
      return true;
    });
  }, [drivers, searchValue, typeFilter, statusFilter]);

  const columns: ColumnDef<Driver>[] = useMemo(() => [
    {
      id: "name",
      header: "Name",
      cell: ({ row }) => {
        const d = row.original;
        const Icon = d.driver_type === "delivery" ? UserCheck : Truck;
        return (
          <div className="flex items-center gap-2">
            <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center shrink-0",
              d.driver_type === "delivery" ? "bg-primary/10 text-primary" : "bg-purple-500/10 text-purple-500",
            )}>
              <Icon className="w-3.5 h-3.5" />
            </div>
            <div className="text-[13px] font-medium text-foreground">{d.first_name} {d.last_name}</div>
          </div>
        );
      },
    },
    {
      id: "type",
      header: "Type",
      cell: ({ row }) => row.original.driver_type === "delivery"
        ? <StatusPill label="Delivery" variant="success" />
        : <StatusPill label="Pickup" variant="info" />,
    },
    {
      accessorKey: "drivers_license_number",
      header: "License #",
      cell: ({ row }) => <CopyableId value={row.original.drivers_license_number} />,
    },
    {
      accessorKey: "drivers_license_expires",
      header: "Expires",
      cell: ({ row }) => {
        const d = row.original.drivers_license_expires;
        if (!d) return <span className="text-muted-foreground text-[12px]">—</span>;
        const t = new Date(d).getTime();
        const daysLeft = (t - Date.now()) / (24 * 60 * 60 * 1000);
        const color = daysLeft < 0 ? "text-destructive" : daysLeft < 30 ? "text-destructive" : daysLeft < 60 ? "text-amber-500" : "text-muted-foreground";
        return <DateTime value={d} format="date-only" className={`text-[12px] ${color}`} />;
      },
    },
    {
      accessorKey: "phone",
      header: "Phone",
      cell: ({ row }) => row.original.phone ? <span className="text-[12px] font-mono">{row.original.phone}</span> : <span className="text-muted-foreground text-[12px]">—</span>,
    },
    {
      id: "linked",
      header: "Linked To",
      cell: ({ row }) => {
        const d = row.original;
        if (d.driver_type === "delivery" && d.employee) {
          return (
            <button onClick={(e) => { e.stopPropagation(); navigate(`/settings/employees/${d.employee!.id}`); }}
              className="text-[12px] text-primary hover:underline">
              {d.employee.first_name} {d.employee.last_name}
            </button>
          );
        }
        if (d.driver_type === "pickup" && d.client_account) {
          return (
            <button onClick={(e) => { e.stopPropagation(); navigate(`/sales/accounts/${d.client_account!.id}`); }}
              className="text-[12px] text-primary hover:underline">
              {d.client_account.company_name}
            </button>
          );
        }
        return <span className="text-muted-foreground text-[12px]">—</span>;
      },
    },
    {
      id: "hidden",
      header: "Hidden",
      cell: ({ row }) => row.original.hide_for_fulfillment
        ? <Eye className="w-3.5 h-3.5 text-muted-foreground opacity-60" />
        : null,
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => row.original.is_active
        ? <StatusPill label="Active" variant="success" />
        : <StatusPill label="Archived" variant="muted" />,
    },
    {
      id: "actions",
      enableSorting: false,
      header: "",
      cell: ({ row }) => (
        <RowActionsCell>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="p-1 rounded hover:bg-accent"><MoreHorizontal className="w-4 h-4 text-muted-foreground" /></button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => { setEditing(row.original); setModalOpen(true); }}>
                <Edit className="w-3.5 h-3.5" /> Edit
              </DropdownMenuItem>
              <DropdownMenuItem disabled><FileText className="w-3.5 h-3.5" /> View Manifests</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={async () => { if (confirm(`Archive ${row.original.first_name} ${row.original.last_name}?`)) await archiveDriver(row.original.id); }} className="text-destructive">
                <Archive className="w-3.5 h-3.5" /> Archive
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </RowActionsCell>
      ),
    },
  ], [navigate, archiveDriver]);

  const handleSave = async (input: DriverInput) => {
    if (editing) await updateDriver(editing.id, input);
    else await createDriver(input);
  };

  return (
    <div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Drivers" value={stats.total} accentClass="stat-accent-blue" />
        <StatCard label="Delivery" value={stats.delivery} accentClass="stat-accent-emerald" delay={0.05} />
        <StatCard label="Pickup" value={stats.pickup} accentClass="stat-accent-teal" delay={0.1} />
        <StatCard label="License Expiring" value={stats.licenseExpiring} accentClass={stats.licenseExpiring > 0 ? "stat-accent-amber" : "stat-accent-emerald"} delay={0.15} />
      </div>

      <FiltersBar
        searchValue={searchValue}
        onSearchChange={setSearchValue}
        searchPlaceholder="Search name, license #, or phone…"
        pageKey="drivers"
        currentFilters={{ typeFilter, search: searchValue }}
        onApplyView={(f) => {
          setTypeFilter(f.typeFilter ?? "");
          setSearchValue(f.search ?? "");
        }}
        actions={
          <div className="flex items-center gap-1.5 flex-wrap">
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as any)} className="h-9 px-3 text-[12px] rounded-md bg-background border border-border">
              <option value="">All types</option>
              <option value="delivery">Delivery</option>
              <option value="pickup">Pickup</option>
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} className="h-9 px-3 text-[12px] rounded-md bg-background border border-border">
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Archived</option>
            </select>
            <Button onClick={() => { setEditing(null); setModalOpen(true); }} className="gap-1.5">
              <Plus className="w-3.5 h-3.5" /> Add Driver
            </Button>
          </div>
        }
      />

      <DataTable
        columns={columns}
        data={filtered}
        loading={loading}
        empty={{
          icon: Truck,
          title: "Add your first driver",
          description: "Drivers are required on every CCRS manifest. Add your delivery drivers and your customers' pickup drivers here.",
          action: (
            <div className="flex items-center gap-2">
              <Button onClick={() => { setEditing(null); setModalOpen(true); }} className="gap-1.5">
                <Plus className="w-3.5 h-3.5" /> Add Delivery Driver
              </Button>
              <Button variant="outline" onClick={() => { setEditing(null); setModalOpen(true); }} className="gap-1.5">
                + Add Pickup Driver
              </Button>
            </div>
          ),
        }}
      />

      <DriverFormModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null); }}
        editing={editing}
        onSave={handleSave}
        takenEmployeeIds={takenEmployeeIds}
      />
    </div>
  );
}

// ─── Tab 2: Vehicles ──────────────────────────────────────────────────────────

function VehiclesTab({ active }: { active: boolean }) {
  const navigate = useNavigate();
  const { data: vehicles, loading, createVehicle, updateVehicle, archiveVehicle } = useVehicles();
  const stats = useVehicleStats(vehicles);
  const [searchValue, setSearchValue] = useState("");
  const [typeFilter, setTypeFilter] = useState<"delivery" | "pickup" | "">("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const { setContext, clearContext } = useCodyContext();

  const signature = useMemo(() => vehicles.map((v) => `${v.id}:${v.is_active ? 1 : 0}`).join(","), [vehicles]);
  const payload = useMemo(() => ({ counts: stats, vehicles: vehicles.map((v) => ({ name: v.unit_name ?? `${v.year} ${v.make} ${v.model}`, type: v.vehicle_type, plate: v.license_plate })) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [signature, stats.total, stats.delivery, stats.pickup, stats.insuranceExpiring],
  );

  useEffect(() => {
    if (!active) return;
    setContext({ context_type: "vehicles_list", page_data: payload });
    return () => clearContext();
  }, [active, setContext, clearContext, payload]);

  useShortcut(["n"], () => { setEditing(null); setModalOpen(true); }, { description: "Add vehicle", scope: "Vehicles", enabled: active && !modalOpen });

  const filtered = useMemo(() => {
    const q = searchValue.trim().toLowerCase();
    return vehicles.filter((v) => {
      if (q) {
        const hay = `${v.make} ${v.model} ${v.license_plate} ${v.vin ?? ""} ${v.unit_name ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (typeFilter && v.vehicle_type !== typeFilter) return false;
      return true;
    });
  }, [vehicles, searchValue, typeFilter]);

  const columns: ColumnDef<Vehicle>[] = useMemo(() => [
    {
      id: "name",
      header: "Vehicle",
      cell: ({ row }) => {
        const v = row.original;
        return (
          <div>
            <div className="text-[13px] font-medium text-foreground">{v.unit_name ?? `${v.year} ${v.make} ${v.model}`}</div>
            {v.unit_name && <div className="text-[11px] text-muted-foreground">{v.year} {v.make} {v.model}</div>}
          </div>
        );
      },
    },
    {
      id: "type",
      header: "Type",
      cell: ({ row }) => row.original.vehicle_type === "delivery"
        ? <StatusPill label="Delivery" variant="success" />
        : <StatusPill label="Pickup" variant="info" />,
    },
    {
      accessorKey: "license_plate",
      header: "Plate",
      cell: ({ row }) => <CopyableId value={row.original.license_plate} />,
    },
    {
      accessorKey: "vin",
      header: "VIN",
      cell: ({ row }) => {
        const v = row.original.vin;
        if (!v) return <span className="text-muted-foreground text-[12px]">—</span>;
        return <CopyableId value={v} truncate={3} />;
      },
    },
    {
      id: "color",
      header: "Color",
      cell: ({ row }) => row.original.color ? (
        <span className="inline-flex items-center gap-1.5 text-[12px]">
          <span className="w-2.5 h-2.5 rounded-full border border-border" style={{ background: row.original.color.toLowerCase() }} />
          {row.original.color}
        </span>
      ) : <span className="text-muted-foreground text-[12px]">—</span>,
    },
    {
      id: "insurance",
      header: "Insurance",
      cell: ({ row }) => {
        const v = row.original;
        if (!v.insurance_company && !v.insurance_expires) return <span className="text-muted-foreground text-[12px]">—</span>;
        const daysLeft = v.insurance_expires ? (new Date(v.insurance_expires).getTime() - Date.now()) / 86400000 : Infinity;
        const color = daysLeft < 0 ? "text-destructive" : daysLeft < 30 ? "text-amber-500" : "text-muted-foreground";
        return (
          <div className="text-[11px]">
            <div className="text-foreground">{v.insurance_company ?? "—"}</div>
            {v.insurance_expires && <div className={color}><DateTime value={v.insurance_expires} format="date-only" /></div>}
          </div>
        );
      },
    },
    {
      id: "linked",
      header: "Linked",
      cell: ({ row }) => {
        const v = row.original;
        if (v.vehicle_type === "pickup" && v.client_account) {
          return (
            <button onClick={(e) => { e.stopPropagation(); navigate(`/sales/accounts/${v.client_account!.id}`); }}
              className="text-[12px] text-primary hover:underline">
              {v.client_account.company_name}
            </button>
          );
        }
        return <span className="text-[12px] text-muted-foreground">Internal</span>;
      },
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => row.original.is_active ? <StatusPill label="Active" variant="success" /> : <StatusPill label="Archived" variant="muted" />,
    },
    {
      id: "actions",
      enableSorting: false,
      header: "",
      cell: ({ row }) => (
        <RowActionsCell>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="p-1 rounded hover:bg-accent"><MoreHorizontal className="w-4 h-4 text-muted-foreground" /></button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => { setEditing(row.original); setModalOpen(true); }}>
                <Edit className="w-3.5 h-3.5" /> Edit
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={async () => { if (confirm(`Archive ${row.original.make} ${row.original.model}?`)) await archiveVehicle(row.original.id); }} className="text-destructive">
                <Archive className="w-3.5 h-3.5" /> Archive
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </RowActionsCell>
      ),
    },
  ], [navigate, archiveVehicle]);

  const handleSave = async (input: VehicleInput) => {
    if (editing) await updateVehicle(editing.id, input);
    else await createVehicle(input);
  };

  return (
    <div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Vehicles" value={stats.total} accentClass="stat-accent-blue" />
        <StatCard label="Delivery" value={stats.delivery} accentClass="stat-accent-emerald" delay={0.05} />
        <StatCard label="Pickup" value={stats.pickup} accentClass="stat-accent-teal" delay={0.1} />
        <StatCard label="Insurance Expiring" value={stats.insuranceExpiring} accentClass={stats.insuranceExpiring > 0 ? "stat-accent-amber" : "stat-accent-emerald"} delay={0.15} />
      </div>

      <FiltersBar
        searchValue={searchValue}
        onSearchChange={setSearchValue}
        searchPlaceholder="Search make, model, plate, VIN, unit name…"
        pageKey="vehicles"
        currentFilters={{ typeFilter, search: searchValue }}
        onApplyView={(f) => {
          setTypeFilter(f.typeFilter ?? "");
          setSearchValue(f.search ?? "");
        }}
        actions={
          <div className="flex items-center gap-1.5">
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as any)} className="h-9 px-3 text-[12px] rounded-md bg-background border border-border">
              <option value="">All types</option>
              <option value="delivery">Delivery</option>
              <option value="pickup">Pickup</option>
            </select>
            <Button onClick={() => { setEditing(null); setModalOpen(true); }} className="gap-1.5">
              <Plus className="w-3.5 h-3.5" /> Add Vehicle
            </Button>
          </div>
        }
      />

      <DataTable
        columns={columns}
        data={filtered}
        loading={loading}
        empty={{
          icon: Truck,
          title: "Add your first vehicle",
          description: "CCRS manifests require complete vehicle info: make, model, year, color, VIN, and license plate. Add your fleet here.",
          action: (
            <div className="flex items-center gap-2">
              <Button onClick={() => { setEditing(null); setModalOpen(true); }} className="gap-1.5">
                <Plus className="w-3.5 h-3.5" /> Add Delivery Vehicle
              </Button>
              <Button variant="outline" onClick={() => { setEditing(null); setModalOpen(true); }} className="gap-1.5">
                + Add Pickup Vehicle
              </Button>
            </div>
          ),
        }}
      />

      <VehicleFormModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null); }}
        editing={editing}
        onSave={handleSave}
      />
    </div>
  );
}

// ─── Tab 3: Routes ────────────────────────────────────────────────────────────

function RoutesTab({ active }: { active: boolean }) {
  const navigate = useNavigate();
  const { data: routes, loading, createRoute, updateRoute, archiveRoute } = useRoutes();
  const stats = useRouteStats(routes);
  const [searchValue, setSearchValue] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Route | null>(null);
  const { setContext, clearContext } = useCodyContext();

  const signature = useMemo(() => routes.map((r) => `${r.id}:${r.is_active ? 1 : 0}`).join(","), [routes]);
  const payload = useMemo(() => ({ counts: stats, routes: routes.map((r) => ({ name: r.name, day: r.typical_day_of_week, driver: r.driver?.first_name, account_count: r.account_count })) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [signature, stats.total, stats.active, stats.accountsAssigned],
  );

  useEffect(() => {
    if (!active) return;
    setContext({ context_type: "routes_list", page_data: payload });
    return () => clearContext();
  }, [active, setContext, clearContext, payload]);

  useShortcut(["n"], () => { setEditing(null); setModalOpen(true); }, { description: "Create route", scope: "Routes", enabled: active && !modalOpen });

  const filtered = useMemo(() => {
    const q = searchValue.trim().toLowerCase();
    if (!q) return routes;
    return routes.filter((r) => `${r.name} ${r.description ?? ""}`.toLowerCase().includes(q));
  }, [routes, searchValue]);

  const columns: ColumnDef<Route>[] = useMemo(() => [
    {
      id: "name",
      header: "Route",
      cell: ({ row }) => {
        const r = row.original;
        return (
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: r.color ?? "#6B7280" }} />
            <span className="text-[13px] font-medium text-foreground">{r.name}</span>
          </div>
        );
      },
    },
    {
      accessorKey: "description",
      header: "Description",
      cell: ({ row }) => <span className="text-[12px] text-muted-foreground line-clamp-1">{row.original.description?.slice(0, 60) ?? "—"}</span>,
    },
    {
      accessorKey: "typical_day_of_week",
      header: "Day",
      cell: ({ row }) => row.original.typical_day_of_week
        ? <span className="text-[11px] px-2 py-0.5 rounded bg-muted text-muted-foreground font-medium">{DAY_LABELS[row.original.typical_day_of_week]}</span>
        : <span className="text-muted-foreground text-[12px]">—</span>,
    },
    {
      accessorKey: "minimum_order_amount",
      header: "Min Order",
      cell: ({ row }) => <span className="font-mono text-[12px] tabular-nums">${row.original.minimum_order_amount?.toFixed(2) ?? "0.00"}</span>,
    },
    {
      id: "driver",
      header: "Driver",
      cell: ({ row }) => row.original.driver
        ? <span className="text-[12px] text-primary">{row.original.driver.first_name} {row.original.driver.last_name}</span>
        : <span className="text-[12px] text-muted-foreground">Unassigned</span>,
    },
    {
      id: "accounts",
      header: "Accounts",
      cell: ({ row }) => {
        const n = row.original.account_count ?? 0;
        if (n === 0) return <span className="text-muted-foreground text-[12px]">0</span>;
        return (
          <button onClick={(e) => { e.stopPropagation(); navigate(`/sales/accounts?route=${row.original.id}`); }}
            className="text-[12px] text-primary hover:underline tabular-nums">
            {n} {n === 1 ? "account" : "accounts"}
          </button>
        );
      },
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => row.original.is_active ? <StatusPill label="Active" variant="success" /> : <StatusPill label="Archived" variant="muted" />,
    },
    {
      id: "actions",
      enableSorting: false,
      header: "",
      cell: ({ row }) => (
        <RowActionsCell>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="p-1 rounded hover:bg-accent"><MoreHorizontal className="w-4 h-4 text-muted-foreground" /></button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => { setEditing(row.original); setModalOpen(true); }}>
                <Edit className="w-3.5 h-3.5" /> Edit
              </DropdownMenuItem>
              <DropdownMenuItem disabled><MapPin className="w-3.5 h-3.5" /> Optimize Order</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={async () => { if (confirm(`Archive route "${row.original.name}"?`)) await archiveRoute(row.original.id); }} className="text-destructive">
                <Archive className="w-3.5 h-3.5" /> Archive
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </RowActionsCell>
      ),
    },
  ], [navigate, archiveRoute]);

  const handleSave = async (input: RouteInput) => {
    if (editing) await updateRoute(editing.id, input);
    else await createRoute(input);
  };

  return (
    <div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <StatCard label="Total Routes" value={stats.total} accentClass="stat-accent-blue" />
        <StatCard label="Active" value={stats.active} accentClass="stat-accent-emerald" delay={0.05} />
        <StatCard label="Accounts Assigned" value={stats.accountsAssigned} accentClass="stat-accent-teal" delay={0.1} />
      </div>

      <FiltersBar
        searchValue={searchValue}
        onSearchChange={setSearchValue}
        searchPlaceholder="Search route name or description…"
        pageKey="routes"
        currentFilters={{ search: searchValue }}
        onApplyView={(f) => setSearchValue(f.search ?? "")}
        actions={
          <Button onClick={() => { setEditing(null); setModalOpen(true); }} className="gap-1.5">
            <Plus className="w-3.5 h-3.5" /> Create Route
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={filtered}
        loading={loading}
        empty={{
          icon: MapIcon,
          title: "Create your first route",
          description: "Organize your deliveries by territory, day of week, or however works for you. Assign customers to routes for automatic manifest prep.",
          action: (
            <Button onClick={() => { setEditing(null); setModalOpen(true); }} className="gap-1.5">
              <Plus className="w-3.5 h-3.5" /> Create First Route
            </Button>
          ),
        }}
      />

      <RouteFormModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null); }}
        editing={editing}
        onSave={handleSave}
      />
    </div>
  );
}

void AlertTriangle; void Users;
