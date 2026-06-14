import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Clock, FileText, CheckCircle2, XCircle } from "lucide-react";
import { getDashboard, getPendingScripts, getScripts } from "@/api/client";
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
  const isApprover = user?.role === "admin" || user?.role === "coordinator";
  const { data: pending } = useQuery({
    queryKey: ["pending"],
    queryFn: getPendingScripts,
    enabled: isApprover,
  });

  const recent = scripts?.slice(0, 5) ?? [];
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
          value={stats?.my_scripts ?? 0}
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

      {isApprover && pending && pending.length > 0 && (
        <Card padding={false} className="mb-8">
          <CardHeader>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-primary">Fila de aprovação</h3>
              <Badge variant="warning">{pending.length}</Badge>
            </div>
            <Link to="/approvals" className="text-sm text-accent hover:underline">
              Ver todas
            </Link>
          </CardHeader>
          <CardBody className="divide-y divide-default">
            {pending.slice(0, 3).map((s) => (
              <div
                key={s.id}
                className="p-4 flex justify-between items-center hover:bg-surface-elevated/50 transition-colors"
              >
                <div>
                  <p className="font-medium text-primary">{s.database_display_name}</p>
                  <p className="text-sm text-muted">por {s.submitted_by_name}</p>
                </div>
                <StatusBadge status={s.status} />
              </div>
            ))}
          </CardBody>
        </Card>
      )}

      <Card padding={false}>
        <CardHeader>
          <h3 className="font-semibold text-primary">Solicitações recentes</h3>
        </CardHeader>
        {recent.length === 0 ? (
          <p className="p-6 text-muted text-sm">Nenhuma solicitação ainda.</p>
        ) : (
          <CardBody className="divide-y divide-default">
            {recent.map((s) => (
              <div
                key={s.id}
                className="p-4 flex justify-between items-center hover:bg-surface-elevated/50 transition-colors"
              >
                <div>
                  <p className="font-medium text-primary">{s.database_display_name}</p>
                  <p className="text-sm text-muted">
                    {new Date(s.created_at).toLocaleString("pt-BR")}
                  </p>
                </div>
                <StatusBadge status={s.status} />
              </div>
            ))}
          </CardBody>
        )}
      </Card>
    </div>
  );
}
