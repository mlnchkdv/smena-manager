/** Keep a saved bookmark visible even if its title, folder or archive state changed. */
export function savedBookmarkView(link, folderFilter = 'all') {
  const folderMatches = folderFilter === 'all' || (folderFilter === 'root' ? !link.folder : link.folder === folderFilter);
  return {
    bookmarkQuery: '',
    bookmarkScope: link.is_archived ? 'archived' : 'active',
    bookmarkFolder: folderMatches ? folderFilter : link.folder || 'root',
  };
}
