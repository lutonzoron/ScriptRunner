import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Clock, FileText, CheckCircle2, XCircle, Layers } from "lucide-react";
import { getDashboard, getBundles, getPendingBundles, getPendingScripts, getScripts } from "@/api/client";
import { useAuth } from "@/context/AuthContext";
import StatusBadge from "@/components/StatusBadge";
import PageHeader from "@/components/ui/PageHeader";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";

function StatCard({
  label,
  value,
  icon: Icon,
  colorClass,
}: {
  label: string;
  value: number;
  icon: typeof Clock;
  colorClass: string;
}) {
  return (
    <Card className="!p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-muted">{label}</p>
          <p className={`text-3xl font-bold mt-1 ${colorClass}`}>{value}</p>
        </div>
        <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-surface-elevated">
          <Icon className={`w-5 h-5 ${colorClass}`} />
        </div>
      </div>
    </Card>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { data: stats } = useQuery({ queryKey: ["dashboard"], queryFn: getDashboard });
  const { data: scripts } = useQuery({ queryKey: ["scripts"], queryFn: getScripts });
  const { data: bundles } = useQuery({ queryKey: ["bundles"], queryFn: getBundles });
  const isApprover = user?.role === "admin" || user?.role === "coordinator";
  const { data: pending } = useQuery({
    queryKey: ["pending"],
    queryFn: getPendingScripts,
    enabled: isApprover,
  });
  const { data: pendingBundles } = useQuery({
    queryKey: ["pending-bundles"],
    queryFn: getPendingBundles,
    enabled: isApprover,
  });

  const recentItems = [
    ...(scripts ?? []).map((s) => ({
      id: `script-${s.id}`,
      title: s.database_display_name,
      created_at: s.created_at,
      status: s.status,
      kind: "script" as const,
    })),
    ...(bundles ?? []).map((b) => ({
      id: `bundle-${b.id}`,
      title: b.title,
      created_at: b.created_at,
      status: b.status,
      kind: "bundle" as const,
    })),
  ]
    .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
    .slice(0, 5);

  const queuePreview = [
    ...(pendingBundles ?? []).map((b) => ({
      id: `bundle-${b.id}`,
      title: b.title,
      submitted_by_name: b.submitted_by_name,
      status: b.status,
      kind: "bundle" as const,
    })),
    ...(pending ?? []).map((s) => ({
      id: `script-${s.id}`,
      title: s.database_display_name,
      submitted_by_name: s.submitted_by_name,
      status: s.status,
      kind: "script" as const,
    })),
  ].slice(0, 3);
  const firstName = user?.name?.split(" ")[0] || "";

  return (
    <div>
      <PageHeader
        title={`Olá, ${firstName}`}
        description="Visão geral das suas solicitações e da fila de aprovação"
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {isApprover && (
          <StatCard
            label="Pendentes de aprovação"
            value={stats?.pending_approvals ?? 0}
            icon={Clock}
            colorClass="text-amber-600 dark:text-amber-400"
          />
        )}
        <StatCard
          label="Minhas solicitações"
          value={(stats?.my_scripts ?? 0) + (stats?.my_bundles ?? 0)}
          icon={FileText}
          colorClass="text-accent"
        />
        <StatCard
          label="Executados"
          value={stats?.recent_executed ?? 0}
          icon={CheckCircle2}
          colorClass="text-green-600 dark:text-green-400"
        />
        <StatCard
          label="Falhas"
          value={stats?.recent_failed ?? 0}
          icon={XCircle}
          colorClass="text-red-600 dark:text-red-400"
        />
      </div>

      {isApprover && queuePreview.length > 0 && (
        <Card padding={false} className="mb-8">
          <CardHeader>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-primary">Fila de aprovação</h3>
              <Badge variant="warning">{queuePreview.length}</Badge>
            </div>
            <Link to="/approvals" className="text-sm text-accent hover:underline">
              Ver todas
            </Link>
          </CardHeader>
          <CardBody className="divide-y divide-default">
            {queuePreview.map((item) => (
              <div
                key={item.id}
                className="p-4 flex justify-between items-center hover:bg-surface-elevated/50 transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0">
                  {item.kind === "bundle" ? (
                    <Layers className="w-4 h-4 text-accent shrink-0" />
                  ) : (
                    <FileText className="w-4 h-4 text-muted shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="font-medium text-primary truncate">{item.title}</p>
                    <p className="text-sm text-muted">por {item.submitted_by_name}</p>
                  </div>
                </div>
                <StatusBadge status={item.status} />
              </div>
            ))}
          </CardBody>
        </Card>
      )}

      <Card padding={false}>
        <CardHeader>
          <h3 className="font-semibold text-primary">Solicitações recentes</h3>
        </CardHeader>
        {recentItems.length === 0 ? (
          <p className="p-6 text-muted text-sm">Nenhuma solicitação ainda.</p>
        ) : (
          <CardBody className="divide-y divide-default">
            {recentItems.map((item) => (
              <div
                key={item.id}
                className="p-4 flex justify-between items-center hover:bg-surface-elevated/50 transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0">
                  {item.kind === "bundle" ? (
                    <Layers className="w-4 h-4 text-accent shrink-0" />
                  ) : null}
                  <div>
                    <p className="font-medium text-primary">{item.title}</p>
                    <p className="text-sm text-muted">
                      {new Date(item.created_at).toLocaleString("pt-BR")}
                    </p>
                  </div>
                </div>
                <StatusBadge status={item.status} />
              </div>
            ))}
          </CardBody>
        )}
      </Card>
    </div>
  );
}
