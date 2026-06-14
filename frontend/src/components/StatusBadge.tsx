import type { ScriptStatus } from "@/types";
import Badge from "@/components/ui/Badge";

const statusConfig: Record<ScriptStatus, { label: string; variant: "info" | "error" | "warning" | "success" | "default" }> = {
  validating: { label: "Validando", variant: "info" },
  auto_rejected: { label: "Reprovado (auto)", variant: "error" },
  pending_approval: { label: "Pendente aprovação", variant: "warning" },
  approved: { label: "Aprovado", variant: "success" },
  executing: { label: "Executando", variant: "info" },
  executed: { label: "Executado", variant: "success" },
  execution_failed: { label: "Falha na execução", variant: "error" },
  manually_rejected: { label: "Rejeitado", variant: "error" },
};

export default function StatusBadge({ status }: { status: ScriptStatus }) {
  const config = statusConfig[status] || { label: status, variant: "default" as const };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
