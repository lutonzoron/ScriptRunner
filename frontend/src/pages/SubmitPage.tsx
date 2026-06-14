import Editor from "@monaco-editor/react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useEffect, useState } from "react";

import { Send } from "lucide-react";

import {
  getScript,
  getServers,
  getServerDatabases,
  submitScript,
} from "@/api/client";

import StatusBadge from "@/components/StatusBadge";

import Alert from "@/components/ui/Alert";

import Button from "@/components/ui/Button";

import { Card } from "@/components/ui/Card";

import PageHeader from "@/components/ui/PageHeader";

import Spinner from "@/components/ui/Spinner";

import { Select } from "@/components/ui/Input";

import { useMonacoTheme } from "@/hooks/useMonacoTheme";

import type { ScriptRequest } from "@/types";

export default function SubmitPage() {
  const [tsql, setTsql] = useState("-- Digite seu T-SQL aqui\n");

  const [serverId, setServerId] = useState("");

  const [databaseName, setDatabaseName] = useState("");

  const [result, setResult] = useState<ScriptRequest | null>(null);

  const [error, setError] = useState("");

  const queryClient = useQueryClient();

  const monacoTheme = useMonacoTheme();

  const {
    data: servers,
    isLoading: serversLoading,
    isError: serversError,
    error: serversLoadError,
  } = useQuery({
    queryKey: ["servers"],
    queryFn: getServers,
  });

  const activeServers = servers?.filter((s) => s.active) ?? [];

  const {
    data: databases,

    isLoading: databasesLoading,

    isError: databasesError,

    error: databasesLoadError,
  } = useQuery({
    queryKey: ["server-databases", serverId],

    queryFn: () => getServerDatabases(serverId),

    enabled: !!serverId,
  });

  useEffect(() => {
    setDatabaseName("");
  }, [serverId]);

  const mutation = useMutation({
    mutationFn: () => submitScript(serverId, databaseName, tsql),

    onSuccess: (data) => {
      setResult(data);

      setError("");

      queryClient.invalidateQueries({ queryKey: ["scripts"] });

      queryClient.invalidateQueries({ queryKey: ["dashboard"] });

      pollStatus(data.id);
    },

    onError: (err: Error) => setError(err.message),
  });

  const pollStatus = async (id: string) => {
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 1500));

      const script = await getScript(id);

      setResult(script);

      if (script.status !== "validating") break;
    }
  };

  const selectedServer = servers?.find((s) => s.id === serverId);

  return (
    <div>
      <PageHeader
        title="Submeter Script"
        description="Selecione o servidor e a base, depois envie o T-SQL para validação"
      />

      <Card className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
          <Select
            label="Servidor"
            value={serverId}
            onChange={(e) => setServerId(e.target.value)}
            disabled={serversLoading}
          >
            <option value="">
              {serversLoading
                ? "Carregando servidores..."
                : "Selecione o servidor..."}
            </option>

            {activeServers.map((server) => (
              <option key={server.id} value={server.id}>
                {server.name} ({server.host})
              </option>
            ))}
          </Select>

          <Select
            label="Base de dados"
            value={databaseName}
            onChange={(e) => setDatabaseName(e.target.value)}
            disabled={!serverId || databasesLoading}
          >
            <option value="">
              {!serverId
                ? "Selecione um servidor primeiro"
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
        </div>

        {serversError && (
          <Alert variant="error">
            {(serversLoadError as Error)?.message ||
              "Não foi possível carregar os servidores."}
          </Alert>
        )}

        {!serversLoading && !serversError && activeServers.length === 0 && (
          <Alert variant="warning">
            Nenhum servidor ativo cadastrado. Um administrador precisa
            configurar um servidor em <strong>Servidores</strong>.
          </Alert>
        )}

        {serverId && databasesError && (
          <Alert variant="error">
            {(databasesLoadError as Error)?.message ||
              "Não foi possível carregar as bases deste servidor."}
          </Alert>
        )}

        {selectedServer &&
          databases &&
          databases.length === 0 &&
          !databasesLoading &&
          !databasesError && (
            <Alert variant="warning">
              Nenhuma base online encontrada em {selectedServer.name}.
            </Alert>
          )}

        <div>
          <label className="block text-sm font-medium text-primary mb-1">
            Editor T-SQL
          </label>

          <div className="border border-default rounded-lg overflow-hidden">
            <Editor
              height="400px"
              defaultLanguage="sql"
              value={tsql}
              onChange={(v) => setTsql(v || "")}
              theme={monacoTheme}
              options={{ minimap: { enabled: false }, fontSize: 14 }}
            />
          </div>
        </div>

        {error && <Alert variant="error">{error}</Alert>}

        <Button
          onClick={() => mutation.mutate()}
          disabled={
            !serverId || !databaseName || !tsql.trim() || mutation.isPending
          }
        >
          {mutation.isPending ? (
            <>
              <Spinner className="w-4 h-4" />
              Submetendo...
            </>
          ) : (
            <>
              <Send className="w-4 h-4" />
              Submeter para validação
            </>
          )}
        </Button>
      </Card>

      {result && (
        <Card className="mt-6">
          <div className="flex items-center gap-3 mb-4">
            <h3 className="font-semibold text-primary">
              Resultado da submissão
            </h3>

            <StatusBadge status={result.status} />
          </div>

          {result.validation_result.length > 0 && (
            <div className="space-y-2">
              {result.validation_result.map((v, i) => (
                <Alert
                  key={i}
                  variant={v.severity === "error" ? "error" : "warning"}
                >
                  <span className="font-mono text-xs mr-2">[{v.code}]</span>

                  {v.message}
                </Alert>
              ))}
            </div>
          )}

          {result.status === "pending_approval" && (
            <Alert variant="success" className="mt-4">
              Script passou na validação automática e aguarda aprovação manual.
            </Alert>
          )}
        </Card>
      )}
    </div>
  );
}
