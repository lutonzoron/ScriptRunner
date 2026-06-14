export type UserRole = "admin" | "coordinator" | "user";

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  active: boolean;
  must_change_password: boolean;
  created_at: string;
}

export interface ValidationIssue {
  code: string;
  severity: "error" | "warning";
  message: string;
  line?: number;
}

export type ScriptStatus =
  | "validating"
  | "auto_rejected"
  | "pending_approval"
  | "approved"
  | "executing"
  | "executed"
  | "execution_failed"
  | "manually_rejected"
  | "skipped";

export type BundleStatus =
  | "validating"
  | "auto_rejected"
  | "pending_approval"
  | "approved"
  | "executing"
  | "executed"
  | "execution_failed"
  | "manually_rejected";

export interface ScriptApproval {
  rejection_reason?: string;
  rejected_by?: string;
  rejected_at?: string;
  approved_by_name?: string;
  approved_at?: string;
  self_approved?: boolean;
}

export interface ScriptRequest {
  id: string;
  submitted_by: string;
  submitted_by_name: string;
  bundle_id?: string;
  script_sequence?: number;
  server_sequence?: number;
  server_id: string;
  database_name: string;
  database_display_name: string;
  environment: string;
  tsql_content: string;
  content_hash: string;
  status: ScriptStatus;
  validation_result: ValidationIssue[];
  approval?: ScriptApproval;
  execution_result?: {
    success: boolean;
    duration_ms?: number;
    rows_affected?: number;
    error?: string;
    batches_executed?: number;
  };
  created_at: string;
  validated_at?: string;
  executed_at?: string;
}

export interface ScriptBundle {
  id: string;
  submitted_by: string;
  submitted_by_name: string;
  title: string;
  demand_reference: string;
  pr_url: string;
  server_ids: string[];
  server_names: string[];
  database_name: string;
  environment: string;
  status: BundleStatus;
  approval?: ScriptApproval;
  script_count: number;
  server_count: number;
  scripts: ScriptRequest[];
  created_at: string;
  validated_at?: string;
  executed_at?: string;
}

export interface Server {
  id: string;
  name: string;
  host: string;
  provider: string;
  active: boolean;
  created_at: string;
}

export interface AuditLog {
  id: string;
  event_type: string;
  actor_id?: string;
  actor_email?: string;
  actor_role?: string;
  entity_type?: string;
  entity_id?: string;
  metadata: Record<string, unknown>;
  ip?: string;
  timestamp: string;
}

export interface DashboardStats {
  pending_approvals: number;
  my_scripts: number;
  my_bundles: number;
  recent_executed: number;
  recent_failed: number;
}
