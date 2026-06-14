import { type InputHTMLAttributes, type ReactNode } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
}

const fieldClass =
  "w-full px-4 py-2.5 bg-surface border border-default rounded-lg text-primary placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-colors duration-200";

export function Input({ label, hint, error, className = "", id, ...props }: InputProps) {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, "-");
  return (
    <div>
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-primary mb-1">
          {label}
        </label>
      )}
      <input id={inputId} className={`${fieldClass} ${error ? "border-red-500" : ""} ${className}`} {...props} />
      {hint && !error && <p className="text-xs text-muted mt-1">{hint}</p>}
      {error && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{error}</p>}
    </div>
  );
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  children: ReactNode;
}

export function Select({ label, className = "", id, children, ...props }: SelectProps) {
  const selectId = id || label?.toLowerCase().replace(/\s+/g, "-");
  return (
    <div>
      {label && (
        <label htmlFor={selectId} className="block text-sm font-medium text-primary mb-1">
          {label}
        </label>
      )}
      <select id={selectId} className={`${fieldClass} ${className}`} {...props}>
        {children}
      </select>
    </div>
  );
}

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
}

export function Textarea({ label, className = "", id, ...props }: TextareaProps) {
  const textareaId = id || label?.toLowerCase().replace(/\s+/g, "-");
  return (
    <div>
      {label && (
        <label htmlFor={textareaId} className="block text-sm font-medium text-primary mb-1">
          {label}
        </label>
      )}
      <textarea id={textareaId} className={`${fieldClass} ${className}`} {...props} />
    </div>
  );
}
