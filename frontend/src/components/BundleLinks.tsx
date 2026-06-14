import { ArrowDown, ArrowUp, ExternalLink } from "lucide-react";
import type { ScriptBundle } from "@/types";
import { normalizeExternalUrl } from "@/utils/url";

export function BundleLinks({
  bundle,
  className = "",
}: {
  bundle: Pick<ScriptBundle, "demand_reference" | "pr_url">;
  className?: string;
}) {
  const demandUrl = normalizeExternalUrl(bundle.demand_reference);
  const prUrl = normalizeExternalUrl(bundle.pr_url);

  return (
    <div className={`flex flex-wrap items-center gap-3 text-sm ${className}`}>
      <a
        href={demandUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-accent hover:underline"
      >
        <ExternalLink className="w-3.5 h-3.5" />
        Demanda
      </a>
      <a
        href={prUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-accent hover:underline"
      >
        <ExternalLink className="w-3.5 h-3.5" />
        Pull Request
      </a>
    </div>
  );
}

interface ServerMultiSelectProps {
  servers: { id: string; name: string; host: string }[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}

export function ServerMultiSelect({
  servers,
  selectedIds,
  onChange,
  disabled,
}: ServerMultiSelectProps) {
  const toggle = (id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((s) => s !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  const move = (index: number, direction: -1 | 1) => {
    const next = [...selectedIds];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  const selectedServers = selectedIds
    .map((id) => servers.find((s) => s.id === id))
    .filter(Boolean) as { id: string; name: string; host: string }[];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {servers.map((server) => {
          const checked = selectedIds.includes(server.id);
          return (
            <label
              key={server.id}
              className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm cursor-pointer transition-colors ${
                checked
                  ? "border-accent bg-accent/10 text-primary"
                  : "border-default text-muted hover:border-accent/50"
              } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={disabled}
                onChange={() => toggle(server.id)}
                className="rounded border-default text-accent focus:ring-accent/30"
              />
              {server.name}
            </label>
          );
        })}
      </div>

      {selectedServers.length > 0 && (
        <div className="rounded-lg border border-default p-3 space-y-2">
          <p className="text-xs font-medium text-muted uppercase tracking-wide">
            Ordem de execução entre servidores
          </p>
          {selectedServers.map((server, index) => (
            <div
              key={server.id}
              className="flex items-center justify-between gap-2 text-sm text-primary"
            >
              <span>
                {index + 1}. {server.name} ({server.host})
              </span>
              <div className="flex gap-1">
                <button
                  type="button"
                  disabled={disabled || index === 0}
                  onClick={() => move(index, -1)}
                  className="p-1 rounded hover:bg-surface-elevated disabled:opacity-30"
                  aria-label="Mover para cima"
                >
                  <ArrowUp className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  disabled={disabled || index === selectedServers.length - 1}
                  onClick={() => move(index, 1)}
                  className="p-1 rounded hover:bg-surface-elevated disabled:opacity-30"
                  aria-label="Mover para baixo"
                >
                  <ArrowDown className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
