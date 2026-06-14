import Editor from "@monaco-editor/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Check, X, ClipboardList } from "lucide-react";
import { approveScript, getPendingScripts } from "@/api/client";
import StatusBadge from "@/components/StatusBadge";
import Alert from "@/components/ui/Alert";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import PageHeader from "@/components/ui/PageHeader";
import Spinner from "@/components/ui/Spinner";
import { useMonacoTheme } from "@/hooks/useMonacoTheme";

const checklistItems = [
  { key: "checked_environment", label: "Conferi o ambiente/base de dados" },
  { key: "checked_tsql", label: "Conferi o T-SQL completo" },
  { key: "checked_where_clause", label: "Conferi cláusulas WHERE em UPDATE/DELETE" },
  { key: "checked_impact", label: "Conferi o impacto esperado" },
  { key: "checked_timing", label: "Conferi que é o momento adequado para executar" },
  { key: "checked_auto_validation", label: "Revisei o resultado da validação automática" },
] as const;

export default function ApprovalsPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [rejectReason, setRejectReason] = useState("");
  const [error, setError] = useState("");
  const queryClient = useQueryClient();
  const monacoTheme = useMonacoTheme();

  const { data: pending, isLoading } = useQuery({
    queryKey: ["pending"],
    queryFn: getPendingScripts,
    refetchInterval: 5000,
  });

  const selected = pending?.find((s) => s.id === selectedId);

  const mutation = useMutation({
    mutationFn: (approve: boolean) =>
      approveScript(selectedId!, {
        approve,
        checked_environment: checks.checked_environment ?? false,
        checked_tsql: checks.checked_tsql ?? false,
        checked_where_clause: checks.checked_where_clause ?? false,
        checked_impact: checks.checked_impact ?? false,
        checked_timing: checks.checked_timing ?? false,
        checked_auto_validation: checks.checked_auto_validation ?? false,
        rejection_reason: approve ? undefined : rejectReason,
      }),
    onSuccess: () => {
      setSelectedId(null);
      setChecks({});
      setRejectReason("");
      setError("");
      queryClient.invalidateQueries({ queryKey: ["pending"] });
      queryClient.invalidateQueries({ queryKey: ["scripts"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <div>
      <PageHeader
        title="Fila de Aprovação"
        description="Revise scripts pendentes antes da execução"
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card padding={false}>
          <CardHeader>
            <span className="font-semibold text-primary">
              Pendentes ({pending?.length ?? 0})
            </span>
          </CardHeader>
          {isLoading ? (
            <div className="flex justify-center p-8">
              <Spinner />
            </div>
          ) : !pending?.length ? (
            <EmptyState
              icon={ClipboardList}
              title="Nenhum script pendente"
              description="A fila está vazia no momento"
            />
          ) : (
            <CardBody className="divide-y divide-default">
              {pending.map((s) => (
                <button
                  key={s.id}
                  onClick={() => {
                    setSelectedId(s.id);
                    setChecks({});
                    setError("");
                  }}
                  className={`w-full text-left p-4 hover:bg-surface-elevated/50 transition-colors ${
                    selectedId === s.id ? "bg-accent/5 border-l-4 border-accent" : ""
                  }`}
                >
                  <p className="font-medium text-sm text-primary">{s.database_display_name}</p>
                  <p className="text-xs text-muted mt-1">por {s.submitted_by_name}</p>
                  {s.environment === "prod" && (
                    <Badge variant="error" className="mt-2">
                      PRODUÇÃO
                    </Badge>
                  )}
                </button>
              ))}
            </CardBody>
          )}
        </Card>

        <div className="lg:col-span-2">
          {selected ? (
            <Card className="space-y-4">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-semibold text-primary">{selected.database_display_name}</h3>
                  <div className="flex flex-wrap gap-2 mt-1 text-sm text-muted">
                    <span>Submetido por {selected.submitted_by_name}</span>
                    <span>·</span>
                    <span className="capitalize">{selected.environment}</span>
                  </div>
                </div>
                <StatusBadge status={selected.status} />
              </div>

              {selected.validation_result.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-primary">Validação automática</p>
                  {selected.validation_result.map((v, i) => (
                    <Alert key={i} variant={v.severity === "error" ? "error" : "warning"}>
                      [{v.code}] {v.message}
                    </Alert>
                  ))}
                </div>
              )}

              <div className="border border-default rounded-lg overflow-hidden">
                <Editor
                  height="250px"
                  defaultLanguage="sql"
                  value={selected.tsql_content}
                  theme={monacoTheme}
                  options={{ readOnly: true, minimap: { enabled: false }, fontSize: 13 }}
                />
              </div>

              <div className="border-t border-default pt-4 space-y-3">
                <p className="text-sm font-medium text-primary">Checklist de aprovação</p>
                {checklistItems.map((item) => (
                  <label
                    key={item.key}
                    className="flex items-center gap-3 text-sm text-primary cursor-pointer group"
                  >
                    <input
                      type="checkbox"
                      checked={checks[item.key] ?? false}
                      onChange={(e) => setChecks({ ...checks, [item.key]: e.target.checked })}
                      className="w-4 h-4 rounded border-default text-accent focus:ring-accent/30 bg-surface"
                    />
                    <span className="group-hover:text-accent transition-colors">{item.label}</span>
                  </label>
                ))}
              </div>

              {error && <Alert variant="error">{error}</Alert>}

              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <Button
                  onClick={() => mutation.mutate(true)}
                  disabled={mutation.isPending}
                  className="bg-green-600 hover:bg-green-700 focus:ring-green-500/30"
                >
                  <Check className="w-4 h-4" />
                  Aprovar e executar
                </Button>
                <div className="flex-1 flex gap-2">
                  <Input
                    placeholder="Motivo da rejeição..."
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    className="flex-1"
                  />
                  <Button
                    variant="danger"
                    onClick={() => mutation.mutate(false)}
                    disabled={mutation.isPending || !rejectReason}
                  >
                    <X className="w-4 h-4" />
                    Rejeitar
                  </Button>
                </div>
              </div>
            </Card>
          ) : (
            <Card>
              <EmptyState
                icon={ClipboardList}
                title="Selecione um script"
                description="Escolha um item da fila para revisar e aprovar"
              />
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
