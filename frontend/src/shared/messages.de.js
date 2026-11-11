/**
 * The German message table: every string the new UI shows, by key (`t('key')`).
 *
 * Ported from the prototype's table (`06-kombination/i18n.js`). German only in v1; an
 * English table can be added beside it without touching a component. Android keeps the
 * same words in `strings.xml`; the strings it pins are copied into the `strings` section
 * of `frontend/tests/vectors/gtd-rules.v1.json`, and a test holds them equal to this file.
 *
 * A value is a string with `{var}` placeholders, or — where part of it is set apart — an
 * array: headings and questions are `[before, emphasised, after]` (exactly one emphasised
 * part), keyboard hints are `[key, label]` pairs. No markup: a component decides how a
 * part looks, so nothing here is ever rendered as HTML.
 */

export default {
  // lists and navigation (pinned on Android: keep literally)
  'list.inbox': 'Inbox', 'list.next': 'Nächste', 'list.waiting': 'Warten auf', 'list.projects': 'Projekte', 'list.someday': 'Irgendwann',
  'nav.review': 'Rückblick', 'nav.all': 'Alle', 'nav.settings': 'Einstellungen', 'nav.lists': 'Listen', 'nav.more': 'Mehr', 'nav.due': 'fällig', 'nav.captured': 'neu erfasst',
  'title.inbox': 'Inbox', 'title.next': 'Nächste', 'title.waiting': 'Warten auf', 'title.projects': 'Projekte', 'title.someday': 'Irgendwann',
  'title.review': 'Rückblick', 'title.all': 'Alle', 'title.settings': 'Einstellungen',
  stand: 'Stand {t}', close: 'schließen', undo: 'Rückgängig', 'shell.margin': 'Randspalte', 'shell.today': 'Heute',
  // the shell (brief 0050)
  'brand.name': 'Agentic Reach', 'brand.product': 'runway', 'shell.offline': 'kein Netz',
  'shell.taskMissing': 'Dieses Todo gibt es nicht mehr.', 'shell.taskDone': 'Dieses Todo ist erledigt.', 'shell.moreClose': 'Mehr schließen',
  // login (pinned on Android: Benutzername, Passwort, Anmelden)
  'h.login': ['Bei runway ', 'anmelden', ''], 'h.register': ['Ein Konto ', 'anlegen', ''],
  'login.user': 'Benutzername', 'login.password': 'Passwort', 'login.submit': 'Anmelden', 'login.create': 'Konto erstellen',
  'login.busy': 'Einen Moment …', 'login.toRegister': 'Noch kein Konto? Registrieren', 'login.toLogin': 'Schon ein Konto? Anmelden',
  'login.refused': 'Benutzername oder Passwort stimmt nicht.', 'login.tooMany': 'Zu viele Versuche. Bitte in ein paar Minuten noch einmal.',
  'login.taken': 'Diesen Benutzernamen gibt es schon.', 'login.closed': 'Registrieren ist auf diesem Server abgeschaltet.',
  'login.failed': 'Das hat nicht geklappt. Bitte noch einmal.',
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
  'lens.cap': '{done} von {total} heute', 'lens.short': '{done} von {total}', 'lens.extra': ' · {n} zusätzlich',
  'lens.of': '{done} von {total}', 'lens.sub': 'geplant und erledigt', 'lens.aria': 'Heute {done} von {total} geplanten Todos erledigt. Tagesübersicht öffnen', 'lens.open': 'Tagesübersicht öffnen',
  // sections and empty states
  'sec.due': 'Fällig', 'sec.dueOther': 'Fällig · andere Kontexte', 'sec.otherCtx': 'andere Kontexte', 'ctx.plusNone': '+{n} ohne Kontext', 'sec.jetzt': 'Jetzt', 'sec.bald': 'Bald', 'sec.spaeter': 'Später',
  'sec.nextActions': 'Nächste Aktionen', 'sec.wdue': 'Heute nachhaken', 'sec.wsoon': 'Diese Woche', 'sec.wlater': 'Später oder ohne Datum',
  'sec.ideas': 'Ideen', 'sec.unlisted': 'Ohne Liste', 'sec.doneWeek': 'Erledigt, letzte 7 Tage',
  'empty.due': 'Nichts fällig', 'empty.inbox': 'Inbox ist leer', 'empty.next': 'Keine nächsten Aktionen', 'empty.nextCtx': 'Nichts für {ctx}', 'empty.wdue': 'Heute ist niemand fällig',
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
  'sync.unsent': 'Nicht gesendet', 'sync.retry': 'Erneut senden', 'sync.retryShort': 'senden', 'sync.title': 'Nicht gesendet', 'sync.n': '{n} nicht gesendet', 'notice.moved': '→ {list}',
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
  'stack.key': 'Taste {k}', 'stack.inTray': '{n} darin', 'stack.done': 'Erledigt', 'stack.delete': 'Löschen', 'stack.back': 'Zurück',
  'stack.hint.next': 'dann Kontext', 'stack.hint.waiting': 'dann Nachhaken', 'stack.hint.someday': 'nicht jetzt', 'stack.hint.done': 'unter 2 Minuten',
  'stack.hint.delete': 'braucht keiner', 'stack.hint.back': 'anderes Fach', 'stack.projNext': '{n} nächste',
  'stack.q.what': 'Was ist es?', 'stack.q.ctx': ['Nächste · ', 'wo erledigst du das?', ''], 'stack.q.follow': ['Warten auf · ', 'wann fragst du nach?', ''],
  'stack.q.project': ['Zu welchem ', 'Projekt', '?'], 'stack.q.newProj': ['Neues Projekt · ', 'wie heißt es?', ''], 'stack.hint.newProj': 'Name, dann Kontext', 'stack.newProjHint': '⏎ anlegen, dann Kontext', 'stack.q.projctx': ['Erste Aktion für {p} · ', 'wo erledigst du das?', ''],
  'stack.keys': [['1–5', 'Fach'], ['p', 'Projekt'], ['e', 'Text ändern'], ['→', 'überspringen'], ['z', 'zurück'], ['s', 'Liste']],
  'stack.keys.step': [['1–{n}', 'wählen'], ['0 oder Esc', 'zurück']],
  'stack.keys.touch': 'Karte in ein Fach ziehen oder ein Fach antippen',
  'stack.captured': 'erfasst {d}', 'stack.count': '{i} von {n}', 'stack.nextUp': 'als Nächstes', 'stack.sr': 'Karte {i} von {n}: {d}. Einsortieren mit 1 bis 5.',
  'stack.tool.project': 'Projekt', 'stack.tool.edit': 'Text ändern', 'stack.tool.skip': 'Überspringen',
  // notices
  'notice.captured': 'In Inbox ✓', 'notice.done': 'Erledigt', 'notice.deleted': 'Gelöscht', 'notice.failed': 'Nicht gesendet: {d}', 'notice.synced': 'Gesendet',
  'notice.review': 'Rückblick gespeichert', 'notice.planned': 'Für heute geplant', 'notice.unplanned': 'Nicht mehr für heute', 'notice.nextAdded': 'Nächste Aktion angelegt · {d} · {ctx}',
  'notice.proj.active': '{p} wieder aktiv', 'notice.proj.on_hold': '{p} ruht', 'notice.proj.done': '{p} abgeschlossen',
  // margin
  'm.today': 'Heute', 'm.follow': 'Nachhaken', 'm.followToday': '{n} heute', 'm.since': 'seit {d}', 'm.followNone': 'Diese Woche ist niemand fällig.',
  'm.projOk': 'Alle {n} aktiven Projekte haben eine nächste Aktion.', 'm.reviewLast': ['Zuletzt ', '{d}', ''], 'm.reviewAgo': ', vor {n} Tagen.', 'm.reviewAgo1': ', gestern.',
  'm.reviewToday': ', heute.', 'm.reviewNever': 'Noch kein Rückblick festgehalten.',
  'm.followDay': '{day}', 'm.doneToday': 'Heute erledigt', 'm.sinceDay': 'seit {day}', 'm.reviewStart': 'Rückblick beginnen', 'm.filed': 'Geklärt', 'm.filedNone': 'Noch nichts geklärt. Neues landet hier, sobald du es einsortierst.',
  // detail
  'd.title': 'Todo', 'd.runningSince': 'läuft seit {t}', 'd.notStarted': 'nicht gestartet', 'd.start': 'Starten', 'd.pause': 'Pausieren',
  'd.list': 'Liste', 'd.context': 'Kontext', 'd.project': 'Projekt', 'd.noProject': 'keins', 'd.today': 'Heute', 'd.plannedOn': 'für heute geplant',
  'd.plannedOff': 'für heute planen', 'd.due': 'Fällig', 'd.prio': 'Priorität', 'd.prioH': 'Hoch', 'd.prioM': 'Mittel', 'd.prioL': 'Niedrig',
  'd.follow': 'Nachhaken', 'd.defer': 'Zurückstellen', 'd.deferHint': 'bis dahin unsichtbar', 'd.until': 'Läuft ab', 'd.recur': 'Wiederholen',
  'd.recur.daily': 'täglich', 'd.recur.weekly': 'wöchentlich', 'd.recur.monthly': 'monatlich', 'd.recur.yearly': 'jährlich',
  'd.dep': 'Hängt ab von', 'd.depNone': 'nichts', 'd.more': 'Mehr', 'd.less': 'weniger', 'd.notes': '¶ Notizen', 'd.notePh': 'Notiz hinzufügen, Enter',
  'd.check': 'Abhaken', 'd.needCtx': 'Nächste braucht einen Kontext. Wähl einen, dann wandert das Todo.',
  'd.id': 'ID {id}', 'd.titleField': 'Text des Todos', 'd.scheduled': 'Geplant', 'd.tags': 'Tags', 'd.tagPh': 'Tag hinzufügen, Enter',
  'd.tagBad': 'Ein Tag ist ein Wort ohne Leerzeichen und Komma.', 'd.tagList': 'Die Liste wählst du oben unter „Liste“.', 'd.tagHas': 'Das Todo hat diesen Tag schon.',
  'd.deferredUntil': 'zurückgestellt bis {d}',
  'd.remove': '{x} entfernen', 'd.recurPh': 'anderer Rhythmus, Enter', 'd.depAdd': 'hinzufügen …', 'd.recurKeeps': 'wiederkehrend: bleibt',
  'd.legacyTag': 'Ein alter Komma-Tag lässt sich hier nicht aufteilen. Bereinige ihn zuerst.', 'd.discard': 'Verwerfen',
  'd.recurring': 'Wiederholt sich jetzt. Jede Wiederholung ist ein eigenes Todo in deinen Listen.',
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
  'all.open': '{n} offen', 'all.doneN': '{n} erledigt in 7 Tagen', 'all.showDone': 'Erledigte zeigen',
  'set.look': 'Darstellung', 'set.system': 'System', 'set.light': 'Hell', 'set.dark': 'Dunkel', 'set.signout': 'Abmelden',
  // command palette (graft from 04)
  'pal.title': 'Befehle', 'pal.ph': 'Befehl, Todo oder Projekt suchen', 'pal.goto': 'Gehe zu {v}', 'pal.check': 'Abhaken: {d}',
  'pal.plan': 'Für heute planen: {d}', 'pal.unplan': 'Nicht mehr für heute: {d}', 'pal.clarify': 'Inbox klären ({n})',
  'pal.toStack': 'Inbox als Stapel', 'pal.toList': 'Inbox als Liste', 'pal.retry': 'Nicht Gesendetes erneut senden ({n})',
  'pal.ctx': 'Kontext {c}', 'pal.ctxOff': 'Kontextfilter aufheben', 'pal.theme': 'Darstellung: {v}', 'pal.capture': 'Als Todo erfassen: „{q}“',
  'pal.nothing': 'Nichts gefunden', 'pal.foot': '↑ ↓ wählen · ⏎ ausführen · Esc schließen',
  'pal.open': 'Öffnen: {d}', 'pal.edit': 'Text ändern: {d}', 'pal.start': 'Starten: {d}', 'pal.stop': 'Pausieren: {d}',
  'pal.delete': 'Löschen: {d}', 'pal.move': 'Nach {l}: {d}', 'pal.cl': 'Klären: {v}', 'pal.skip': 'Überspringen: {d}',
  'pal.g.act': 'Aktionen', 'pal.g.nav': 'Gehe zu', 'pal.g.ctx': 'Kontext', 'pal.g.look': 'Ansicht', 'pal.g.todo': 'Todos', 'pal.g.proj': 'Projekte', 'pal.g.new': 'Neu',
  // shortcuts sheet
  'keys.title': 'Tastenkürzel', 'keys.close': 'Schließen', 'keys.g.all': 'Überall', 'keys.g.lists': 'Listen', 'keys.g.rows': 'Zeilen', 'keys.g.inbox': 'Inbox klären',
  'keys.palette': 'Befehle', 'keys.new': 'Neu: Todo · in Projekte ein Projekt · im Projekt die nächste Aktion', 'keys.search': 'Suchen',
  'keys.undo': 'Rückgängig (die letzte Aktion)', 'keys.move': 'Nächste, vorige Zeile', 'keys.open': 'Öffnen', 'keys.check': 'Abhaken',
  'keys.plan': 'Für heute planen (Tageslinse)', 'keys.edit': 'Text ändern', 'keys.start': 'Starten, Pausieren', 'keys.delete': 'Löschen',
  'keys.ctx': 'Kontext auf Nächste, 6 ohne Kontext', 'keys.cl.next': 'Nächste Aktion, dann Kontext', 'keys.cl.wait': 'Warten auf, dann Nachhaken',
  'keys.cl.proj': 'Zu einem Projekt, dann Kontext', 'keys.cl.answer': 'Antwort wählen', 'keys.cl.back': 'Einen Schritt zurück',
  'keys.moveTo': 'Verschieben nach Nächste, Warten auf, Irgendwann', 'keys.cl.mode': 'Liste oder Stapel', 'keys.cl.stack': 'Im Stapel: Fach',
  'keys.g.stack': 'Inbox als Stapel', 'keys.stack.skip': 'Karte überspringen',
}
