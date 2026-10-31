// System labels can be found by either their visible name or stable alias.
// Authored names must bypass translation at the call site.
export function matchesLocalizedName(name, query, translate, aliases = []) {
  const needle = String(query || '')
    .trim()
    .toLocaleLowerCase();
  return (
    !needle ||
    [name, translate(name), ...aliases].some(value =>
      String(value || '')
        .toLocaleLowerCase()
        .includes(needle),
    )
  );
}
