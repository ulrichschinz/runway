// Startbahn: UI strings. German is the default, English the second language, as the brand
// brief asks. Every rendered string comes from a key; elements carry data-i18n="key" (and
// data-i18n-attr for placeholder / aria-label). In the Vue build this is vue-i18n with the
// same keys; on Android it is res/values/strings.xml plus values-en/strings.xml.
const DE = {
  'app.name': 'runway',
  'nav.inbox': 'Inbox', 'nav.next': 'Nächste', 'nav.waiting': 'Warten auf', 'nav.projects': 'Projekte', 'nav.someday': 'Irgendwann',
  'nav.tickler': 'Zurückgestellt', 'nav.done': 'Erledigt', 'nav.review': 'Wochenrückblick', 'nav.settings': 'Einstellungen',
  'nav.more': 'Mehr', 'nav.contexts': 'Kontexte', 'nav.search': 'Suchen', 'nav.lists': 'Listen', 'nav.navigation': 'Navigation',
  'nav.details': 'Details', 'nav.stage': 'Startbahn', 'nav.signout': 'Abmelden',
  'side.today': 'heute {n}', 'side.reviewAgo': 'vor 6 T.', 'side.stand': 'Stand {t}', 'side.unsent': '{n} nicht gesendet',
  'capture.placeholder': 'Neues Todo',
  'filter.all': 'Alle', 'filter.label': 'Kontext',
  'date.today': 'Samstag, 31. Oktober',
  'eyebrow.next': 'startbahn · {date}', 'eyebrow.inbox': 'vorfeld · erfassen und klären', 'eyebrow.waiting': 'warteschleife · bei anderen',
  'eyebrow.projects': 'flugplan · jede Woche durchsehen', 'eyebrow.someday': 'hangar · ideen für später', 'eyebrow.tickler': 'zurückgestellt bis zu einem Datum',
  'eyebrow.done': 'abgehakt · neueste zuerst', 'eyebrow.review': 'zuletzt am 25.10.', 'eyebrow.settings': 'konto und verbindungen', 'eyebrow.details': 'details · {list}',
  'head.oldest': 'älteste vom {d}', 'head.stalled': '{n} ohne nächsten Schritt', 'head.allMoving': 'jedes aktive Projekt hat einen nächsten Schritt', 'head.back': '‹ Projekte',
  'status.label': 'Status', 'status.active': 'Aktiv', 'status.on_hold': 'Pausiert', 'status.done': 'Erledigt',
  'review.a': 'Wochen', 'review.b': 'rückblick',
  'stage.next': 'startbahn', 'stage.inbox': 'vorfeld', 'stage.waiting': 'warteschleife', 'stage.doneToday': '{n} heute erledigt', 'stage.inner': 'innen: nachhaken',
  'sr.now': 'Jetzt dran: {list}',
  'card.free': 'frei', 'card.anywhere': 'überall', 'card.prioHigh': 'priorität hoch',
  'meta.running': 'läuft seit {t}', 'meta.captured': 'erfasst {d}', 'meta.unsent': 'Nicht gesendet', 'meta.from': 'ab {d}', 'meta.prioH': 'Prio H',
  'sec.due': 'Fällig', 'sec.dueOther': 'Fällig · andere Kontexte', 'sec.next': 'Nächste Aktionen', 'sec.unclear': 'Ungeklärt', 'sec.followUp': 'Nachhaken',
  'sec.waits': 'Wartet', 'sec.ideas': 'Ideen', 'sec.heldProjects': 'Pausierte Projekte', 'sec.reappears': 'Taucht wieder auf', 'sec.today': 'Heute',
  'sec.earlier': 'Früher · letzte 14 Tage', 'sec.pausedDone': 'Pausiert und erledigt', 'sec.noList': 'Ohne Liste',
  'empty.next': 'Keine nächsten Aktionen.', 'empty.nextCtx': 'Nichts für {ctx}.', 'empty.showAll': 'Alle zeigen', 'empty.allUp': 'Alles oben.',
  'empty.inbox': 'Inbox ist leer.', 'empty.inboxEm': 'Kopf frei.', 'empty.waiting': 'Du wartest auf nichts.', 'empty.noStep': 'Kein nächster Schritt.',
  'empty.earlier': 'Nichts in den letzten 14 Tagen.', 'empty.none': 'Nichts hier.',
  'clarify.q': 'Klären · Ist es zu tun?', 'clarify.project': 'Projekt …', 'clarify.done': 'Gleich erledigt', 'clarify.where': 'Wo oder womit?',
  'clarify.noCtx': 'ohne Kontext', 'clarify.which': 'Zu welchem Projekt?', 'clarify.newProject': 'Neues Projekt:', 'clarify.create': 'Anlegen',
  'toast.done': 'Erledigt: {task}', 'toast.doneStalled': 'Erledigt. {p} hat keinen nächsten Schritt.', 'toast.inbox': 'In Inbox ✓', 'toast.deleted': 'Gelöscht',
  'toast.toNext': 'Nach Nächste', 'toast.toNextCtx': 'Nach Nächste · {ctx}', 'toast.toWaiting': 'Nach Warten auf · Wiedervorlage {d}', 'toast.toSomeday': 'Nach Irgendwann',
  'toast.toProject': 'Ins Projekt {p} · Nach Nächste', 'toast.projectCreated': 'Projekt angelegt: {p}', 'toast.planSaved': 'Plan gespeichert', 'toast.followed': 'Wiedervorlage {d}',
  'toast.reviewSaved': 'Wochenrückblick gespeichert', 'toast.unsent': 'Nicht gesendet: {task}', 'toast.saved': 'Gespeichert', 'toast.nextAdded': 'Nach Nächste · {p}',
  'act.undo': 'Rückgängig', 'act.check': 'Abhaken', 'act.checkLabel': 'Abhaken: {task}', 'act.start': 'Starten', 'act.pause': 'Pausieren', 'act.delete': 'Löschen',
  'act.close': 'Schließen', 'act.toNext': 'Nach Nächste', 'act.followed': 'Nachgehakt', 'act.add': 'Hinzufügen', 'act.save': 'Speichern', 'act.retry': 'Erneut senden',
  'act.cancel': 'Abbrechen', 'act.done': 'Erledigt',
  'project.goal': 'Ziel', 'project.tasks': 'Aufgaben', 'project.plan': 'Plan', 'project.stuck': 'Stockt · aktiv, aber ohne nächsten Schritt',
  'project.whatNext': 'Was ist der nächste sichtbare Schritt?', 'project.setNext': 'Nächsten Schritt festlegen', 'project.addNext': 'Nächsten Schritt hinzufügen',
  'project.ctxHint': '@kontext im Text geht auch', 'project.new': 'Neues Projekt', 'project.paused': 'pausiert', 'project.counts': '{n} nächste · {w} wartet',
  'project.noNext': 'kein nächster Schritt',
  'plan.purpose': 'Zweck', 'plan.purposeHint': 'Warum gibt es dieses Projekt?', 'plan.principles': 'Prinzipien', 'plan.principlesHint': 'Woran hältst du dich dabei?',
  'plan.vision': 'Vision', 'plan.visionHint': 'Wie sieht es aus, wenn es fertig ist?', 'plan.ideas': 'Ideen', 'plan.ideaHint': 'Neue Idee',
  'plan.noIdeas': 'Noch keine Ideen. Einfach losschreiben.', 'plan.organize': 'Ordnen und Aktionen', 'plan.fromIdeas': 'Aus Ideen übernehmen',
  'plan.orgHint': 'Schritt hinzufügen', 'plan.noOrg': 'Noch nichts geordnet.', 'plan.up': 'Nach oben', 'plan.down': 'Nach unten', 'plan.remove': 'Entfernen',
  'plan.toOrg': 'Ordnen', 'plan.inNext': 'in Nächste', 'plan.saved': 'gespeichert', 'plan.dirty': 'nicht gespeichert', 'plan.drag': 'Ziehen zum Ordnen',
  'review.s1': 'Inbox leeren', 'review.s1t': '{n} ungeklärt', 'review.s1b': 'Klären', 'review.s2': 'Nächste durchsehen', 'review.s2t': '{n} Aktionen, {d} fällig',
  'review.s2b': 'Durchsehen', 'review.s3': 'Warten auf nachhaken', 'review.s3t': '{n} zum Nachhaken', 'review.s3b': 'Nachhaken', 'review.s4': 'Projekte prüfen',
  'review.s4b': 'Prüfen', 'review.s5': 'Irgendwann durchsehen', 'review.s5t': '{n} Ideen', 'review.ok': 'erledigt', 'review.finish': 'Rückblick abschließen',
  'set.profile': 'Profil', 'set.name': 'Name', 'set.email': 'E-Mail', 'set.role': '{u} · Administrator', 'set.password': 'Passwort', 'set.pwCurrent': 'Aktuelles Passwort',
  'set.pwNew': 'Neues Passwort', 'set.pwConfirm': 'Wiederholen', 'set.pwChange': 'Passwort ändern', 'set.apiKey': 'API-Key', 'set.show': 'Anzeigen', 'set.hide': 'Verbergen',
  'set.copy': 'Kopieren', 'set.regen': 'Neu erzeugen', 'set.regenAsk': 'Neu erzeugen? Der alte Key funktioniert dann sofort nicht mehr.', 'set.connect': 'Claude verbinden',
  'set.mcp': 'MCP-Server', 'set.look': 'Darstellung', 'set.lookSystem': 'Folgt dem System (hell oder dunkel).', 'set.lang': 'Sprache',
  'set.admin': 'Verwaltung', 'set.registration': 'Registrierung erlauben', 'set.users': 'Nutzer', 'set.promote': 'Zum Admin machen', 'set.demote': 'Zurückstufen',
  'set.roleAdmin': 'Admin', 'set.roleUser': 'Nutzer', 'set.you': 'du', 'set.signoutHint': 'Meldet dich auf diesem Gerät ab. Nicht gesendete Änderungen gehen vorher raus.',
  'set.step1': 'Schlüssel und Adresse setzen', 'set.step2': 'MCP-Server eintragen', 'set.step3': 'Plugin installieren', 'set.step4': 'Regel in ~/.claude/CLAUDE.md',
  'detail.list': 'Liste', 'detail.onlyProject': 'nur im Projekt', 'detail.context': 'Kontext · wo oder womit', 'detail.project': 'Projekt', 'detail.noProject': 'ohne Projekt',
  'detail.prio': 'Priorität', 'detail.none': 'keine', 'detail.prioH': 'Hoch', 'detail.prioM': 'Mittel', 'detail.prioL': 'Niedrig', 'detail.due': 'Fällig',
  'detail.followUp': 'Nachhaken', 'detail.begins': 'Beginnt', 'detail.wait': 'Zurückstellen bis', 'detail.until': 'Läuft ab', 'detail.recur': 'Wiederholung',
  'detail.recurNeedsDue': 'braucht ein Fälligkeitsdatum', 'detail.dep': 'Wartet auf Aufgabe', 'detail.notes': 'Notizen', 'detail.noteHint': 'Notiz hinzufügen',
  'detail.description': 'Beschreibung', 'detail.captured': 'erfasst {d}', 'detail.urgency': 'dringlichkeit {u}',
  'recur.daily': 'täglich', 'recur.weekly': 'wöchentlich', 'recur.monthly': 'monatlich', 'recur.yearly': 'jährlich',
  'pal.search': 'Todo, Projekt oder Kontext suchen', 'pal.where': 'Wohin?', 'pal.todos': 'Todos', 'pal.projects': 'Projekte', 'pal.contexts': 'Kontexte',
  'pal.goto': 'Gehe zu', 'pal.actions': 'Aktionen', 'pal.filterNext': 'Nächste filtern', 'pal.project': 'Projekt', 'pal.nothing': 'Nichts gefunden',
  'pal.captureAs': '„{q}“ als neues Todo erfassen', 'pal.newProject': 'Neues Projekt anlegen',
  'keys.title': 'tastatur', 'keys.new': 'Neues Todo', 'keys.search': 'Suchen', 'keys.move': 'Auswahl bewegen', 'keys.check': 'Abhaken', 'keys.details': 'Details',
  'keys.start': 'Starten, pausieren', 'keys.undo': 'Rückgängig', 'keys.ctx': 'Kontext (Nächste)', 'keys.clarify': 'Klären (Inbox)', 'keys.delete': 'Löschen', 'keys.close': 'Schließen',
  'net.offline': 'Ohne Verbindung', 'net.online': 'Verbunden',
}
const EN = {
  'nav.inbox': 'Inbox', 'nav.next': 'Next', 'nav.waiting': 'Waiting for', 'nav.projects': 'Projects', 'nav.someday': 'Someday',
  'nav.tickler': 'Deferred', 'nav.done': 'Done', 'nav.review': 'Weekly review', 'nav.settings': 'Settings',
  'nav.more': 'More', 'nav.contexts': 'Contexts', 'nav.search': 'Search', 'nav.lists': 'Lists', 'nav.navigation': 'Navigation',
  'nav.details': 'Details', 'nav.stage': 'Runway', 'nav.signout': 'Sign out',
  'side.today': 'today {n}', 'side.reviewAgo': '6 d ago', 'side.stand': 'As of {t}', 'side.unsent': '{n} not sent',
  'capture.placeholder': 'New todo',
  'filter.all': 'All', 'filter.label': 'Context',
  'date.today': 'Saturday, 31 October',
  'eyebrow.next': 'runway · {date}', 'eyebrow.inbox': 'apron · capture and clarify', 'eyebrow.waiting': 'holding · with others',
  'eyebrow.projects': 'flight plan · review weekly', 'eyebrow.someday': 'hangar · ideas for later', 'eyebrow.tickler': 'deferred until a date',
  'eyebrow.done': 'checked off · newest first', 'eyebrow.review': 'last on 25 Oct', 'eyebrow.settings': 'account and connections', 'eyebrow.details': 'details · {list}',
  'head.oldest': 'oldest from {d}', 'head.stalled': '{n} without a next step', 'head.allMoving': 'every active project has a next step', 'head.back': '‹ Projects',
  'status.label': 'Status', 'status.active': 'Active', 'status.on_hold': 'On hold', 'status.done': 'Done',
  'review.a': 'Weekly ', 'review.b': 'review',
  'stage.next': 'runway', 'stage.inbox': 'apron', 'stage.waiting': 'holding', 'stage.doneToday': '{n} done today', 'stage.inner': 'inner ring: follow up',
  'sr.now': 'Up now: {list}',
  'card.free': 'free', 'card.anywhere': 'anywhere', 'card.prioHigh': 'high priority',
  'meta.running': 'running since {t}', 'meta.captured': 'captured {d}', 'meta.unsent': 'Not sent', 'meta.from': 'from {d}', 'meta.prioH': 'Prio H',
  'sec.due': 'Due', 'sec.dueOther': 'Due · other contexts', 'sec.next': 'Next actions', 'sec.unclear': 'Unclarified', 'sec.followUp': 'Follow up',
  'sec.waits': 'Waiting', 'sec.ideas': 'Ideas', 'sec.heldProjects': 'Paused projects', 'sec.reappears': 'Comes back', 'sec.today': 'Today',
  'sec.earlier': 'Earlier · last 14 days', 'sec.pausedDone': 'Paused and done', 'sec.noList': 'No list',
  'empty.next': 'No next actions.', 'empty.nextCtx': 'Nothing for {ctx}.', 'empty.showAll': 'Show all', 'empty.allUp': 'All up there.',
  'empty.inbox': 'Inbox is empty.', 'empty.inboxEm': 'Clear mind.', 'empty.waiting': 'You are not waiting for anything.', 'empty.noStep': 'No next step.',
  'empty.earlier': 'Nothing in the last 14 days.', 'empty.none': 'Nothing here.',
  'clarify.q': 'Clarify · Is it actionable?', 'clarify.project': 'Project …', 'clarify.done': 'Done already', 'clarify.where': 'Where or with what?',
  'clarify.noCtx': 'no context', 'clarify.which': 'Which project?', 'clarify.newProject': 'New project:', 'clarify.create': 'Create',
  'toast.done': 'Done: {task}', 'toast.doneStalled': 'Done. {p} has no next step.', 'toast.inbox': 'In Inbox ✓', 'toast.deleted': 'Deleted',
  'toast.toNext': 'To Next', 'toast.toNextCtx': 'To Next · {ctx}', 'toast.toWaiting': 'To Waiting for · follow up {d}', 'toast.toSomeday': 'To Someday',
  'toast.toProject': 'Into {p} · To Next', 'toast.projectCreated': 'Project created: {p}', 'toast.planSaved': 'Plan saved', 'toast.followed': 'Follow up {d}',
  'toast.reviewSaved': 'Weekly review saved', 'toast.unsent': 'Not sent: {task}', 'toast.saved': 'Saved', 'toast.nextAdded': 'To Next · {p}',
  'act.undo': 'Undo', 'act.check': 'Check off', 'act.checkLabel': 'Check off: {task}', 'act.start': 'Start', 'act.pause': 'Pause', 'act.delete': 'Delete',
  'act.close': 'Close', 'act.toNext': 'To Next', 'act.followed': 'Followed up', 'act.add': 'Add', 'act.save': 'Save', 'act.retry': 'Send again',
  'act.cancel': 'Cancel', 'act.done': 'Done',
  'project.goal': 'Outcome', 'project.tasks': 'Tasks', 'project.plan': 'Plan', 'project.stuck': 'Stuck · active, but no next step',
  'project.whatNext': 'What is the next visible step?', 'project.setNext': 'Set the next step', 'project.addNext': 'Add a next step',
  'project.ctxHint': '@context in the text works too', 'project.new': 'New project', 'project.paused': 'paused', 'project.counts': '{n} next · {w} waiting',
  'project.noNext': 'no next step',
  'plan.purpose': 'Purpose', 'plan.purposeHint': 'Why does this project exist?', 'plan.principles': 'Principles', 'plan.principlesHint': 'Which standards do you keep?',
  'plan.vision': 'Vision', 'plan.visionHint': 'What does done look like?', 'plan.ideas': 'Ideas', 'plan.ideaHint': 'New idea',
  'plan.noIdeas': 'No ideas yet. Just start writing.', 'plan.organize': 'Organize and act', 'plan.fromIdeas': 'Take over the ideas',
  'plan.orgHint': 'Add a step', 'plan.noOrg': 'Nothing organized yet.', 'plan.up': 'Move up', 'plan.down': 'Move down', 'plan.remove': 'Remove',
  'plan.toOrg': 'Organize', 'plan.inNext': 'in Next', 'plan.saved': 'saved', 'plan.dirty': 'not saved', 'plan.drag': 'Drag to reorder',
  'review.s1': 'Empty the inbox', 'review.s1t': '{n} unclarified', 'review.s1b': 'Clarify', 'review.s2': 'Go through Next', 'review.s2t': '{n} actions, {d} due',
  'review.s2b': 'Go through', 'review.s3': 'Follow up on Waiting for', 'review.s3t': '{n} to follow up', 'review.s3b': 'Follow up', 'review.s4': 'Check projects',
  'review.s4b': 'Check', 'review.s5': 'Go through Someday', 'review.s5t': '{n} ideas', 'review.ok': 'done', 'review.finish': 'Finish review',
  'set.profile': 'Profile', 'set.name': 'Name', 'set.email': 'Email', 'set.role': '{u} · Administrator', 'set.password': 'Password', 'set.pwCurrent': 'Current password',
  'set.pwNew': 'New password', 'set.pwConfirm': 'Repeat', 'set.pwChange': 'Change password', 'set.apiKey': 'API key', 'set.show': 'Show', 'set.hide': 'Hide',
  'set.copy': 'Copy', 'set.regen': 'Regenerate', 'set.regenAsk': 'Regenerate? The old key stops working at once.', 'set.connect': 'Connect Claude',
  'set.mcp': 'MCP server', 'set.look': 'Appearance', 'set.lookSystem': 'Follows the system (light or dark).', 'set.lang': 'Language',
  'set.admin': 'Administration', 'set.registration': 'Allow registration', 'set.users': 'Users', 'set.promote': 'Make admin', 'set.demote': 'Demote',
  'set.roleAdmin': 'Admin', 'set.roleUser': 'User', 'set.you': 'you', 'set.signoutHint': 'Signs you out on this device. Unsent changes go out first.',
  'set.step1': 'Set key and address', 'set.step2': 'Add the MCP server', 'set.step3': 'Install the plugin', 'set.step4': 'Rule in ~/.claude/CLAUDE.md',
  'detail.list': 'List', 'detail.onlyProject': 'project only', 'detail.context': 'Context · where or with what', 'detail.project': 'Project', 'detail.noProject': 'no project',
  'detail.prio': 'Priority', 'detail.none': 'none', 'detail.prioH': 'High', 'detail.prioM': 'Medium', 'detail.prioL': 'Low', 'detail.due': 'Due',
  'detail.followUp': 'Follow up', 'detail.begins': 'Starts', 'detail.wait': 'Defer until', 'detail.until': 'Expires', 'detail.recur': 'Repeat',
  'detail.recurNeedsDue': 'needs a due date', 'detail.dep': 'Waits for task', 'detail.notes': 'Notes', 'detail.noteHint': 'Add a note',
  'detail.description': 'Description', 'detail.captured': 'captured {d}', 'detail.urgency': 'urgency {u}',
  'recur.daily': 'daily', 'recur.weekly': 'weekly', 'recur.monthly': 'monthly', 'recur.yearly': 'yearly',
  'pal.search': 'Search todos, projects or contexts', 'pal.where': 'Where to?', 'pal.todos': 'Todos', 'pal.projects': 'Projects', 'pal.contexts': 'Contexts',
  'pal.goto': 'Go to', 'pal.actions': 'Actions', 'pal.filterNext': 'Filter Next', 'pal.project': 'Project', 'pal.nothing': 'Nothing found',
  'pal.captureAs': 'Capture “{q}” as a new todo', 'pal.newProject': 'Create a project',
  'keys.title': 'keyboard', 'keys.new': 'New todo', 'keys.search': 'Search', 'keys.move': 'Move selection', 'keys.check': 'Check off', 'keys.details': 'Details',
  'keys.start': 'Start, pause', 'keys.undo': 'Undo', 'keys.ctx': 'Context (Next)', 'keys.clarify': 'Clarify (Inbox)', 'keys.delete': 'Delete', 'keys.close': 'Close',
  'net.offline': 'Offline', 'net.online': 'Online',
}
const DICTS = { de: DE, en: { ...DE, ...EN } }

let lang = 'de'
try { const s = localStorage.getItem('runway.lang'); if (s === 'en' || s === 'de') lang = s } catch { /* storage blocked: default */ }

export const getLang = () => lang
export function setLang(l) {
  if (!DICTS[l]) return
  lang = l
  try { localStorage.setItem('runway.lang', l) } catch { /* per-viewer convenience only */ }
  document.documentElement.lang = l
  applyStatic()
}
export function t(key, vars) {
  let s = DICTS[lang][key] ?? DE[key] ?? key
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m))
  return s
}
// Static markup: data-i18n="key" sets the text, data-i18n-attr="placeholder:key,aria-label:key" sets attributes.
export function applyStatic(root = document) {
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n)
  for (const el of root.querySelectorAll('[data-i18n-attr]')) {
    for (const pair of el.dataset.i18nAttr.split(',')) { const [a, k] = pair.split(':'); el.setAttribute(a.trim(), t(k.trim())) }
  }
}
