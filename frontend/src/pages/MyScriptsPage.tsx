import Editor from "@monaco-editor/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Database,
  FileText,
  Layers,
  MessageSquareX,
  Plus,
  Send,
  ShieldAlert,
  Trash2,
  X,
  Pencil,
} from "lucide-react";
import {
  getBundle,
  getBundles,
  getScript,
  getScripts,
  getServerDatabases,
  getServers,
  resubmitBundle,
  resubmitScript,
  submitBundle,
  submitScript,
} from "@/api/client";
import { BundleLinks } from "@/components/BundleLinks";
import { ServerMultiSelect } from "@/components/BundleLinks";
import StatusBadge from "@/components/StatusBadge";
import Alert from "@/components/ui/Alert";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import PageHeader from "@/components/ui/PageHeader";
import Spinner from "@/components/ui/Spinner";
import { Input, Select } from "@/components/ui/Input";
import { useMonacoTheme } from "@/hooks/useMonacoTheme";
import { normalizeExternalUrl } from "@/utils/url";
import type { BundleStatus, ScriptBundle, ScriptRequest, ScriptStatus, ValidationIssue } from "@/types";

const PAGE_SIZE = 10;
const DEFAULT_TSQL = "-- Digite seu T-SQL aqui\n";

const RESUBMITTABLE_STATUSES: (ScriptStatus | BundleStatus)[] = [
  "auto_rejected",
  "manually_rejected",
  "execution_failed",
];

function canResubmit(status: ScriptStatus | BundleStatus) {
  return RESUBMITTABLE_STATUSES.includes(status);
}

function extractBundleScripts(bundle: ScriptBundle): string[] {
  const bySequence = new Map<number, string>();
  for (const script of bundle.scripts) {
    const seq = script.script_sequence ?? 0;
    if (!bySequence.has(seq)) bySequence.set(seq, script.tsql_content);
  }
  return [...bySequence.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, content]) => content);
}

type ListItem =
  | { kind: "script"; data: ScriptRequest }
  | { kind: "bundle"; data: ScriptBundle };

