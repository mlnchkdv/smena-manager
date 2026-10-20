export function knowledgeSelectOptions(options, query = '', limit = 100) {
  const terms = String(query).trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const filtered = Array.from(options, (option, index) => ({ index, text: option.text, selected: option.selected, disabled: option.disabled })).filter(option =>
    terms.every(term => String(option.text).toLocaleLowerCase().includes(term)),
  );
  return { options: filtered.slice(0, limit), total: filtered.length };
}
