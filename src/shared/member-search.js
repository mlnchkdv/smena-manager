import { searchTerms } from './search-query.js';
export function memberMatches(member, query, teamName = '') {
  const text = [member.name, member.email, member.title, teamName].filter(Boolean).join(' ').toLocaleLowerCase();
  return searchTerms(query).every(term => text.includes(term));
}
