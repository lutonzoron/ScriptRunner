import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { exportAuditUrl, getAuditLogs, getAccessToken } from "@/api/client";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import PageHeader from "@/components/ui/PageHeader";
import Spinner from "@/components/ui/Spinner";
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from "@/components/ui/Table";

export default function AuditPage() {
  const { data: logs, isLoading } = useQuery({
    queryKey: ["audit"],
    queryFn: () => getAuditLogs({ limit: "200" }),
  });

  const handleExport = async () => {
    const token = getAccessToken();
    const res = await fetch(exportAuditUrl(), {
      credentials: "include",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "audit_logs.csv";
    a.click();
  };

  return (
    <div>
      <PageHeader
        title="Auditoria"
        description="Registro de eventos e ações no sistema"
        actions={
          <Button variant="secondary" onClick={handleExport}>
            <Download className="w-4 h-4" />
            Exportar CSV
          </Button>
        }
      />

      <Card padding={false}>
        {isLoading ? (
          <div className="flex justify-center p-12">
            <Spinner />
          </div>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>Data/Hora</TableHeader>
                <TableHeader>Evento</TableHeader>
                <TableHeader>Usuário</TableHeader>
                <TableHeader>Papel</TableHeader>
                <TableHeader>Entidade</TableHeader>
                <TableHeader>IP</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {logs?.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="whitespace-nowrap text-xs">
                    {new Date(log.timestamp).toLocaleString("pt-BR")}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{log.event_type}</TableCell>
                  <TableCell className="text-xs">{log.actor_email || "-"}</TableCell>
                  <TableCell className="capitalize text-xs">{log.actor_role || "-"}</TableCell>
                  <TableCell className="text-xs">
                    {log.entity_type && (
                      <span>
                        {log.entity_type}
                        {log.entity_id && ` #${log.entity_id.slice(-6)}`}
                      </span>
                    )}
                    {Boolean(log.metadata?.self_approved) && (
                      <Badge variant="warning" className="ml-1 text-[10px]">
                        auto-aprovação
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-xs">{log.ip || "-"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
