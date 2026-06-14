import Editor from "@monaco-editor/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Check, ClipboardList, FileText, Layers, X } from "lucide-react";
import {
  approveBundle,
  approveScript,
  getPendingBundles,
  getPendingScripts,
} from "@/api/client";
import { BundleLinks } from "@/components/BundleLinks";
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
import type { ScriptBundle, ScriptRequest } from "@/types";

const checklistItems = [
  { key: "checked_environment", label: "Conferi o ambiente/base de dados" },
  { key: "checked_tsql", label: "Conferi o T-SQL completo" },
  { key: "checked_where_clause", label: "Conferi cláusulas WHERE em UPDATE/DELETE" },
  { key: "checked_impact", label: "Conferi o impacto esperado" },
  { key: "checked_timing", label: "Conferi que é o momento adequado para executar" },
  { key: "checked_auto_validation", label: "Revisei o resultado da validação automática" },
] as const;

type QueueItem =
  | { kind: "script"; id: string; data: ScriptRequest }
  | { kind: "bundle"; id: string; data: ScriptBundle };

function ChecklistForm({
  checks,
  setChecks,
  rejectReason,
  setRejectReason,
  error,
  isPending,
  onApprove,
  onReject,
}: {
  checks: Record<string, boolean>;
  setChecks: (v: Record<string, boolean>) => void;
  rejectReason: string;
  setRejectReason: (v: string) => void;
  error: string;
  isPending: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <>
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
          onClick={onApprove}
          disabled={isPending}
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
          <Button variant="danger" onClick={onReject} disabled={isPending || !rejectReason}>
            <X className="w-4 h-4" />
            Rejeitar
          </Button>
        </div>
      </div>
    </>
  );
}