function formatDate(value: string) {
  return new Date(value).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function validationErrors(issues: ValidationIssue[]) {
  return issues.filter((issue) => issue.severity === "error");
}

function SubmitScriptForm({
  onClose,
  onSubmitted,
}: {
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const [title, setTitle] = useState("");
  const [demandReference, setDemandReference] = useState("");
  const [prUrl, setPrUrl] = useState("");
  const [serverIds, setServerIds] = useState<string[]>([]);
  const [databaseName, setDatabaseName] = useState("");
  const [scripts, setScripts] = useState([DEFAULT_TSQL]);
  const [submitError, setSubmitError] = useState("");
  const [polling, setPolling] = useState(false);
  const queryClient = useQueryClient();
  const monacoTheme = useMonacoTheme();

  const primaryServerId = serverIds[0] ?? "";

  const {
    data: servers,
    isLoading: serversLoading,
    isError: serversError,
    error: serversLoadError,
  } = useQuery({ queryKey: ["servers"], queryFn: getServers });

  const activeServers = servers?.filter((s) => s.active) ?? [];

  const {
    data: databases,
    isLoading: databasesLoading,
    isError: databasesError,
    error: databasesLoadError,
  } = useQuery({
    queryKey: ["server-databases", primaryServerId],
    queryFn: () => getServerDatabases(primaryServerId),
    enabled: !!primaryServerId,
  });

  useEffect(() => {
    setDatabaseName("");
  }, [primaryServerId]);

  const isPackage = serverIds.length > 1 || scripts.length > 1;

  const mutation = useMutation({
    mutationFn: async () => {
      if (isPackage) {
        return submitBundle({
          title,
          demand_reference: normalizeExternalUrl(demandReference),
          pr_url: normalizeExternalUrl(prUrl),
          server_ids: serverIds,
          database_name: databaseName,
          scripts: scripts.map((tsql) => ({ tsql_content: tsql })),
        });
      }
      return submitScript(serverIds[0], databaseName, scripts[0]);
    },
    onSuccess: async (data) => {
      setSubmitError("");
      queryClient.invalidateQueries({ queryKey: ["scripts"] });
      queryClient.invalidateQueries({ queryKey: ["bundles"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setPolling(true);
      await pollUntilDone(data);
      setPolling(false);
      onSubmitted();
    },
    onError: (err: Error) => setSubmitError(err.message),
  });

  const pollUntilDone = async (data: ScriptRequest | ScriptBundle) => {
    const isBundle = "scripts" in data && Array.isArray(data.scripts);
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 1500));
      if (isBundle) {
        const bundle = await getBundle(data.id);
        if (bundle.status !== "validating") return;
      } else {
        const script = await getScript(data.id);
        if (script.status !== "validating") return;
      }
    }
  };

  const addScript = () => setScripts([...scripts, DEFAULT_TSQL]);
  const removeScript = (index: number) => {
    if (scripts.length <= 1) return;
    setScripts(scripts.filter((_, i) => i !== index));
  };
  const updateScript = (index: number, value: string) => {
    const next = [...scripts];
    next[index] = value;
    setScripts(next);
  };
  const moveScript = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= scripts.length) return;
    const next = [...scripts];
    [next[index], next[target]] = [next[target], next[index]];
    setScripts(next);
  };

  const canSubmit =
    serverIds.length > 0 &&
    databaseName &&
    scripts.every((s) => s.trim()) &&
    (!isPackage || (title.trim() && demandReference.trim() && prUrl.trim()));

  return (
    <Card className="mb-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-primary">Submeter solicitação</h2>
          <p className="text-sm text-muted mt-0.5">
            Informe demanda e PR, selecione servidores e envie o(s) script(s).
          </p>
        </div>
        <Button type="button" variant="ghost" onClick={onClose} aria-label="Fechar formulário">
          <X className="w-4 h-4" />
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Input
          label={isPackage ? "Título" : "Título (opcional)"}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <Input
          label={isPackage ? "Link/ID da demanda" : "Link/ID da demanda (opcional)"}
          value={demandReference}
          onChange={(e) => setDemandReference(e.target.value)}
          placeholder="google.com ou https://..."
        />
        <Input
          label={isPackage ? "URL do PR" : "URL do PR (opcional)"}
          value={prUrl}
          onChange={(e) => setPrUrl(e.target.value)}
          placeholder="google.com ou https://..."
        />
      </div>

      {isPackage && (
        <p className="text-xs text-muted -mt-2">
          Título, demanda e PR são obrigatórios para pacotes com múltiplos scripts ou servidores.
        </p>
      )}

      <div>
        <label className="block text-sm font-medium text-primary mb-2">Servidores</label>
        {serversLoading ? (
          <Spinner />
        ) : (
          <ServerMultiSelect
            servers={activeServers}
            selectedIds={serverIds}
            onChange={setServerIds}
          />
        )}
      </div>

      <div className="max-w-md">
        <Select
          label="Base de dados"
          value={databaseName}
          onChange={(e) => setDatabaseName(e.target.value)}
          disabled={!primaryServerId || databasesLoading}
        >
          <option value="">
            {!primaryServerId
              ? "Selecione ao menos um servidor"
              : databasesLoading
                ? "Carregando bases..."
                : "Selecione a base..."}
          </option>
          {databases?.map((db) => (
            <option key={db.name} value={db.name}>
              {db.name}
            </option>
          ))}
        </Select>
        {serverIds.length > 1 && (
          <p className="text-xs text-muted mt-1">
            O mesmo nome de base será usado em todos os servidores selecionados.
          </p>
        )}
      </div>

      {serversError && (
        <Alert variant="error">
          {(serversLoadError as Error)?.message || "Não foi possível carregar os servidores."}
        </Alert>
      )}
      {primaryServerId && databasesError && (
        <Alert variant="error">
          {(databasesLoadError as Error)?.message ||
            "Não foi possível carregar as bases deste servidor."}
        </Alert>
      )}

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-primary">
            Scripts T-SQL ({scripts.length})
          </label>
          <Button type="button" variant="secondary" onClick={addScript} className="!py-1.5 !px-3">
            <Plus className="w-4 h-4" />
            Adicionar script
          </Button>
        </div>

        {scripts.map((tsql, index) => (
          <div key={index} className="border border-default rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 bg-surface-elevated/50 border-b border-default">
              <span className="text-sm font-medium text-primary">Script {index + 1}</span>
              <div className="flex gap-1">
                <button
                  type="button"
                  disabled={index === 0}
                  onClick={() => moveScript(index, -1)}
                  className="p-1 rounded hover:bg-surface disabled:opacity-30"
                >
                  <ArrowUp className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  disabled={index === scripts.length - 1}
                  onClick={() => moveScript(index, 1)}
                  className="p-1 rounded hover:bg-surface disabled:opacity-30"
                >
                  <ArrowDown className="w-4 h-4" />
                </button>
                {scripts.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeScript(index)}
                    className="p-1 rounded hover:bg-surface text-red-500"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
            <Editor
              height="220px"
              defaultLanguage="sql"
              value={tsql}
              onChange={(v) => updateScript(index, v || "")}
              theme={monacoTheme}
              options={{ minimap: { enabled: false }, fontSize: 14 }}
            />
          </div>
        ))}
      </div>

      {isPackage && (
        <Alert variant="info">
          Pacote com {scripts.length} script(s) em {serverIds.length} servidor(es). Execução:
          todos os scripts no 1º servidor, depois no 2º, e assim por diante.
        </Alert>
      )}

      {submitError && <Alert variant="error">{submitError}</Alert>}

      <div className="flex gap-3">
        <Button
          onClick={() => mutation.mutate()}
          disabled={!canSubmit || mutation.isPending || polling}
        >
          {mutation.isPending || polling ? (
            <>
              <Spinner className="w-4 h-4" />
              {polling ? "Validando..." : "Submetendo..."}
            </>
          ) : (
            <>
              <Send className="w-4 h-4" />
              Submeter para validação
            </>
          )}
        </Button>
        <Button type="button" variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
      </div>
    </Card>
  );
}

