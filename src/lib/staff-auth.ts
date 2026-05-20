import { NextRequest } from "next/server";

export type StaffContext = {
  staffId: string;
  staffName: string;
  staffRole: string;
  permissions: string[];
};

const rolePermissions: Record<string, string[]> = {
  agent: ["case:initiate", "case:view"],
  supervisor: ["case:initiate", "case:view", "case:review"],
  compliance: ["case:view", "case:review", "case:export"],
  admin: ["case:initiate", "case:view", "case:review", "case:export", "case:configure"],
};

export function getStaffContext(request: NextRequest) {
  const staffId = request.headers.get("x-staff-id") ?? "demo-agent-001";
  const staffName = request.headers.get("x-staff-name") ?? "Demo Agent";
  const staffRole = (request.headers.get("x-staff-role") ?? "supervisor").toLowerCase();
  const permissions = rolePermissions[staffRole] ?? [];

  return {
    staffId,
    staffName,
    staffRole,
    permissions,
  } satisfies StaffContext;
}

export function hasPermission(context: StaffContext, permission: string) {
  return context.permissions.includes(permission);
}

export function requirePermission(request: NextRequest, permission: string) {
  const context = getStaffContext(request);
  if (!hasPermission(context, permission)) {
    return {
      ok: false as const,
      error: `Staff role '${context.staffRole}' lacks permission '${permission}'.`,
      context,
    };
  }

  return {
    ok: true as const,
    context,
  };
}
