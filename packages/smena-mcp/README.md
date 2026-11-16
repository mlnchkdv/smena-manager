# Smena MCP

Local MCP server for Codex and other clients supporting stdio. Requires Node.js
22 or later. Install the repository dependencies with `npm ci` from its root.

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
