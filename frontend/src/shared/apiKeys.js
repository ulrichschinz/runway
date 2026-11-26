/**
 * The API-key rules of Einstellungen (brief 0070, ADR 0044 Decision 6; WAIVER-SEC-003). Pure, so
 * the tests can hold them; the page only renders what these say.
 *
 * Since 2026-11 the server stores a key as a hash and returns it exactly once, in the answer of
 * `POST /auth/apikeys`. The page therefore never reads a key back: it lists metadata
 * (`GET /auth/apikeys`), and the one new key lives in memory only, on the screen until the person
 * confirms they have stored it — never in `localStorage`, never in a URL. `oneTimeKey` is that
 * rule.
 *
 * Message keys only (`messages.settings.de.js`), no `t()`: the page turns them into text.
 */

/** The longest label the server takes (`ApiKeyCreate.label`). */
export const LABEL_MAX = 64

/** What a key row is called: its label, else its public prefix; a legacy key is named as such. */
export function keyName(meta) {
  if (meta.kind === 'legacy') return { key: 'set.key.legacy' }
  return meta.label ? { text: meta.label } : { text: meta.prefix }
}

/** The message key of a row's state. */
export function keyStateKey(meta) {
  return { active: 'set.key.active', expired: 'set.key.expired', revoked: 'set.key.revoked' }[meta.state] ?? 'set.key.revoked'
}

/** Only an active key can be revoked; an ended one stays as it is. */
export function canRevoke(meta) {
  return meta.state === 'active'
}

/** A server timestamp (ISO 8601, UTC) as the day, `TT.MM.JJJJ`; '' for none. */
export function day(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const two = (n) => String(n).padStart(2, '0')
  return `${two(d.getUTCDate())}.${two(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`
}

/** Active keys first, newest first within each group (the server sends newest first). */
export function orderedKeys(list) {
  const rows = Array.isArray(list) ? list : []
  return [...rows.filter((k) => k.state === 'active'), ...rows.filter((k) => k.state !== 'active')]
}

/**
 * The day an old key (issued before keys were hashed) stops working, when the account still holds
 * an active one — so the page can ask for a new key before then; '' when there is none.
 */
export function legacyDeadline(list) {
  const legacy = (Array.isArray(list) ? list : []).find((k) => k.kind === 'legacy' && k.state === 'active')
  return legacy ? day(legacy.expires_at) : ''
}

/**
 * The one-time display. `show(key)` holds a fresh key; `dismiss(confirmed)` forgets it only when
 * the person has confirmed they stored it, and otherwise keeps it and says why. Nothing here
 * writes anywhere: when the object is dropped, the key is gone.
 */
export function oneTimeKey() {
  let held = null
  return {
    show(key) {
      held = typeof key === 'string' && key ? key : null
      return held
    },
    get key() {
      return held
    },
    /** @returns {{ forgotten: boolean, reason?: string }} */
    dismiss(confirmed) {
      if (!held) return { forgotten: true }
      if (!confirmed) return { forgotten: false, reason: 'set.key.confirmFirst' }
      held = null
      return { forgotten: true }
    },
  }
}

/** The text file "Herunterladen" saves: the key, and where it belongs — nothing else. */
export function keyFile(key, origin) {
  return {
    name: 'runway-api-key.txt',
    text: `# runway API key for ${origin}\n# Shown once: the server keeps only a hash of it.\n# Use it as the X-Api-Key header, or as RUNWAY_API_KEY in ~/.zshenv.\n${key}\n`,
  }
}
