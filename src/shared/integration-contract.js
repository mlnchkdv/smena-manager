// Public limits are shared by HTTP validation and the MCP adapter. They are
// independent of the larger internal immutable-body storage budget.
export const LEGACY_INTEGRATION_SCOPES = Object.freeze(['knowledge:read', 'knowledge:write', 'files:read', 'files:write']);
export const INTEGRATION_SCOPES = Object.freeze([...LEGACY_INTEGRATION_SCOPES, 'research:read', 'research:write']);
export const INTEGRATION_LIMITS = Object.freeze({
  searchDefault: 20,
  searchMax: 50,
  textChunkBytes: 32768,
  markdownBytes: 3 * 1024 * 1024,
  receiptTtlMs: 24 * 60 * 60 * 1000,
  receipts: 500,
  auditEvents: 500,
  activePerUser: 20,
  lifetimeDays: 90,
});
export const API_OPERATIONS = Object.freeze([
  ['GET', '/workspaces/{w}/research/projects', 'list_research_projects', 'research:read'],
  ['GET', '/workspaces/{w}/research/projects/{p}', 'search_research', 'research:read'],
  ['GET', '/workspaces/{w}/research/projects/{p}/records/{id}', 'read_research_record', 'research:read'],
  ['GET', '/workspaces/{w}/research/projects/{p}/operations/{operation_id}', 'get_research_operation', 'research:read'],
  ['POST', '/workspaces/{w}/research/projects/{p}/commands', 'write_research_record', 'research:write'],
  ['POST', '/workspaces/{w}/research/projects/{p}/import', 'import_research_records', 'research:write'],
  ['GET', '/me', 'get_context', 'knowledge:read'],
  ['GET', '/workspaces', 'list_workspaces', 'knowledge:read'],
  ['GET', '/workspaces/{w}/folders', 'list_folders', 'knowledge:read'],
  ['GET', '/workspaces/{w}/note-types', 'list_note_types', 'knowledge:read'],
  ['GET', '/workspaces/{w}/notes', 'search_notes', 'knowledge:read'],
  ['GET', '/workspaces/{w}/notes/{id}', 'read_note', 'knowledge:read'],
  ['GET', '/workspaces/{w}/notes/{id}/revisions', 'list_note_revisions', 'knowledge:read'],
  ['GET', '/workspaces/{w}/notes/{id}/revisions/{revision}', 'read_note_revision', 'knowledge:read'],
  ['POST', '/workspaces/{w}/notes', 'create_note', 'knowledge:write'],
  ['PUT', '/workspaces/{w}/notes/{id}/content', 'update_note_content', 'knowledge:write'],
  ['PATCH', '/workspaces/{w}/notes/{id}/metadata', 'update_note_metadata', 'knowledge:write'],
  ['GET', '/workspaces/{w}/operations/{operation_id}', 'get_operation_status', 'knowledge:read'],
  ['GET', '/workspaces/{w}/files/{id}', 'read_file_metadata', 'files:read'],
  ['GET', '/workspaces/{w}/files/{id}/content', 'download_file', 'files:read'],
  ['POST', '/workspaces/{w}/uploads', 'begin_upload', 'files:write'],
  ['GET', '/workspaces/{w}/uploads/{upload_id}', 'get_upload_status', 'files:write'],
  ['POST', '/workspaces/{w}/uploads/{upload_id}/complete', 'complete_upload', 'files:write'],
  ['POST', '/workspaces/{w}/notes/{id}/attachments', 'attach_file', 'knowledge:write'],
]);
