const workspace = data => data.ws?.id || data.ws?.url || data.workspace?.id || 'workspace';

// Called against the same fresh root that supplies ACLs and catalog descriptors.
// Expired, cancelled and other accounts' jobs never cause a catalog part read.
export function fileExportReadIds(data, user, id, now = Date.now()) {
  return [
    ...new Set(
      (data._fileExportJobs || [])
        .filter(job => job.owner === user.id && job.workspace === workspace(data) && (!id || job.id === id) && job.expiresAt > now && job.phase !== 'cancelled')
        .flatMap(job => job.entries.map(entry => entry.file.id)),
    ),
  ];
}
