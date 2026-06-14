import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Terminal } from "lucide-react";
import { login } from "@/api/client";
import { useAuth } from "@/context/AuthContext";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import ThemeToggle from "@/components/ui/ThemeToggle";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { setUser, setToken } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await login(email, password);
      setToken(data.access_token);
      setUser(data.user);
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao fazer login");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-base">
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-gradient-to-br from-brand-900 via-brand-700 to-slate-900 dark:from-slate-900 dark:via-brand-900 dark:to-slate-950">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-20 w-64 h-64 rounded-full bg-white/20 blur-3xl" />
          <div className="absolute bottom-20 right-20 w-96 h-96 rounded-full bg-brand-500/30 blur-3xl" />
        </div>
        <div className="relative z-10 flex flex-col justify-center px-16 text-white">
          <div className="w-14 h-14 rounded-2xl bg-white/10 backdrop-blur flex items-center justify-center mb-8">
            <Terminal className="w-8 h-8" />
          </div>
          <h1 className="text-4xl font-bold tracking-tight mb-4">Script Runner</h1>
          <p className="text-lg text-white/80 max-w-md leading-relaxed">
            Plataforma interna para submissão, validação e execução controlada de scripts T-SQL.
          </p>
          <div className="mt-12 flex gap-8 text-sm text-white/60">
            <div>
              <p className="text-2xl font-bold text-white">Validação</p>
              <p>Automática</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-white">Aprovação</p>
              <p>Manual</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-white">Auditoria</p>
              <p>Completa</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-6 relative">
        <div className="absolute top-4 right-4">
          <ThemeToggle />
        </div>

        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-3 mb-8 justify-center">
            <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
              <Terminal className="w-5 h-5 text-accent" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-primary">Script Runner</h1>
              <p className="text-xs text-muted">Execução controlada de T-SQL</p>
            </div>
          </div>

          <div className="bg-surface rounded-2xl shadow-lg border border-default p-8">
            <div className="mb-8">
              <h2 className="text-2xl font-semibold text-primary">Entrar</h2>
              <p className="text-sm text-muted mt-1">Acesse com suas credenciais corporativas</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {error && <Alert variant="error">{error}</Alert>}
              <Input
                label="E-mail"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <Input
                label="Senha"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <Button type="submit" disabled={loading} className="w-full">
                {loading ? "Entrando..." : "Entrar"}
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
