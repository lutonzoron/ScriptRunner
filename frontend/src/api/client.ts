import type {
  AuditLog,
  DashboardStats,
  ScriptBundle,
  ScriptRequest,
  Server,
  User,
} from "@/types";

const API_BASE = "/api";

let accessToken: string | null = null;

const fieldLabels: Record<string, string> = {
  email: "E-mail",
  name: "Nome",
  password: "Senha",
  role: "Papel",
};

export function parseApiError(detail: unknown): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && "msg" in item) {
          const loc = Array.isArray((item as { loc?: unknown }).loc)
            ? (item as { loc: unknown[] }).loc.filter((p) => p !== "body").join(".")
            : "";
          const label = fieldLabels[loc] || loc;
          return label ? `${label}: ${(item as { msg: string }).msg}` : (item as { msg: string }).msg;
        }
        return JSON.stringify(item);
      })
      .join("; ");
  }
  return "Erro na requisição";
}

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    credentials: "include",
  });

  if (response.status === 401 && path !== "/auth/login" && path !== "/auth/refresh") {
    const refreshed = await refreshToken();
    if (refreshed) {
      headers.Authorization = `Bearer ${accessToken}`;
      const retry = await fetch(`${API_BASE}${path}`, { ...options, headers, credentials: "include" });
      if (!retry.ok) {
        const err = await retry.json().catch(() => ({ detail: "Erro na requisição" }));
        throw new Error(parseApiError(err.detail));
      }
      return retry.json();
    }
  }

  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: "Erro na requisição" }));
    throw new Error(parseApiError(err.detail));
  }

  if (response.status === 204) return {} as T;
  return response.json();
}

export async function login(email: string, password: string) {
  return request<{ access_token: string; user: User }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function refreshToken() {
  try {
    const data = await request<{ access_token: string; user: User }>("/auth/refresh", { method: "POST" });
    accessToken = data.access_token;
    return true;
  } catch {
    accessToken = null;
    return false;
  }
}

export async function logout() {
  await request("/auth/logout", { method: "POST" });
  accessToken = null;
}

export async function getMe() {
  return request<User>("/auth/me");
}

export async function changePassword(current_password: string, new_password: string) {
  return request<User>("/auth/change-password", {
    method: "POST",
    body: JSON.stringify({ current_password, new_password }),
  });
}

export async function getDashboard() {
  return request<DashboardStats>("/scripts/dashboard");
}

export async function getScripts() {
  return request<ScriptRequest[]>("/scripts");
}

export async function getPendingScripts() {
  return request<ScriptRequest[]>("/scripts/pending");
}

export async function getScript(id: string) {
  return request<ScriptRequest>(`/scripts/${id}`);
}

export async function submitScript(server_id: string, database_name: string, tsql_content: string) {
  return request<ScriptRequest>("/scripts", {
    method: "POST",
    body: JSON.stringify({ server_id, database_name, tsql_content }),
  });
}

export async function getBundles() {
  return request<ScriptBundle[]>("/bundles");
}

export async function getPendingBundles() {
  return request<ScriptBundle[]>("/bundles/pending");
}

export async function getBundle(id: string) {
  return request<ScriptBundle>(`/bundles/${id}`);
}

export async function submitBundle(data: {
  title: string;
  demand_reference: string;
  pr_url: string;
  server_ids: string[];
  database_name: string;
  scripts: { tsql_content: string }[];
}) {
  return request<ScriptBundle>("/bundles", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function approveBundle(
  id: string,
  data: {
    approve: boolean;
    checked_environment: boolean;
    checked_tsql: boolean;
    checked_where_clause: boolean;
    checked_impact: boolean;
    checked_timing: boolean;
    checked_auto_validation: boolean;
    rejection_reason?: string;
  }
) {
  return request<ScriptBundle>(`/bundles/${id}/approve`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function resubmitScript(id: string, tsql_content: string) {
  return request<ScriptRequest>(`/scripts/${id}/resubmit`, {
    method: "POST",
    body: JSON.stringify({ tsql_content }),
  });
}

export async function resubmitBundle(
  id: string,
  data: {
    title?: string;
    demand_reference?: string;
    pr_url?: string;
    scripts: { tsql_content: string }[];
  }
) {
  return request<ScriptBundle>(`/bundles/${id}/resubmit`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function approveScript(
  id: string,
  data: {
    approve: boolean;
    checked_environment: boolean;
    checked_tsql: boolean;
    checked_where_clause: boolean;
    checked_impact: boolean;
    checked_timing: boolean;
    checked_auto_validation: boolean;
    rejection_reason?: string;
  }
) {
  return request<ScriptRequest>(`/scripts/${id}/approve`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function getServers() {
  return request<Server[]>("/servers");
}

export async function getServerDatabases(serverId: string) {
  return request<{ name: string }[]>(`/servers/${serverId}/databases`);
}

export async function createServer(data: {
  name: string;
  host: string;
  validation_connection_string: string;
  execution_connection_string: string;
}) {
  return request<Server>("/servers", { method: "POST", body: JSON.stringify(data) });
}

export async function updateServer(id: string, data: Record<string, unknown>) {
  return request<Server>(`/servers/${id}`, { method: "PATCH", body: JSON.stringify(data) });
}

export async function testServerConnection(connection_string: string) {
  return request<{ success: boolean; message: string; duration_ms: number }>("/servers/actions/test-connection", {
    method: "POST",
    body: JSON.stringify({ connection_string }),
  });
}

export async function getUsers() {
  return request<User[]>("/users");
}

export async function createUser(data: { email: string; name: string; password: string; role: string }) {
  return request<User>("/users", { method: "POST", body: JSON.stringify(data) });
}

export async function updateUser(id: string, data: Record<string, unknown>) {
  return request<User>(`/users/${id}`, { method: "PATCH", body: JSON.stringify(data) });
}

export async function getAuditLogs(params?: Record<string, string>) {
  const query = params ? "?" + new URLSearchParams(params).toString() : "";
  return request<AuditLog[]>(`/audit${query}`);
}

export function exportAuditUrl() {
  return `${API_BASE}/audit/export`;
}
