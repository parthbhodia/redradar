/**
 * Reddit's search treats an unquoted multi-word query as OR-of-terms, not a
 * phrase — `free link in bio tool` matches anything containing "free" alone.
 * Quoting forces an exact-phrase match, which is what every keyword here is
 * actually meant to be (see the prompt in keyword-suggest.ts). Single-word
 * queries are left bare; quoting them changes nothing.
 */
export function phraseQuery(query: string) {
  const trimmed = query.trim()
  if (!trimmed.includes(' ') || (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
    return trimmed
  }
  return `"${trimmed.replace(/"/g, '')}"`
}
