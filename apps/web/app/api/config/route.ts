import { json } from "@/lib/server/http";

// Env must be read per-request (Workers dashboard vars), not baked at build.
export const dynamic = "force-dynamic";

/** GET /api/config — frontend capability/config flags (AppConfigSchema). */
export async function GET() {
  return json({
    allow_signup: process.env.MULTICA_ALLOW_SIGNUP !== "false",
    daemon_setup_target: "self_host",
    workspace_creation_disabled: false,
    vcs_integration_available: false,
    feature_flags: {},
    cdn_domain: "",
    cdn_signed: false,
    local_worktree_supported: false,
    agent_conversation_starters_supported: false,
    webhook_payload_conditions_supported: false,
    issue_create_properties_supported: false,
    comment_delete_keep_replies_supported: false,
    theme_store_enabled: false,
  });
}