function ScriptResubmitPanel({
  script,
  onDone,
}: {
  script: ScriptRequest;
  onDone: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [tsql, setTsql] = useState(script.tsql_content);
  const [error, setError] = useState("");
  const queryClient = useQueryClient();
  const monacoTheme = useMonacoTheme();

  const mutation = useMutation({
    mutationFn: () => resubmitScript(script.id, tsql),
    onSuccess: async () => {
      setError("");
      queryClient.invalidateQueries({ queryKey: ["scripts"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 1500));
        const updated = await getScript(script.id);
        if (updated.status !== "validating") break;
      }
      setEditing(false);
      onDone();
    },
    onError: (err: Error) => setError(err.message),
  });

  if (!canResubmit(script.status)) return null;

  return (
    <div className="pt-4 border-t border-default">
      {!editing ? (
        <Button type="button" variant="secondary" onClick={() => setEditing(true)}>
          <Pencil className="w-4 h-4" />
          Editar e reenviar
        </Button>
      ) : (
        <div className="space-y-3">
          <p className="text-sm font-medium text-primary">Corrigir script e reenviar para validação</p>
          <div className="border border-default rounded-lg overflow-hidden">
            <Editor
              height="280px"
              defaultLanguage="sql"
              value={tsql}
              onChange={(v) => setTsql(v || "")}
              theme={monacoTheme}
              options={{ minimap: { enabled: false }, fontSize: 14 }}
            />
          </div>
          {error && <Alert variant="error">{error}</Alert>}
          <div className="flex gap-2">
            <Button
              onClick={() => mutation.mutate()}
              disabled={!tsql.trim() || mutation.isPending}
            >
              {mutation.isPending ? (
                <>
                  <Spinner className="w-4 h-4" />
                  Reenviando...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Reenviar para validação
                </>
              )}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function BundleResubmitPanel({
  bundle,
  onDone,
}: {
  bundle: ScriptBundle;
  onDone: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(bundle.title);
  const [demandReference, setDemandReference] = useState(bundle.demand_reference);
  const [prUrl, setPrUrl] = useState(bundle.pr_url);
  const [scripts, setScripts] = useState(() => extractBundleScripts(bundle));
  const [error, setError] = useState("");
  const queryClient = useQueryClient();
  const monacoTheme = useMonacoTheme();

  const mutation = useMutation({
    mutationFn: () =>
      resubmitBundle(bundle.id, {
        title,
        demand_reference: normalizeExternalUrl(demandReference),
        pr_url: normalizeExternalUrl(prUrl),
        scripts: scripts.map((tsql) => ({ tsql_content: tsql })),
      }),
    onSuccess: async () => {
      setError("");
      queryClient.invalidateQueries({ queryKey: ["bundles"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 1500));
        const updated = await getBundle(bundle.id);
        if (updated.status !== "validating") break;
      }
      setEditing(false);
      onDone();
    },
    onError: (err: Error) => setError(err.message),
  });

  const updateScript = (index: number, value: string) => {
    const next = [...scripts];
    next[index] = value;
    setScripts(next);
  };

  if (!canResubmit(bundle.status)) return null;

  return (
    <div className="pt-4 border-t border-default">
      {!editing ? (
        <Button type="button" variant="secondary" onClick={() => setEditing(true)}>
          <Pencil className="w-4 h-4" />
          Editar e reenviar pacote
        </Button>
      ) : (
        <div className="space-y-4">
          <p className="text-sm font-medium text-primary">
            Corrija os scripts e reenvie o pacote (servidores e estrutura permanecem iguais)
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Input label="Título" value={title} onChange={(e) => setTitle(e.target.value)} />
            <Input
              label="Link/ID da demanda"
              value={demandReference}
              onChange={(e) => setDemandReference(e.target.value)}
            />
            <Input label="URL do PR" value={prUrl} onChange={(e) => setPrUrl(e.target.value)} />
          </div>
          {scripts.map((tsql, index) => (
            <div key={index} className="border border-default rounded-lg overflow-hidden">
              <div className="px-3 py-2 bg-surface-elevated/50 border-b border-default text-sm font-medium">
                Script {index + 1}
              </div>
              <Editor
                height="200px"
                defaultLanguage="sql"
                value={tsql}
                onChange={(v) => updateScript(index, v || "")}
                theme={monacoTheme}
                options={{ minimap: { enabled: false }, fontSize: 14 }}
              />
            </div>
          ))}
          {error && <Alert variant="error">{error}</Alert>}
          <div className="flex gap-2">
            <Button
              onClick={() => mutation.mutate()}
              disabled={
                !title.trim() ||
                !demandReference.trim() ||
                !prUrl.trim() ||
                !scripts.every((s) => s.trim()) ||
                mutation.isPending
              }
            >
              {mutation.isPending ? (
                <>
                  <Spinner className="w-4 h-4" />
                  Reenviando...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Reenviar pacote
                </>
              )}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ScriptDetails({
  script,
  showResubmit,
  onResubmitted,
}: {
  script: ScriptRequest;
  showResubmit?: boolean;
  onResubmitted?: () => void;
}) {
  const errors = validationErrors(script.validation_result);
  const rejectionReason = script.approval?.rejection_reason?.trim();

  return (
    <div className="space-y-4">
      {script.status === "manually_rejected" && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4">
          <div className="flex items-start gap-3">
            <MessageSquareX className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-700 dark:text-red-300">Motivo da rejeição</p>
              <p className="mt-1 text-sm text-primary whitespace-pre-wrap">
                {rejectionReason || "Nenhuma justificativa informada."}
              </p>
            </div>
          </div>
        </div>
      )}

      {script.status === "auto_rejected" && errors.length > 0 && (
        <ul className="space-y-2">
          {errors.map((issue, index) => (
            <li
              key={`${issue.code}-${index}`}
              className="text-sm rounded-md bg-surface px-3 py-2 border border-default"
            >
              <span className="font-mono text-xs text-red-600 dark:text-red-400 mr-2">
                [{issue.code}]
              </span>
              {issue.message}
            </li>
          ))}
        </ul>
      )}

      {script.execution_result && (
        script.execution_result.success ? (
          <Alert variant="success">
            Executado com sucesso
            {script.execution_result.duration_ms != null &&
              ` em ${script.execution_result.duration_ms} ms`}
          </Alert>
        ) : (
          <Alert variant="error">
            Falha: {script.execution_result.error || "Erro desconhecido"}
          </Alert>
        )
      )}

      <pre className="bg-surface p-4 rounded-lg text-xs overflow-x-auto max-h-48 font-mono border border-default whitespace-pre-wrap">
        {script.tsql_content}
      </pre>

      {showResubmit && onResubmitted && (
        <ScriptResubmitPanel script={script} onDone={onResubmitted} />
      )}
    </div>
  );
}

function BundleDetails({
  bundle,
  onResubmitted,
}: {
  bundle: ScriptBundle;
  onResubmitted?: () => void;
}) {
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
      {bundle.approval?.rejection_reason && (
        <Alert variant="error">Rejeição: {bundle.approval.rejection_reason}</Alert>
      )}

      {byServer.map((group, serverIdx) => (
        <div key={serverIdx} className="rounded-lg border border-default overflow-hidden">
          <div className="px-4 py-2 bg-surface-elevated/50 border-b border-default">
            <p className="text-sm font-medium text-primary">
              Servidor {serverIdx + 1}: {group.name}
            </p>
          </div>
          <div className="divide-y divide-default">
            {group.scripts
              .sort((a, b) => (a.script_sequence ?? 0) - (b.script_sequence ?? 0))
              .map((script) => (
                <div key={script.id} className="p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">
                      Script {(script.script_sequence ?? 0) + 1}
                    </span>
                    <StatusBadge status={script.status} />
                  </div>
                  <ScriptDetails script={script} />
                </div>
              ))}
          </div>
        </div>
      ))}

      {onResubmitted && <BundleResubmitPanel bundle={bundle} onDone={onResubmitted} />}
    </div>
  );
}

function ListRow({
  item,
  expanded,
  onToggle,
  onResubmitted,
}: {
  item: ListItem;
  expanded: boolean;
  onToggle: () => void;
  onResubmitted: () => void;
}) {
  if (item.kind === "script") {
    const script = item.data;
    const errorCount = validationErrors(script.validation_result).length;
    return (
      <div className="border-b border-default last:border-b-0">
        <button
          type="button"
          onClick={onToggle}
          className="w-full text-left p-5 hover:bg-surface-elevated/40 transition-colors"
        >
          <div className="flex items-start gap-3">
            <span className="mt-1 text-muted">
              {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <FileText className="w-4 h-4 text-muted" />
                <p className="font-semibold text-primary truncate">{script.database_display_name}</p>
                <StatusBadge status={script.status} />
                {errorCount > 0 && <Badge variant="error">{errorCount} erro(s)</Badge>}
              </div>
              <p className="text-sm text-muted">{formatDate(script.created_at)}</p>
            </div>
          </div>
        </button>
        {expanded && (
          <div className="px-5 pb-5 border-t border-default bg-surface-elevated/30">
            <ScriptDetails script={script} showResubmit onResubmitted={onResubmitted} />
          </div>
        )}
      </div>
    );
  }

  const bundle = item.data;
  return (
    <div className="border-b border-default last:border-b-0">
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
        className="w-full text-left p-5 hover:bg-surface-elevated/40 transition-colors cursor-pointer"
      >
        <div className="flex items-start gap-3">
          <span className="mt-1 text-muted">
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <Layers className="w-4 h-4 text-accent" />
              <p className="font-semibold text-primary">{bundle.title}</p>
              <span
                className="inline-flex"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
              >
                <BundleLinks bundle={bundle} className="gap-2 text-xs" />
              </span>
              <StatusBadge status={bundle.status} />
              <Badge variant="default">
                {bundle.script_count} script(s) × {bundle.server_count} servidor(es)
              </Badge>
            </div>
            <div className="flex flex-wrap gap-x-4 text-sm text-muted">
              <span className="inline-flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5" />
                {bundle.database_name}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                {formatDate(bundle.created_at)}
              </span>
            </div>
          </div>
        </div>
      </div>
      {expanded && (
        <div className="px-5 pb-5 border-t border-default bg-surface-elevated/30">
          <BundleDetails bundle={bundle} onResubmitted={onResubmitted} />
        </div>
      )}
    </div>
  );
}

function Pagination({
  page,
  totalPages,
  totalItems,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  totalItems: number;
  onPageChange: (page: number) => void;
}) {
  if (totalItems === 0) return null;
  const start = (page - 1) * PAGE_SIZE + 1;
  const end = Math.min(page * PAGE_SIZE, totalItems);

  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 border-t border-default">
      <p className="text-sm text-muted">
        {start}–{end} de {totalItems}
      </p>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="!py-2 !px-3"
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <span className="text-sm text-muted">
          {page} / {totalPages}
        </span>
        <Button
          type="button"
          variant="secondary"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="!py-2 !px-3"
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

export default function MyScriptsPage() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showSubmitForm, setShowSubmitForm] = useState(false);
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();

  const { data: scripts, isLoading: scriptsLoading } = useQuery({
    queryKey: ["scripts"],
    queryFn: getScripts,
  });
  const { data: bundles, isLoading: bundlesLoading } = useQuery({
    queryKey: ["bundles"],
    queryFn: getBundles,
  });

  const items = useMemo<ListItem[]>(() => {
    const list: ListItem[] = [
      ...(scripts ?? []).map((s) => ({ kind: "script" as const, data: s })),
      ...(bundles ?? []).map((b) => ({ kind: "bundle" as const, data: b })),
    ];
    return list.sort((a, b) => +new Date(b.data.created_at) - +new Date(a.data.created_at));
  }, [scripts, bundles]);

  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const paginated = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return items.slice(start, start + PAGE_SIZE);
  }, [items, page]);

  const isLoading = scriptsLoading || bundlesLoading;

  const handleResubmitted = () => {
    queryClient.invalidateQueries({ queryKey: ["scripts"] });
    queryClient.invalidateQueries({ queryKey: ["bundles"] });
  };

  return (
    <div>
      <PageHeader
        title="Minhas Solicitações"
        description="Submeta scripts e pacotes; acompanhe validação e execução"
        actions={
          !showSubmitForm ? (
            <Button onClick={() => setShowSubmitForm(true)}>
              <Plus className="w-4 h-4" />
              Nova solicitação
            </Button>
          ) : undefined
        }
      />

      {showSubmitForm && (
        <SubmitScriptForm
          onClose={() => setShowSubmitForm(false)}
          onSubmitted={() => {
            setShowSubmitForm(false);
            setPage(1);
          }}
        />
      )}

      <Card padding={false}>
        {isLoading ? (
          <div className="flex justify-center p-12">
            <Spinner />
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="Nenhuma solicitação encontrada"
            description="Clique em Nova solicitação para enviar seu primeiro T-SQL"
          />
        ) : (
          <>
            {paginated.map((item) => {
              const id = `${item.kind}-${item.data.id}`;
              return (
                <ListRow
                  key={id}
                  item={item}
                  expanded={expandedId === id}
                  onToggle={() =>
                    setExpandedId((current) => (current === id ? null : id))
                  }
                  onResubmitted={handleResubmitted}
                />
              );
            })}
            <Pagination
              page={page}
              totalPages={totalPages}
              totalItems={items.length}
              onPageChange={setPage}
            />
          </>
        )}
      </Card>
    </div>
  );
}
