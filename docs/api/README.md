# Smena API and MCP

The versioned contract is [openapi.json](openapi.json). The implementation follows
[the eight stage plan](../KNOWLEDGE_API_MCP_PLAN_2026-11-16.md). Codex is the first
MCP client; tools use standard MCP over stdio and the same HTTPS API as other clients.

Integration credentials are separate from Google sign-in and browser sessions.
Every credential is owned by one user and bound to one workspace. Effective
permissions are the intersection of scopes and current membership/project access.

Writes require an Idempotency-Key (8–128 ASCII identifier characters). Updates
also require an exact strong If-Match ETag. Receipts live for 24 hours; retry an
uncertain request with the same key and payload. Never retry a version conflict
as an unconditional replacement. A successful write returns metadata and a URL;
read the note back to verify its content.

Search pages contain at most 50 items. Text reads return at most 32 KiB of UTF-8
text and a version-bound continuation. Markdown writes accept at most 3 MiB of
UTF-8 text within the existing transport limit. Files use separate resumable
uploads; file data and upload credentials never belong in tool results.

Public API, write operations and uploads have independent server switches and
are disabled until their acceptance checks pass. Unsupported operations return
an explicit error rather than falling through to browser authentication.

Setup instructions: [local MCP package](../../packages/smena-mcp/README.md).
Release controls and recovery: [operations guide](OPERATIONS.md).
Implemented stages, production acceptance and limits of testing:
[16 November 2026 report](ACCEPTANCE_2026-11-16.md).
