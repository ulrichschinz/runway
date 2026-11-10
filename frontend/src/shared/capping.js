/**
 * What a capture sends to `POST /inbox` (plan M6, brief 0052): the same rule as Android's
 * `gtd/Capping.kt`, line for line, so both clients store the same typed text the same way.
 *
 * The description is trimmed and one line (a run of line breaks becomes one space; inner
 * spaces and tabs stay, as Taskwarrior keeps them, so the duplicate check can compare
 * exactly). It is cut at `MAX_DESCRIPTION_CHARS` code points and the rest goes to the front
 * of the note. The note is cut at `MAX_NOTE_BYTES` of UTF-8.
 */

export const MAX_DESCRIPTION_CHARS = 500
export const MAX_NOTE_BYTES = 32 * 1024

// Java's `\s` (Kotlin's Regex on the JVM) is ASCII whitespace only; JavaScript's is wider.
const LINE_BREAKS = /[ \t\n\v\f\r]*[\r\n]+[ \t\n\v\f\r]*/g
const LINES = /\r\n|\n|\r/

/** UTF-8 length of one code point. */
const utf8Length = (cp) => (cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4)

/**
 * `s` cut to at most `maxBytes` bytes of UTF-8, never inside a code point.
 *
 * @param {string} s
 * @param {number} maxBytes
 */
export function truncateUtf8(s, maxBytes) {
  let bytes = 0
  let end = 0
  for (const ch of s) {
    const len = utf8Length(ch.codePointAt(0))
    if (bytes + len > maxBytes) return s.slice(0, end)
    bytes += len
    end += ch.length
  }
  return s
}

/**
 * The capture as sent, or null when there is nothing to capture (blank text and blank note).
 *
 * @param {string} rawDescription what was typed
 * @param {string|null} [rawNote]
 * @returns {{description: string, note: string|null}|null}
 */
export function cap(rawDescription, rawNote = null) {
  const description = String(rawDescription).trim().replace(LINE_BREAKS, ' ')
  const note = rawNote == null ? null : String(rawNote).trim() || null
  if (!description) {
    if (note == null) return null
    // Only a note: its first line becomes the description. (`Capping.kt` splits the first
    // line at any line break but takes the rest after the first `\n`; kept identical.)
    const cut = note.indexOf('\n')
    const rest = cut < 0 ? '' : note.slice(cut + 1)
    return cap(note.split(LINES)[0], rest.trim() ? rest : null)
  }
  const chars = Array.from(description)
  let head = description
  let rest = null
  if (chars.length > MAX_DESCRIPTION_CHARS) {
    head = chars.slice(0, MAX_DESCRIPTION_CHARS).join('').trimEnd()
    rest = chars.slice(MAX_DESCRIPTION_CHARS).join('').trim() || null
  }
  const combined = [rest, note].filter((x) => x != null).join('\n\n')
  return { description: head, note: combined ? truncateUtf8(combined, MAX_NOTE_BYTES) : null }
}
