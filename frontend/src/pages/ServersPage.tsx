import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useState } from "react";

import { Plug, Plus } from "lucide-react";

import {
  createServer,
  getServers,
  testServerConnection,
  updateServer,
} from "@/api/client";

import type { Server } from "@/types";

import Alert from "@/components/ui/Alert";

import Badge from "@/components/ui/Badge";

import Button from "@/components/ui/Button";

import { Card } from "@/components/ui/Card";

import PageHeader from "@/components/ui/PageHeader";

import Spinner from "@/components/ui/Spinner";

import { Input, Textarea } from "@/components/ui/Input";

import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeader,
  TableCell,
} from "@/components/ui/Table";

type ConnectionTestResult = {
  success: boolean;

  message: string;

  duration_ms: number;
};

type ServerForm = {
  name: string;

  host: string;

  validation_connection_string: string;

  execution_connection_string: string;
};

const emptyForm: ServerForm = {
  name: "",

  host: "",

  validation_connection_string: "",

  execution_connection_string: "",
};

export default function ServersPage() {
  const [showForm, setShowForm] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);

  const [form, setForm] = useState<ServerForm>(emptyForm);

  const [error, setError] = useState("");

  const [testResults, setTestResults] = useState<{
    validation?: ConnectionTestResult;

    execution?: ConnectionTestResult;
  }>({});

  const [testingType, setTestingType] = useState<
    "validation" | "execution" | null
  >(null);

  const queryClient = useQueryClient();

  const isEditing = editingId !== null;

  const { data: servers, isLoading } = useQuery({
    queryKey: ["servers"],
    queryFn: getServers,
  });

  const resetForm = () => {
    setForm(emptyForm);

    setEditingId(null);

    setShowForm(false);

    setTestResults({});

    setError("");
  };

  const openCreate = () => {
    if (showForm && !isEditing) {
      resetForm();
    } else {
      setEditingId(null);

      setForm(emptyForm);

      setTestResults({});

      setError("");

      setShowForm(true);
    }
  };

  const openEdit = (server: Server) => {
    setEditingId(server.id);

    setForm({
      name: server.name,

      host: server.host,

      validation_connection_string: "",

      execution_connection_string: "",
    });

    setTestResults({});

    setError("");

    setShowForm(true);
  };

  const saveMut = useMutation({
    mutationFn: () => {
      if (isEditing) {
        const payload: Record<string, string> = {
          name: form.name,

          host: form.host,
        };

        if (form.validation_connection_string.trim()) {
          payload.validation_connection_string =
            form.validation_connection_string;
        }

        if (form.execution_connection_string.trim()) {
          payload.execution_connection_string =
            form.execution_connection_string;
        }

        return updateServer(editingId, payload);
      }

      return createServer(form);
    },

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["servers"] });

      resetForm();
    },

    onError: (err: Error) => setError(err.message),
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      updateServer(id, { active }),

    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["servers"] }),
  });

  const testMut = useMutation({
    mutationFn: (type: "validation" | "execution") => {
      const connection_string =
        type === "validation"
          ? form.validation_connection_string
          : form.execution_connection_string;

      return testServerConnection(connection_string).then((result) => ({
        type,
        ...result,
      }));
    },

    onMutate: (type) => setTestingType(type),

    onSuccess: (data) => {
      setTestResults((prev) => ({
        ...prev,

        [data.type]: {
          success: data.success,
          message: data.message,
          duration_ms: data.duration_ms,
        },
      }));
    },

    onError: (err: Error, type) => {
      setTestResults((prev) => ({
        ...prev,

        [type]: { success: false, message: err.message, duration_ms: 0 },
      }));
    },

    onSettled: () => setTestingType(null),
  });

  function handleTest(type: "validation" | "execution") {
    const connection_string =
      type === "validation"
        ? form.validation_connection_string
        : form.execution_connection_string;

    if (!connection_string.trim()) return;

    testMut.mutate(type);
  }

  const handleSubmit = () => {
    setError("");

    if (!form.name.trim() || !form.host.trim()) {
      setError("Nome e host são obrigatórios.");

      return;
    }

    if (
      !isEditing &&
      (!form.validation_connection_string.trim() ||
        !form.execution_connection_string.trim())
    ) {
      setError("Connection strings de validação e execução são obrigatórias.");

      return;
    }

    saveMut.mutate();
  };

  return (
    <div>
      <PageHeader
        title="Servidores"
        description="Gerencie servidores SQL Server e suas connection strings"
        actions={
          <Button onClick={openCreate}>
            <Plus className="w-4 h-4" />

            {showForm && !isEditing ? "Cancelar" : "Novo servidor"}
          </Button>
        }
      />

      {showForm && (
        <Card className="mb-6 space-y-4">
          <p className="text-sm font-medium text-primary">
            {isEditing ? "Editar servidor" : "Novo servidor"}
          </p>

          <p className="text-sm text-muted">
            {isEditing
              ? "Connection strings são criptografadas. Deixe em branco para manter as atuais."
              : "Connection strings são criptografadas e nunca exibidas novamente."}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              placeholder="Nome"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />

            <Input
              placeholder="Host"
              value={form.host}
              onChange={(e) => setForm({ ...form, host: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Textarea
              placeholder={
                isEditing
                  ? "Nova connection string de validação (opcional)"
                  : "Connection string de validação (read-only)"
              }
              value={form.validation_connection_string}
              onChange={(e) => {
                setForm({
                  ...form,
                  validation_connection_string: e.target.value,
                });

                setTestResults((prev) => ({ ...prev, validation: undefined }));
              }}
              className="font-mono text-sm h-20"
            />

            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="secondary"
                onClick={() => handleTest("validation")}
                disabled={
                  !form.validation_connection_string.trim() ||
                  testingType === "validation"
                }
              >
                <Plug className="w-4 h-4" />

                {testingType === "validation"
                  ? "Testando..."
                  : "Testar validação"}
              </Button>

              {testResults.validation && (
                <Alert
                  variant={testResults.validation.success ? "success" : "error"}
                  className="flex-1 py-2"
                >
                  {testResults.validation.success
                    ? `${testResults.validation.message} (${testResults.validation.duration_ms} ms)`
                    : testResults.validation.message}
                </Alert>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Textarea
              placeholder={
                isEditing
                  ? "Nova connection string de execução (opcional)"
                  : "Connection string de execução (least-privilege)"
              }
              value={form.execution_connection_string}
              onChange={(e) => {
                setForm({
                  ...form,
                  execution_connection_string: e.target.value,
                });

                setTestResults((prev) => ({ ...prev, execution: undefined }));
              }}
              className="font-mono text-sm h-20"
            />

            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="secondary"
                onClick={() => handleTest("execution")}
                disabled={
                  !form.execution_connection_string.trim() ||
                  testingType === "execution"
                }
              >
                <Plug className="w-4 h-4" />

                {testingType === "execution"
                  ? "Testando..."
                  : "Testar execução"}
              </Button>

              {testResults.execution && (
                <Alert
                  variant={testResults.execution.success ? "success" : "error"}
                  className="flex-1 py-2"
                >
                  {testResults.execution.success
                    ? `${testResults.execution.message} (${testResults.execution.duration_ms} ms)`
                    : testResults.execution.message}
                </Alert>
              )}
            </div>
          </div>

          {error && <Alert variant="error">{error}</Alert>}

          <div className="flex gap-3">
            <Button onClick={handleSubmit} disabled={saveMut.isPending}>
              {saveMut.isPending
                ? "Salvando..."
                : isEditing
                  ? "Atualizar"
                  : "Salvar"}
            </Button>

            <Button type="button" variant="secondary" onClick={resetForm}>
              Cancelar
            </Button>
          </div>
        </Card>
      )}

      <Card padding={false}>
        {isLoading ? (
          <div className="flex justify-center p-12">
            <Spinner />
          </div>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>Nome</TableHeader>

                <TableHeader>Host</TableHeader>

                <TableHeader>Provider</TableHeader>

                <TableHeader>Status</TableHeader>

                <TableHeader>Ações</TableHeader>
              </TableRow>
            </TableHead>

            <TableBody>
              {servers?.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.name}</TableCell>

                  <TableCell>{s.host}</TableCell>

                  <TableCell>{s.provider}</TableCell>

                  <TableCell>
                    <Badge variant={s.active ? "success" : "default"}>
                      {s.active ? "Ativo" : "Inativo"}
                    </Badge>
                  </TableCell>

                  <TableCell>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => openEdit(s)}
                        className="text-accent hover:underline text-xs"
                      >
                        Editar
                      </button>

                      <button
                        onClick={() =>
                          toggleMut.mutate({ id: s.id, active: !s.active })
                        }
                        className="text-accent hover:underline text-xs"
                      >
                        {s.active ? "Desativar" : "Ativar"}
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
