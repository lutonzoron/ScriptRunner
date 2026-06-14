import { type ReactNode } from "react";
import { AlertCircle, CheckCircle2, Info, AlertTriangle } from "lucide-react";

type AlertVariant = "error" | "success" | "warning" | "info";

interface AlertProps {
  children: ReactNode;
  variant?: AlertVariant;
  className?: string;
}

const config: Record<AlertVariant, { className: string; Icon: typeof AlertCircle }> = {
  error: { className: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20", Icon: AlertCircle },
  success: { className: "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20", Icon: CheckCircle2 },
  warning: { className: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20", Icon: AlertTriangle },
  info: { className: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20", Icon: Info },
};

export default function Alert({ children, variant = "info", className = "" }: AlertProps) {
  const { className: variantClass, Icon } = config[variant];
  return (
    <div className={`flex items-start gap-2 p-3 rounded-lg text-sm border ${variantClass} ${className}`}>
      <Icon className="w-4 h-4 mt-0.5 shrink-0" />
      <div className="flex-1">{children}</div>
    </div>
  );
}