function BundleApprovalDetail({ bundle }: { bundle: ScriptBundle }) {
  const monacoTheme = useMonacoTheme();

  const byServer = useMemo(() => {
    const groups: Record<number, { name: string; scripts: ScriptRequest[] }> = {};
    for (const script of bundle.scripts) {
      const seq = script.server_sequence ?? 0;
      if (!groups[seq]) {
        groups[seq] = {
          name: bundle.server_names[seq] || `Servidor ${seq + 1}`,
          scripts: [],
        };
      }
      groups[seq].scripts.push(script);
    }
    return Object.entries(groups)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([, g]) => g);
  }, [bundle]);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-start">
        <div>
          <h3 className="font-semibold text-primary">{bundle.title}</h3>
          <div className="flex flex-wrap gap-2 mt-1 text-sm text-muted">
            <span>por {bundle.submitted_by_name}</span>
            <span>·</span>
            <span>
              {bundle.script_count} script(s) × {bundle.server_count} servidor(es)
            </span>
            <span>·</span>
            <span>{bundle.database_name}</span>
          </div>
          <div className="mt-2">
            <BundleLinks bundle={bundle} />
          </div>
        </div>
        <StatusBadge status={bundle.status} />
      </div>

      {byServer.map((group, serverIdx) => (
        <div key={serverIdx} className="rounded-lg border border-default overflow-hidden">
          <div className="px-4 py-2 bg-surface-elevated/50 border-b border-default text-sm font-medium">
            Servidor {serverIdx + 1}: {group.name}
          </div>
          <div className="divide-y divide-default">
            {group.scripts
              .sort((a, b) => (a.script_sequence ?? 0) - (b.script_sequence ?? 0))
              .map((script) => (
                <div key={script.id} className="p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">
                      Script {(script.script_sequence ?? 0) + 1}
                    </span>
                    <StatusBadge status={script.status} />
                  </div>
                  {script.validation_result.length > 0 && (
                    <div className="space-y-2">
                      {script.validation_result.map((v, i) => (
                        <Alert key={i} variant={v.severity === "error" ? "error" : "warning"}>
                          [{v.code}] {v.message}
                        </Alert>
                      ))}
                    </div>
                  )}
                  <div className="border border-default rounded-lg overflow-hidden">
                    <Editor
                      height="180px"
                      defaultLanguage="sql"
                      value={script.tsql_content}
                      theme={monacoTheme}
                      options={{ readOnly: true, minimap: { enabled: false }, fontSize: 13 }}
                    />
                  </div>
                </div>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ApprovalsPage() {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [rejectReason, setRejectReason] = useState("");
  const [error, setError] = useState("");
  const queryClient = useQueryClient();
  const monacoTheme = useMonacoTheme();

  const { data: pendingScripts, isLoading: scriptsLoading } = useQuery({
    queryKey: ["pending"],
    queryFn: getPendingScripts,
    refetchInterval: 5000,
  });

  const { data: pendingBundles, isLoading: bundlesLoading } = useQuery({
    queryKey: ["pending-bundles"],
    queryFn: getPendingBundles,
    refetchInterval: 5000,
  });

  const queue = useMemo<QueueItem[]>(() => {
    const items: QueueItem[] = [
      ...(pendingBundles ?? []).map((b) => ({
        kind: "bundle" as const,
        id: `bundle-${b.id}`,
        data: b,
      })),
      ...(pendingScripts ?? []).map((s) => ({
        kind: "script" as const,
        id: `script-${s.id}`,
        data: s,
      })),
    ];
    return items.sort(
      (a, b) => +new Date(b.data.created_at) - +new Date(a.data.created_at),
    );
  }, [pendingBundles, pendingScripts]);

  const selected = queue.find((q) => q.id === selectedKey);

  const buildApprovalPayload = (approve: boolean) => ({
    approve,
    checked_environment: checks.checked_environment ?? false,
    checked_tsql: checks.checked_tsql ?? false,
    checked_where_clause: checks.checked_where_clause ?? false,
    checked_impact: checks.checked_impact ?? false,
    checked_timing: checks.checked_timing ?? false,
    checked_auto_validation: checks.checked_auto_validation ?? false,
    rejection_reason: approve ? undefined : rejectReason,
  });

  const mutation = useMutation({
    mutationFn: async (approve: boolean) => {
      if (!selected) throw new Error("Nenhum item selecionado");
      if (selected.kind === "bundle") {
        return approveBundle(selected.data.id, buildApprovalPayload(approve));
      }
      return approveScript(selected.data.id, buildApprovalPayload(approve));
    },
    onSuccess: () => {
      setSelectedKey(null);
      setChecks({});
      setRejectReason("");
      setError("");
      queryClient.invalidateQueries({ queryKey: ["pending"] });
      queryClient.invalidateQueries({ queryKey: ["pending-bundles"] });
      queryClient.invalidateQueries({ queryKey: ["scripts"] });
      queryClient.invalidateQueries({ queryKey: ["bundles"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const isLoading = scriptsLoading || bundlesLoading;

  return (
    <div>
      <PageHeader
        title="Fila de Aprovação"
        description="Revise pacotes e scripts pendentes antes da execução"
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card padding={false}>
          <CardHeader>
            <span className="font-semibold text-primary">
              Pendentes ({queue.length})
            </span>
          </CardHeader>
          {isLoading ? (
            <div className="flex justify-center p-8">
              <Spinner />
            </div>
          ) : queue.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title="Nenhum item pendente"
              description="A fila está vazia no momento"
            />
          ) : (
            <CardBody className="divide-y divide-default">
              {queue.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    setSelectedKey(item.id);
                    setChecks({});
                    setError("");
                  }}
                  className={`w-full text-left p-4 hover:bg-surface-elevated/50 transition-colors ${
                    selectedKey === item.id ? "bg-accent/5 border-l-4 border-accent" : ""
                  }`}
                >
                  {item.kind === "bundle" ? (
                    <>
                      <div className="flex items-center gap-2">
                        <Layers className="w-4 h-4 text-accent shrink-0" />
                        <p className="font-medium text-sm text-primary">{item.data.title}</p>
                      </div>
                      <p className="text-xs text-muted mt-1">
                        por {item.data.submitted_by_name} · {item.data.script_count}×
                        {item.data.server_count}
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-muted shrink-0" />
                        <p className="font-medium text-sm text-primary">
                          {item.data.database_display_name}
                        </p>
                      </div>
                      <p className="text-xs text-muted mt-1">por {item.data.submitted_by_name}</p>
                    </>
                  )}
                  {item.data.environment === "prod" && (
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
              {selected.kind === "bundle" ? (
                <BundleApprovalDetail bundle={selected.data} />
              ) : (
                <>
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-semibold text-primary">
                        {selected.data.database_display_name}
                      </h3>
                      <p className="text-sm text-muted mt-1">
                        Submetido por {selected.data.submitted_by_name}
                      </p>
                    </div>
                    <StatusBadge status={selected.data.status} />
                  </div>
                  {selected.data.validation_result.length > 0 && (
                    <div className="space-y-2">
                      {selected.data.validation_result.map((v, i) => (
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
                      value={selected.data.tsql_content}
                      theme={monacoTheme}
                      options={{ readOnly: true, minimap: { enabled: false }, fontSize: 13 }}
                    />
                  </div>
                </>
              )}

              <ChecklistForm
                checks={checks}
                setChecks={setChecks}
                rejectReason={rejectReason}
                setRejectReason={setRejectReason}
                error={error}
                isPending={mutation.isPending}
                onApprove={() => mutation.mutate(true)}
                onReject={() => mutation.mutate(false)}
              />
            </Card>
          ) : (
            <Card>
              <EmptyState
                icon={ClipboardList}
                title="Selecione um item"
                description="Escolha um pacote ou script da fila para revisar"
              />
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
