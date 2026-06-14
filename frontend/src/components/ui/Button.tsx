import { type ButtonHTMLAttributes, type ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  children: ReactNode;
}

const variants: Record<Variant, string> = {
  primary: "bg-accent text-white hover:bg-brand-700 focus:ring-accent/30",
  secondary: "bg-surface border border-default text-primary hover:bg-surface-elevated focus:ring-accent/20",
  ghost: "text-muted hover:text-primary hover:bg-surface-elevated focus:ring-accent/20",
  danger: "bg-red-600 text-white hover:bg-red-700 focus:ring-red-500/30",
};

export default function Button({ variant = "primary", className = "", children, ...props }: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors duration-200 focus:outline-none focus:ring-2 disabled:opacity-50 disabled:pointer-events-none ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
