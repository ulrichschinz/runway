// Demo data for the unified-UI prototypes. Every proposal renders this same set, so the
// five can be compared side by side. Invented examples only: no real customers or people.
// Shape follows runway's task API (Taskwarrior fields). "Today" is Saturday 2026-10-31.

export const TODAY = '2026-10-31'

export const CONTEXTS = ['@computer', '@anrufe', '@zuhause', '@unterwegs', '@buero']

export const PROJECTS = [
  { name: 'Website-Relaunch', outcome: 'Neue Website ist live und bringt Anfragen', status: 'active' },
  { name: 'Angebot-Pilotkunde', outcome: 'Pilotkunde hat das Angebot unterschrieben', status: 'active' },
  { name: 'Steuer-2025', outcome: 'Steuererklärung 2025 ist abgegeben', status: 'active' },
  { name: 'Buero-Umzug', outcome: 'Team arbeitet im neuen Büro', status: 'active' },
  { name: 'runway-Android', outcome: 'App ist im Play Store', status: 'active' },
  { name: 'Garten', outcome: 'Garten ist winterfest', status: 'active' },
  { name: 'Podcast', outcome: 'Erste drei Folgen sind veröffentlicht', status: 'someday' },
]

let n = 0
const t = (description, extra = {}) => {
  n += 1
  return {
    id: n,
    uuid: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    description,
    status: 'pending',
    project: null,
    tags: [],
    priority: null,
    due: null,
    scheduled: null,
    wait: null,
    urgency: 1.0,
    entry: '20261028T080000Z',
    start: null,
    annotations: [],
    ...extra,
  }
}

export const TASKS = [
  // Inbox: captured, not yet clarified (no project, no context).
  t('Idee: Kundenstimmen als kurze Videos', { entry: '20261031T071200Z', urgency: 0.8 }),
  t('Rechnung Druckerei prüfen', { entry: '20261030T164500Z', urgency: 1.1 }),
  t('Artikel über Agenten-Evaluation lesen', { entry: '20261030T120000Z', urgency: 0.6,
    annotations: [{ entry: '20261030T120100Z', description: 'Link aus dem Newsletter' }] }),
  t('Geburtstagsgeschenk für Lena', { entry: '20261029T190000Z', urgency: 0.9 }),
  t('Winterreifen wechseln lassen', { entry: '20261029T081500Z', urgency: 0.7 }),

  // Next actions, by context.
  t('Angebotsentwurf fertigstellen', { project: 'Angebot-Pilotkunde', tags: ['@computer'], priority: 'H',
    due: '20261103T170000Z', urgency: 14.2, start: '20261031T083000Z' }),
  t('Startseiten-Text kürzen', { project: 'Website-Relaunch', tags: ['@computer'], priority: 'M', urgency: 8.4 }),
  t('Belege Oktober hochladen', { project: 'Steuer-2025', tags: ['@computer'], due: '20261030T170000Z', urgency: 12.9 }),
  t('Release-Notes für Version 0.9 schreiben', { project: 'runway-Android', tags: ['@computer'], urgency: 6.1 }),
  t('Steuerberatung zurückrufen', { project: 'Steuer-2025', tags: ['@anrufe'], priority: 'H', urgency: 11.3 }),
  t('Umzugsfirma: Termin bestätigen', { project: 'Buero-Umzug', tags: ['@anrufe'], due: '20261104T120000Z', urgency: 9.7 }),
  t('Mit Nora Workshop-Ablauf abstimmen', { project: 'Angebot-Pilotkunde', tags: ['@anrufe'], urgency: 7.2 }),
  t('Rosen zurückschneiden', { project: 'Garten', tags: ['@zuhause'], urgency: 3.4 }),
  t('Kellerregal ausmisten', { tags: ['@zuhause'], urgency: 2.1 }),
  t('Druckerpatronen kaufen', { tags: ['@unterwegs'], urgency: 4.0 }),
  t('Paket bei der Post abholen', { tags: ['@unterwegs'], due: '20261102T180000Z', urgency: 8.8 }),
  t('Whiteboard im Besprechungsraum aufhängen', { project: 'Buero-Umzug', tags: ['@buero'], urgency: 3.9 }),
  // A raw comma-joined tag, as Taskwarrior returns it. Readers must split on commas.
  t('Schlüssel für das neue Büro abholen', { project: 'Buero-Umzug', tags: ['@unterwegs,@buero'], urgency: 5.5 }),

  // Waiting for others.
  t('Feedback von Nora zum Logo-Entwurf', { project: 'Website-Relaunch', tags: ['waiting'], wait: '20261103T080000Z',
    urgency: 2.0, annotations: [{ entry: '20261029T100000Z', description: 'Per Mail gefragt am 29.10.' }] }),
  t('Unterschrift Pilotkunde', { project: 'Angebot-Pilotkunde', tags: ['waiting'], wait: '20261107T080000Z', urgency: 2.4 }),
  t('Rückmeldung Vermieter zur Kaution', { project: 'Buero-Umzug', tags: ['waiting'], urgency: 1.8 }),
  t('Play-Store-Prüfung der App', { project: 'runway-Android', tags: ['waiting'], urgency: 1.5 }),

  // Someday / maybe.
  t('Podcast-Konzept skizzieren', { project: 'Podcast', tags: ['someday'], urgency: 0.4 }),
  t('Japanisch-Kurs suchen', { tags: ['someday'], urgency: 0.3 }),
  t('Fahrradtour an der Mosel planen', { tags: ['someday'], urgency: 0.3 }),

  // Done today, for progress and "done" states.
  t('Wochenplan aufschreiben', { status: 'completed', tags: ['@computer'], end: '20261031T074500Z', urgency: 0 }),
  t('Zahnarzttermin vereinbaren', { status: 'completed', tags: ['@anrufe'], end: '20261031T081000Z', urgency: 0 }),
  t('Newsletter-Abo kündigen', { status: 'completed', tags: ['@computer'], end: '20261031T082000Z', urgency: 0 }),
]

// Garten has a next action; Website-Relaunch has two. "runway-Android" has one next action.
// No project is stalled yet; a prototype can complete a project's last next action to show
// the "stalled project" state (an active project without a next action).

/** Split raw tags on commas (Taskwarrior returns "@a,@b" as one element). */
export function tagParts(task) {
  return task.tags.flatMap((tag) => String(tag).split(',').map((p) => p.trim())).filter(Boolean)
}

export function contextsOf(task) {
  return tagParts(task).filter((p) => p.startsWith('@'))
}

/** The GTD lists as runway shows them. */
export function buckets(tasks = TASKS) {
  const open = tasks.filter((task) => task.status === 'pending')
  const has = (task, tag) => tagParts(task).includes(tag)
  return {
    inbox: open.filter((task) => !task.project && contextsOf(task).length === 0 && !has(task, 'waiting') && !has(task, 'someday')),
    next: open.filter((task) => contextsOf(task).length > 0 && !has(task, 'waiting') && !has(task, 'someday'))
      .sort((a, b) => b.urgency - a.urgency),
    waiting: open.filter((task) => has(task, 'waiting')),
    someday: open.filter((task) => has(task, 'someday')),
    done: tasks.filter((task) => task.status === 'completed'),
  }
}

/** "20261103T170000Z" -> Date */
export function parseTw(value) {
  if (!value) return null
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(value)
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])) : new Date(value)
}
