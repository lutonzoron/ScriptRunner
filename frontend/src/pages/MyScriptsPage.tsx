import { useQuery } from "@tanstack/react-query";
import { FileText } from "lucide-react";
import { getScripts } from "@/api/client";
import StatusBadge from "@/components/StatusBadge";
import Alert from "@/components/ui/Alert";
import { Card, CardBody } from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import PageHeader from "@/components/ui/PageHeader";
import Spinner from "@/components/ui/Spinner";

export default function MyScriptsPage() {
  const { data: scripts, isLoading } = useQuery({ queryKey: ["scripts"], queryFn: getScripts });

  return (
    <div>
      <PageHeader
        title="Minhas Solicitações"
        description="Histórico de scripts submetidos e seus resultados"
      />

      <Card padding={false}>
        {isLoading ? (
          <div className="flex justify-center p-12">
            <Spinner />
          </div>
        ) : !scripts?.length ? (
          <EmptyState
            icon={FileText}
            title="Nenhuma solicitação encontrada"
            description="Submeta um script T-SQL para começar"
          />
        ) : (
          <CardBody className="divide-y divide-default">
            {scripts.map((s) => (
              <div key={s.id} className="p-5">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <p className="font-semibold text-primary">{s.database_display_name}</p>
                    <p className="text-sm text-muted">
                      {s.environment} · {new Date(s.created_at).toLocaleString("pt-BR")}
                    </p>
                  </div>
                  <StatusBadge status={s.status} />
                </div>
                <pre className="bg-surface-elevated p-3 rounded-lg text-xs overflow-x-auto max-h-32 font-mono text-primary border border-default">
                  {s.tsql_content}
                </pre>
                {s.validation_result.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {s.validation_result.map((v, i) => (
                      <Alert key={i} variant={v.severity === "error" ? "error" : "warning"}>
                        [{v.code}] {v.message}
                      </Alert>
                    ))}
                  </div>
                )}
                {s.execution_result && (
                  <div className="mt-3">
                    {s.execution_result.success ? (
                      <Alert variant="success">
                        Executado com sucesso
                        {s.execution_result.duration_ms && ` em ${s.execution_result.duration_ms}ms`}
                        {s.execution_result.rows_affected != null &&
                          ` · ${s.execution_result.rows_affected} linhas afetadas`}
                      </Alert>
                    ) : (
                      <Alert variant="error">Erro: {s.execution_result.error}</Alert>
                    )}
                  </div>
                )}
              </div>
            ))}
          </CardBody>
        )}
      </Card>
    </div>
  );
}
