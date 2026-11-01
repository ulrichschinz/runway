// The message table (graft from 02's i18n structure). Every visible string is a key; German is the
// default and, for v1, the only language (Uli's decision; Android's acceptance tests pin German).
// In the Vue build this is src/i18n/de.js behind vue-i18n (or a small t()); on Android it is
// res/values/strings.xml. A test compares the strings Android pins (Fällig, Stand hh:mm, Nachhaken,
// the list names) between both tables. English can be added as a second table without touching
// components. Static shell elements carry data-i18n="key" / data-i18n-attr="attr:key".

const fDay = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', weekday: 'short', day: '2-digit', month: '2-digit' })
const dayLabel = (key) => fDay.format(new Date(key + 'T12:00:00Z')).replace(/\.,? /, ' ').replace(/\.?$/, '.')

const DE = {
  // lists and navigation (pinned on Android: keep literally)
  'list.inbox': 'Inbox', 'list.next': 'Nächste', 'list.waiting': 'Warten auf', 'list.projects': 'Projekte', 'list.someday': 'Irgendwann',
  'nav.review': 'Rückblick', 'nav.all': 'Alle', 'nav.settings': 'Einstellungen', 'nav.lists': 'Listen', 'nav.more': 'Mehr', 'nav.due': 'fällig',
  'title.inbox': 'Inbox', 'title.next': 'Nächste', 'title.waiting': 'Warten auf', 'title.projects': 'Projekte', 'title.someday': 'Irgendwann',
  'title.review': 'Rückblick', 'title.all': 'Alle', 'title.settings': 'Einstellungen',
  stand: 'Stand {t}', close: 'schließen', undo: 'Rückgängig', 'shell.margin': 'Randspalte', 'shell.today': 'Heute',
  // headings: [before, accent word, after]; exactly one Fraunces word each
  'h.inbox': ['Was ist ', 'das', '?'], 'h.inboxEmpty': ['Inbox ist ', 'leer', '.'], 'h.next': ['Was jetzt ', 'zählt', ''],
  'h.waiting': ['Worauf du ', 'wartest', ''], 'h.projects': ['Was du ', 'bewegst', ''], 'h.someday': ['Später, ', 'vielleicht', ''],
  'h.review': ['Die Woche, ', 'sortiert', ''], 'h.all': ['Alles auf ', 'einen', ' Blick'], 'h.settings': ['Dein ', 'runway', ''],
  'h.search': ['Gefunden in ', 'allen', ' Listen'], 'h.keys': ['Alles mit der ', 'Tastatur', ''],
  // capture and search
  'capture.new': 'Neues Todo', 'capture.hint': '⏎ in die Inbox', 'search.ph': 'Suchen', 'search.all': 'Suchen in allen Listen',
  'search.title': 'Suche', 'search.hits': '{n} Treffer', 'search.end': 'Suche beenden',
  // contexts
  'ctx.all': 'Alle', 'ctx.allLong': 'alle Kontexte', 'ctx.none': 'ohne Kontext', 'ctx.label': 'Kontext', 'key.n': 'Taste {k}',
  'ctxhint.computer': 'am Rechner', 'ctxhint.anrufe': 'Telefon', 'ctxhint.zuhause': 'daheim', 'ctxhint.unterwegs': 'unterwegs', 'ctxhint.buero': 'im Büro',
  // the Tageslinse
  'lens.cap': '{done} von {total} heute', 'lens.short': '{done} von {total}', 'lens.extra': ' · {n} zusätzlich', 'lens.extraShort': ' +{n}',
  'lens.of': '{done} von {total}', 'lens.sub': 'geplant und erledigt', 'lens.aria': 'Heute {done} von {total} geplanten Todos erledigt. Tagesübersicht öffnen',
  // sections and empty states
  'sec.due': 'Fällig', 'sec.dueOther': 'Fällig · andere Kontexte', 'sec.otherCtx': 'andere Kontexte', 'ctx.plusNone': '+{n} ohne Kontext', 'sec.jetzt': 'Jetzt', 'sec.bald': 'Bald', 'sec.spaeter': 'Später',
  'sec.nextActions': 'Nächste Aktionen', 'sec.wdue': 'Heute nachhaken', 'sec.wsoon': 'Diese Woche', 'sec.wlater': 'Später oder ohne Datum',
  'sec.ideas': 'Ideen', 'sec.unlisted': 'Ohne Liste', 'sec.doneWeek': 'Erledigt, letzte 7 Tage',
  'empty.due': 'Nichts fällig', 'empty.next': 'Keine nächsten Aktionen', 'empty.nextCtx': 'Nichts für {ctx}', 'empty.wdue': 'Heute ist niemand fällig',
  'empty.waiting': 'Du wartest auf nichts', 'empty.someday': 'Keine Ideen geparkt', 'empty.projNext': 'Keine nächste Aktion',
  'empty.search': 'Nichts gefunden. Die Suche geht über Beschreibung, Projekt und Tags.',
  // rows
  'row.notes': '¶ {n} Notiz', 'row.notesTitle': 'Notizen', 'row.captured': 'erfasst {d}', 'row.since': 'seit {d}', 'row.planned': 'für heute',
  'row.running': 'läuft', 'row.prioH': 'Priorität hoch', 'row.check': 'Abhaken: {d}',
  'due.overdue': 'überfällig {d}', 'due.today': 'heute', 'due.tomorrow': 'morgen',
  'follow.today': 'Nachhaken heute', 'follow.since': 'Nachhaken seit {d}', 'follow.later': 'Wiedervorlage {d}', 'follow.none': 'wartet seit {d}',
  'entry.today': 'heute {t}', 'entry.yesterday': 'gestern {t}', 'done.now': 'gerade',
  'status.overdue': 'überfällig', 'status.dueToday': 'fällig heute', 'status.follow': 'Nachhaken fällig',
  'status.inbox': 'Inbox', 'status.next': 'Nächste', 'status.waiting': 'Warten auf', 'status.someday': 'Irgendwann', 'status.none': 'ohne Liste',
  // write path (graft from 02)
  'sync.unsent': 'Nicht gesendet', 'sync.retry': 'Erneut senden', 'sync.retryShort': 'senden', 'sync.title': 'Nicht gesendet', 'sync.n': '{n} nicht gesendet', 'n.moved': '→ {list}',
  // Inbox
  'inbox.open': '{n} ungeklärt', 'inbox.oldest': 'älteste {d}', 'inbox.mode': 'Darstellung der Inbox', 'inbox.list': 'Liste', 'inbox.stack': 'Stapel',
  'inbox.leadList': 'Jeder Eintrag bekommt einen Platz: eine Taste für die Liste, eine Ziffer für die Antwort.',
  'inbox.leadStack': 'Die oberste Karte in ein Fach legen. Fehlt eine Angabe, werden die Fächer zur Frage.',
  'inbox.zeroLead': 'Alles geklärt. Was jetzt zählt, steht unter Nächste.', 'inbox.toNext': 'Zu Nächste',
  // clarify panel (03, two keys) with the questions from 05
  'cl.title': 'Klären', 'cl.left': 'noch {n}', 'cl.q': 'Was ist es?',
  'cl.next': 'Nächste Aktion', 'cl.nextWhy': 'dann Kontext 1–5', 'cl.waitWhy': 'dann Nachhaken 1–4', 'cl.somedayWhy': 'vielleicht später',
  'cl.project': 'Zu einem Projekt', 'cl.projectWhy': 'dann Kontext', 'cl.done': 'Gleich erledigt', 'cl.doneWhy': 'unter zwei Minuten',
  'cl.delete': 'Löschen', 'cl.deleteWhy': 'nicht mehr wichtig',
  'cl.whereQ': 'Wo erledigst du das? Nächste braucht einen Kontext.', 'cl.followQ': 'Wann fragst du nach?',
  'cl.projCtxQ': 'Erste Aktion für {p}: wo erledigst du das?', 'cl.newProject': 'Neues Projekt', 'cl.newProjHint': '⏎ anlegen, dann Kontext · Esc zurück',
  'cl.k.move': 'weiter', 'cl.k.edit': 'Text ändern', 'cl.k.undo': 'rückgängig',
  'fu.tomorrow': 'morgen', 'fu.monday': 'Montag', 'fu.friday': 'Freitag', 'fu.week': 'nächste Woche', 'fu.none': 'ohne Datum', 'fu.noneHint': 'nur Warten auf',
  'filed.next': 'Nächste · {ctx}', 'filed.waiting': 'Warten auf', 'filed.waitingOn': 'Warten auf · nachhaken {day}', 'filed.someday': 'Irgendwann',
  'filed.project': 'Projekt · {p} · {ctx}', 'filed.deleted': 'gelöscht', 'filed.done': 'erledigt',
  // card stack (05)
  'stack.trays': 'Fächer', 'stack.key': 'Taste {k}', 'stack.done': 'Erledigt', 'stack.delete': 'Löschen', 'stack.back': 'Zurück',
  'stack.hint.next': 'dann Kontext', 'stack.hint.waiting': 'dann Nachhaken', 'stack.hint.someday': 'nicht jetzt', 'stack.hint.done': 'unter 2 Minuten',
  'stack.hint.delete': 'braucht keiner', 'stack.hint.back': 'anderes Fach', 'stack.projNext': '{n} nächste',
  'stack.q.what': 'Was ist es?', 'stack.q.ctx': 'Nächste · <b>wo erledigst du das?</b>', 'stack.q.follow': 'Warten auf · <b>wann fragst du nach?</b>',
  'stack.q.project': 'Zu welchem <b>Projekt</b>?', 'stack.q.newProj': 'Neues Projekt · <b>wie heißt es?</b>', 'stack.hint.newProj': 'Name, dann Kontext', 'stack.newProjHint': '⏎ anlegen, dann Kontext', 'stack.q.projctx': 'Erste Aktion für {p} · <b>wo erledigst du das?</b>',
  'stack.keys': '<kbd>1</kbd>–<kbd>5</kbd> Fach · <kbd>p</kbd> Projekt · <kbd>e</kbd> Text ändern · <kbd>→</kbd> überspringen · <kbd>z</kbd> zurück · <kbd>s</kbd> Liste',
  'stack.keys.step': '<kbd>1</kbd>–<kbd>{n}</kbd> wählen · <kbd>0</kbd> oder <kbd>Esc</kbd> zurück',
  'stack.keys.touch': 'Karte in ein Fach ziehen oder ein Fach antippen',
  'stack.captured': 'erfasst {d}', 'stack.count': '{i} von {n}', 'stack.nextUp': 'als Nächstes', 'stack.sr': 'Karte {i} von {n}: {d}. Einsortieren mit 1 bis 5.',
  'stack.tool.project': 'Projekt', 'stack.tool.edit': 'Text ändern', 'stack.tool.skip': 'Überspringen',
  // notices
  'n.captured': 'In Inbox ✓', 'n.done': 'Erledigt: {d}', 'n.deleted': 'Gelöscht: {d}', 'n.failed': 'Nicht gesendet: {d}', 'n.synced': 'Gesendet',
  'n.review': 'Rückblick gespeichert', 'n.planned': 'Für heute geplant', 'n.unplanned': 'Nicht mehr für heute', 'n.nextAdded': 'Nächste Aktion angelegt · {d} · {ctx}',
  'n.proj.active': '{p} wieder aktiv', 'n.proj.on_hold': '{p} ruht', 'n.proj.done': '{p} abgeschlossen',
  // margin
  'm.today': 'Heute', 'm.follow': 'Nachhaken', 'm.followToday': '{n} heute', 'm.since': 'seit {d}', 'm.followNone': 'Diese Woche ist niemand fällig.',
  'm.projOk': 'Alle {n} aktiven Projekte haben eine nächste Aktion.', 'm.reviewLast': 'Zuletzt <b>{d}</b>', 'm.reviewAgo': ', vor {n} Tagen.',
  'm.reviewToday': ', heute.', 'm.reviewStart': 'Rückblick beginnen', 'm.filed': 'Geklärt', 'm.filedNone': 'Noch nichts geklärt. Neues landet hier, sobald du es einsortierst.',
  // detail
  'd.title': 'Todo', 'd.runningSince': 'läuft seit {t}', 'd.notStarted': 'nicht gestartet', 'd.start': 'Starten', 'd.pause': 'Pausieren',
  'd.list': 'Liste', 'd.context': 'Kontext', 'd.project': 'Projekt', 'd.noProject': 'keins', 'd.today': 'Heute', 'd.plannedOn': 'für heute geplant',
  'd.plannedOff': 'für heute planen', 'd.due': 'Fällig', 'd.prio': 'Priorität', 'd.prioH': 'Hoch', 'd.prioM': 'Mittel', 'd.prioL': 'Niedrig',
  'd.follow': 'Nachhaken', 'd.defer': 'Zurückstellen', 'd.deferHint': 'bis dahin unsichtbar', 'd.until': 'Läuft ab', 'd.recur': 'Wiederholen',
  'd.recur.daily': 'täglich', 'd.recur.weekly': 'wöchentlich', 'd.recur.monthly': 'monatlich', 'd.recur.yearly': 'jährlich',
  'd.dep': 'Hängt ab von', 'd.depNone': 'nichts', 'd.more': 'Mehr', 'd.less': 'weniger', 'd.notes': '¶ Notizen', 'd.notePh': 'Notiz hinzufügen, Enter',
  'd.check': 'Abhaken', 'd.needCtx': 'Nächste braucht einen Kontext. Wähl einen, dann wandert das Todo.',
  // projects
  'proj.one': 'Projekt', 'proj.active': '{n} aktiv', 'proj.stalled': 'steckt fest', 'proj.stalledN': '{n} steckt fest', 'proj.allMoving': 'alle in Bewegung',
  'proj.state.active': 'aktiv', 'proj.state.on_hold': 'ruht', 'proj.state.done': 'abgeschlossen',
  'proj.row.active': 'in Bewegung', 'proj.row.on_hold': 'ruht', 'proj.row.done': 'abgeschlossen',
  'proj.rest': 'Ruhen lassen', 'proj.finish': 'Abschließen', 'proj.resume': 'Wieder aufnehmen', 'proj.status': 'Status',
  'proj.nextN': '{n} nächste', 'proj.waitN': '{n} wartet', 'proj.counts': '{n} nächste · {w} wartet',
  'proj.noOutcome': 'Noch kein Ergebnis formuliert. Der Plan in der Randspalte hilft dabei.', 'proj.noOutcomeShort': 'noch kein Ergebnis formuliert',
  'proj.stalledB': 'Steckt fest.', 'proj.stalledP': 'Kein nächster Schritt und nichts, worauf du wartest.', 'proj.setNext': 'Nächste Aktion festlegen',
  'proj.addPh': 'Nächste Aktion für {p}', 'proj.addHint': 'Kontext wählen · ⏎ anlegen · Esc', 'proj.addNeedCtx': 'Erst einen Kontext wählen (Alt 1–5)',
  'proj.new': 'Projekt', 'proj.newPh': 'Name des neuen Projekts', 'proj.newHint': '⏎ anlegen · Esc',
  'proj.secActive': 'Aktiv', 'proj.secResting': 'Ruht', 'proj.secDone': 'Abgeschlossen',
  'proj.err.empty': 'Gib dem Projekt einen Namen.', 'proj.err.long': 'Höchstens 100 Zeichen.', 'proj.err.chars': 'Ohne diese Zeichen: ( ) " \' \\ : / ? # %',
  'proj.err.edge': 'Nicht mit + - oder Leerzeichen beginnen oder mit Leerzeichen enden.', 'proj.err.reserved': 'Dieser Name ist reserviert.', 'proj.err.exists': 'Dieses Projekt gibt es schon.',
  'plan.title': 'Plan', 'plan.natural': 'Natürliche Planung', 'plan.none': 'Noch kein Plan', 'plan.noneP': 'Natürliche Planung in fünf Schritten: Warum, Vision, Ideen, Ordnen, Aktionen.',
  'plan.start': 'Plan beginnen', 'plan.why': 'Warum', 'plan.vision': 'Vision', 'plan.ideas': 'Ideen', 'plan.organize': 'Ordnen', 'plan.actions': 'Aktionen',
  'plan.actionsP': '„→ Nächste“ legt den Schritt als nächste Aktion an; den Kontext wählst du dabei.', 'plan.up': 'nach oben', 'plan.toNext': '→ Nächste',
  // other views
  'waiting.sorted': 'nach Nachhak-Datum', 'someday.sub': 'im Rückblick durchsehen',
  'review.last': 'zuletzt {d}', 'review.ago': 'vor {n} Tagen', 'review.today': 'heute', 'review.lead': 'Sechs Schritte, einmal pro Woche. Was runway prüfen kann, hakt es selbst ab.',
  'rs.1': 'Inbox leeren', 'rs.1w': 'Jeder Eintrag hat einen Platz.', 'rs.1s': '{n} offen', 'rs.empty': 'leer',
  'rs.2': 'Nächste Aktionen durchsehen', 'rs.2w': 'Erledigtes abhaken, Veraltetes löschen.', 'rs.2s': '{n} · {d} fällig',
  'rs.3': 'Warten auf: nachhaken', 'rs.3w': 'Wer ist dran, wann fragst du nach?', 'rs.3s': '{n} heute · {s} diese Woche',
  'rs.4': 'Projekte: jedes hat eine nächste Aktion', 'rs.4w': 'Alle aktiven Projekte sind in Bewegung.', 'rs.4stalled': 'Steckt fest: {p}',
  'rs.5': 'Irgendwann durchsehen', 'rs.5w': 'Wird etwas davon jetzt wichtig?', 'rs.5s': '{n} Ideen',
  'rs.6': 'Kalender: letzte und nächste Woche', 'rs.6w': 'Außerhalb von runway, im Kalender.', 'rs.6s': 'Kalender',
  'rs.check': 'Schritt {n} abhaken', 'rs.finish': 'Rückblick abschließen', 'rs.finishHint': 'speichert den Zeitpunkt für dich und für Claude',
  'all.open': '{n} offen', 'all.doneN': '{n} erledigt in 7 Tagen', 'all.showDone': 'Erledigte zeigen',
  'set.account': 'Konto', 'set.profile': 'Profil bearbeiten', 'set.password': 'Passwort', 'set.pwChanged': 'Zuletzt geändert vor 3 Monaten.', 'set.pwChange': 'Passwort ändern',
  'set.apiKey': 'API-Key', 'set.apiKeyP': 'Für die Android-App („Key einfügen“) und für Claude.', 'set.show': 'Anzeigen', 'set.copy': 'Kopieren',
  'set.claude': 'Claude verbinden', 'set.claudeP': 'Vier Schritte, jeder zum Kopieren: Umgebung, MCP-Server, Plugin, Regel für CLAUDE.md.',
  'set.mcp': 'MCP-Server', 'set.mcpP': 'Endpunkt /api/mcp · Claude Code · Claude Desktop · curl',
  'set.contexts': 'Kontexte', 'set.contextsP': 'Die Kontexte für Nächste, das Widget und die Android-Chips. Eine Liste für alle Geräte.', 'set.addCtx': '+ Kontext',
  'set.look': 'Darstellung', 'set.system': 'System', 'set.light': 'Hell', 'set.dark': 'Dunkel',
  'set.lang': 'Sprache', 'set.langP': 'Deutsch. Weitere Sprachen kommen als eigene Texttabelle dazu.',
  'set.admin': 'Verwaltung', 'set.adminP': 'Registrierung erlauben · Benutzer und Rollen', 'set.signout': 'Abmelden',
  // command palette (graft from 04)
  'pal.title': 'Befehle', 'pal.ph': 'Befehl, Todo oder Projekt suchen', 'pal.goto': 'Gehe zu {v}', 'pal.check': 'Abhaken: {d}',
  'pal.plan': 'Für heute planen: {d}', 'pal.unplan': 'Nicht mehr für heute: {d}', 'pal.clarify': 'Inbox klären ({n})',
  'pal.toStack': 'Inbox als Stapel', 'pal.toList': 'Inbox als Liste', 'pal.retry': 'Nicht Gesendetes erneut senden ({n})',
  'pal.ctx': 'Kontext {c}', 'pal.ctxOff': 'Kontextfilter aufheben', 'pal.theme': 'Darstellung: {v}', 'pal.capture': 'Als Todo erfassen: „{q}“',
  'pal.nothing': 'Nichts gefunden', 'pal.foot': '↑ ↓ wählen · ⏎ ausführen · Esc schließen',
  'pal.g.act': 'Aktionen', 'pal.g.nav': 'Gehe zu', 'pal.g.ctx': 'Kontext', 'pal.g.look': 'Ansicht', 'pal.g.todo': 'Todos', 'pal.g.proj': 'Projekte', 'pal.g.new': 'Neu',
  // shortcuts sheet
  'keys.title': 'Tastenkürzel', 'keys.close': 'Schließen', 'keys.g.all': 'Überall', 'keys.g.lists': 'Listen', 'keys.g.rows': 'Zeilen', 'keys.g.inbox': 'Inbox klären',
  'keys.palette': 'Befehle', 'keys.new': 'Neu: Todo · in Projekte ein Projekt · im Projekt die nächste Aktion', 'keys.search': 'Suchen',
  'keys.undo': 'Rückgängig (die letzte Aktion)', 'keys.move': 'Nächste, vorige Zeile', 'keys.open': 'Öffnen', 'keys.check': 'Abhaken',
  'keys.plan': 'Für heute planen (Tageslinse)', 'keys.edit': 'Text ändern', 'keys.start': 'Starten, Pausieren', 'keys.delete': 'Löschen',
  'keys.ctx': 'Kontext auf Nächste, 6 ohne Kontext', 'keys.cl.next': 'Nächste Aktion, dann Kontext', 'keys.cl.wait': 'Warten auf, dann Nachhaken',
  'keys.cl.proj': 'Zu einem Projekt, dann Kontext', 'keys.cl.mode': 'Liste oder Stapel', 'keys.cl.stack': 'Im Stapel: Fach',
}

let lang = 'de'
const TABLES = { de: DE }
export const setLang = (l) => { if (TABLES[l]) lang = l }
export { lang }

/** t('key', { var }) — {var} is replaced; a YYYY-MM-DD value in {day} is shown as "Fr 06.11.". */
export function t(key, vars) {
  const v = TABLES[lang][key] ?? DE[key]
  if (v == null) return key
  if (Array.isArray(v) || !vars) return v
  return v.replace(/\{(\w+)\}/g, (_, k) => {
    const x = vars[k]
    if (x == null) return ''
    return k === 'day' && /^\d{4}-\d{2}-\d{2}$/.test(x) ? dayLabel(x) : String(x)
  })
}
export const keys = () => Object.keys(DE)
