import { currentUser } from "@/lib/server/auth";
import { json } from "@/lib/server/http";

/** GET /api/me — current user (401 when unauthenticated; client redirects to login). */
export async function GET() {
  const user = await currentUser();
  if (!user) return json({ error: "unauthorized" }, { status: 401 });
  return json(user);
}
