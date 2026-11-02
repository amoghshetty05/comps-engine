import { requireRole } from "@/lib/session";
import { auditLog } from "@/lib/queries";

export const dynamic = "force-dynamic";

// GET /api/admin/audit  -> latest rows written by the audit triggers
export async function GET() {
  const { error } = await requireRole("admin");
  if (error) return error;
  return Response.json(await auditLog());
}
