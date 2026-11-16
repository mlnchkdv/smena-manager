# Smena MCP

Local MCP server for Codex and other clients supporting stdio. Requires Node.js
22 or later. Install the repository dependencies with `npm ci` from its root.

Shareable employee setup guide: [Русский](https://smena.team/mcp-setup.html) ·
[English](https://smena.team/mcp-setup-en.html). Each employee creates their own
workspace-bound token; the guide contains no credentials.

## Connect Codex

In Smena, open **Settings → Integrations** in the desired workspace. A workspace
administrator enables integrations. Create a separate read-only token named
Codex; never use a Google token or browser session cookie.

From the repository root, run:

```powershell
node packages/smena-mcp/src/cli.js auth-login --profile codex
node packages/smena-mcp/src/cli.js doctor --profile codex
```

Paste the integration token at the hidden prompt. The helper verifies access and
stores the secret in Windows Credential Manager, macOS Keychain or Linux Secret
Service (`secret-tool` must be installed and unlocked). No plaintext credential
file is created. For an explicitly temporary setup, the process can read
`SMENA_INTEGRATION_TOKEN` from its environment instead.

If the terminal cannot receive the browser clipboard, run `auth-login --profile
codex --browser`. Open the printed one-time **127.0.0.1** URL and paste the token
into the masked field. The form expires after five minutes, checks its own origin,
and closes its local listener after saving. The token never appears in a URL or
response. Do not paste it into a chat.

Add a local stdio server to Codex with the absolute paths to Node and this file:

```toml
[mcp_servers.smena]
command = "C:/path/to/node.exe"
args = ["C:/path/to/smena-manager/packages/smena-mcp/src/cli.js", "serve", "--profile", "codex"]
startup_timeout_sec = 30
tool_timeout_sec = 60
```

Use the MCP settings in Codex or its user `config.toml`. Keep machine-specific
paths in user configuration. The configuration contains no secret. Restart the
connection and ask Codex to call `get_context`, then search a test note and read
it. The token controls the workspace; a folder filter does not reduce its rights.

## Other clients

Configure the same executable and arguments in any client supporting local
stdio MCP. For Claude Desktop the corresponding shape is:

```json
{
  "mcpServers": {
    "smena": {
      "command": "C:/path/to/node.exe",
      "args": ["C:/path/to/smena-manager/packages/smena-mcp/src/cli.js", "serve", "--profile", "claude"]
    }
  }
}
```

Create and save a separate token under profile `claude` with `auth-login` first.
The API address defaults to `https://smena.team`. Use `--origin` for a different
HTTPS installation or explicit localhost development server. A REST API URL is
not a Streamable HTTP MCP endpoint.

To remove the local credential run `auth-logout --profile codex`. To revoke server
access, disconnect the integration in Smena. Removing the local credential alone
does not revoke a token copied elsewhere. Notes and history remain after revoke.

The server writes protocol messages to stdout and diagnostics to stderr. It has
no arbitrary shell, filesystem search, URL fetching or direct Google Drive tool.

## Write notes and recover interrupted operations

Enable note writes in the workspace settings and issue a token with both
`knowledge:read` and `knowledge:write`. Keep the client’s normal approval policy.
Every intended change has an `operation_id` UUID. Preserve it, the payload and
the ETag across a retry after a network failure. For a version conflict, read
the current note and review the change before starting a new operation.

`list_recent_operations` reads a private local journal containing only operation
IDs, hashes and result identities. It contains no note text or token. After a
restart, use `get_operation_status` to resolve an uncertain result. A retry
window lasts 24 hours. Do not start a new create merely because an answer was lost.

## Upload a large local file

Enable file access and note writes in the workspace policy. Issue the needed
file scopes. File creation also requires current write access to its project.
The explicit command below reads only the file you pass; MCP tools do not take
arbitrary local paths.

`attach_file` associates a verified file with the note and returns its new ETag.
To display a link in the note body, include `[Material](smena-file:<file_id>)`
in a content update using that ETag and a new operation UUID. The attachment
operation itself preserves the existing Markdown.

```powershell
node packages/smena-mcp/src/cli.js upload-local --profile codex --file "C:/media/video.mp4" --workspace "<workspace-id>" --project "<project-id>" --operation-id "<new-uuid>" --mime-type "video/mp4"
```

The command computes SHA-256 with a stream, reserves an upload, sends bounded
8 MiB chunks and verifies the finished file on the server. Progress goes to
stderr. The upload capability and signed ticket are never printed or stored in
the local operation journal. The server keeps them in its private registry.

After interruption, run the exact command with the same operation UUID and
unchanged file. Progress is queried from Drive before more bytes are sent. A
completed transfer is not uploaded again. If Drive cannot provide SHA-256 yet,
completion stays pending; a mismatched checksum cannot register a file.

Use `attach_file` with the returned file ID, a newly read note ETag and a separate
operation UUID to link the file to a note. This additionally requires note write
and file read scopes. Downloading uses the authenticated file content API; binary
bytes are never returned as MCP text.
