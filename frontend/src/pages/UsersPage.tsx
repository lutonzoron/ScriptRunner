import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useState } from "react";

import { Plus } from "lucide-react";

import { createUser, getUsers, updateUser } from "@/api/client";

import { useAuth } from "@/context/AuthContext";

import type { User, UserRole } from "@/types";

import Alert from "@/components/ui/Alert";

import Badge from "@/components/ui/Badge";

import Button from "@/components/ui/Button";

import { Card } from "@/components/ui/Card";

import PageHeader from "@/components/ui/PageHeader";

import { Input, Select } from "@/components/ui/Input";

import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeader,
  TableCell,
} from "@/components/ui/Table";

type UserForm = {
  email: string;

  name: string;

  password: string;

  role: UserRole;
};

const emptyForm: UserForm = {
  email: "",

  name: "",

  password: "",

  role: "user",
};

export default function UsersPage() {
  const { user: currentUser } = useAuth();

  const [showForm, setShowForm] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);

  const [form, setForm] = useState<UserForm>(emptyForm);

  const [error, setError] = useState("");

  const [success, setSuccess] = useState("");

  const queryClient = useQueryClient();

  const isEditing = editingId !== null;

  const { data: users } = useQuery({ queryKey: ["users"], queryFn: getUsers });

  const roleOptions: UserRole[] =
    currentUser?.role === "admin" ? ["user", "coordinator", "admin"] : ["user"];

  const canEditUser = (target: User) => {
    if (target.id === currentUser?.id) return false;

    if (currentUser?.role === "admin") return true;

    return target.role === "user";
  };

  const resetForm = () => {
    setForm(emptyForm);

    setEditingId(null);

    setShowForm(false);

    setError("");
  };

  const openCreate = () => {
    if (showForm && !isEditing) {
      resetForm();
    } else {
      setEditingId(null);

      setForm(emptyForm);

      setError("");

      setSuccess("");

      setShowForm(true);
    }
  };

  const openEdit = (user: User) => {
    setEditingId(user.id);

    setForm({
      email: user.email,

      name: user.name,

      password: "",

      role: user.role,
    });

    setError("");

    setSuccess("");

    setShowForm(true);
  };

  const saveMut = useMutation({
    mutationFn: () => {
      if (isEditing) {
        const payload: Record<string, string> = {
          name: form.name,

          role: form.role,
        };

        if (form.password.trim()) {
          payload.password = form.password;
        }

        return updateUser(editingId, payload);
      }

      return createUser(form);
    },

    onSuccess: (saved) => {
      const wasEditing = isEditing;

      queryClient.invalidateQueries({ queryKey: ["users"] });

      resetForm();

      setSuccess(
        `Usuário "${saved.name}" ${wasEditing ? "atualizado" : "cadastrado"} com sucesso.`,
      );
    },

    onError: (err: Error) => {
      setSuccess("");

      setError(err.message);
    },
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      updateUser(id, { active }),

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });

      setError("");
    },

    onError: (err: Error) => {
      setSuccess("");

      setError(err.message);
    },
  });

  const handleSubmit = () => {
    setError("");

    setSuccess("");

    if (!form.name.trim()) {
      setError("Nome é obrigatório.");

      return;
    }

    if (!isEditing) {
      if (!form.email.trim()) {
        setError("E-mail é obrigatório.");

        return;
      }

      if (!form.password || form.password.length < 8) {
        setError("Senha deve ter no mínimo 8 caracteres.");

        return;
      }
    } else if (form.password && form.password.length < 8) {
      setError("Nova senha deve ter no mínimo 8 caracteres.");

      return;
    }

    saveMut.mutate();
  };

  const editRoleOptions =
    isEditing && currentUser?.role === "coordinator"
      ? (["user"] as UserRole[])
      : roleOptions;

  return (
    <div>
      <PageHeader
        title="Usuários"
        description="Gerencie contas e permissões de acesso"
        actions={
          <Button onClick={openCreate}>
            <Plus className="w-4 h-4" />

            {showForm && !isEditing ? "Cancelar" : "Novo usuário"}
          </Button>
        }
      />

      {success && !showForm && (
        <Alert variant="success" className="mb-4">
          {success}
        </Alert>
      )}

      {error && !showForm && (
        <Alert variant="error" className="mb-4">
          {error}
        </Alert>
      )}

      {showForm && (
        <Card className="mb-6 space-y-4">
          <p className="text-sm font-medium text-primary">
            {isEditing ? "Editar usuário" : "Novo usuário"}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Nome"
              value={form.name}
              onChange={(e) => {
                setForm({ ...form, name: e.target.value });

                setError("");
              }}
            />

            <Input
              label="E-mail"
              type="email"
              value={form.email}
              disabled={isEditing}
              onChange={(e) => {
                setForm({ ...form, email: e.target.value });

                setError("");
              }}
              hint={isEditing ? "E-mail não pode ser alterado" : undefined}
            />

            <Input
              label={isEditing ? "Nova senha" : "Senha"}
              type="password"
              value={form.password}
              onChange={(e) => {
                setForm({ ...form, password: e.target.value });

                setError("");
              }}
              hint={
                isEditing
                  ? "Deixe em branco para manter a senha atual"
                  : "Mínimo de 8 caracteres"
              }
            />

            <Select
              label="Papel"
              value={form.role}
              onChange={(e) =>
                setForm({ ...form, role: e.target.value as UserRole })
              }
            >
              {editRoleOptions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </Select>
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
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>Nome</TableHeader>

              <TableHeader>E-mail</TableHeader>

              <TableHeader>Papel</TableHeader>

              <TableHeader>Status</TableHeader>

              <TableHeader>Ações</TableHeader>
            </TableRow>
          </TableHead>

          <TableBody>
            {users?.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.name}</TableCell>

                <TableCell>{u.email}</TableCell>

                <TableCell className="capitalize">{u.role}</TableCell>

                <TableCell>
                  <Badge variant={u.active ? "success" : "default"}>
                    {u.active ? "Ativo" : "Inativo"}
                  </Badge>
                </TableCell>

                <TableCell>
                  {canEditUser(u) && (
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => openEdit(u)}
                        className="text-accent hover:underline text-xs"
                      >
                        Editar
                      </button>

                      <button
                        onClick={() =>
                          toggleMut.mutate({ id: u.id, active: !u.active })
                        }
                        disabled={toggleMut.isPending}
                        className="text-accent hover:underline text-xs disabled:opacity-50"
                      >
                        {u.active ? "Desativar" : "Ativar"}
                      </button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
