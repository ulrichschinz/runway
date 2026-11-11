/**
 * The texts only the projects pages show (plan M13, brief 0060): Projekte, a project's page and its
 * plan document. A table of its own, so they travel in the pages' chunk rather than the entry (the
 * 130 kB gzip budget while both UIs ship); `projects/texts.js` adds it to `t()` (`addMessages`)
 * before any of those pages renders. Same rules as `messages.de.js`: text only, keys never repeat
 * a key of the main table (`frontend/tests/strings.test.js`).
 */
export default {
  'proj.none': 'Noch keine Projekte. Leg eins an: + Projekt.', 'proj.missing': 'Kein Projekt mit diesem Namen.',
  'proj.plan': 'mit Plan', 'proj.noPlan': 'noch kein Plan', 'proj.noOutcomeBelow': 'Noch kein Ergebnis formuliert. Der Plan unten hilft dabei.',
  'proj.addCtx': 'Kontext der nächsten Aktion',
  'proj.statusOf': 'Status von {p}',
  'plan.whyHint': 'Sinn und Grenzen des Projekts: der Rahmen für alle Entscheidungen.',
  'plan.purpose': 'Zweck: Warum mache ich das?', 'plan.purposePh': 'z. B. Kunden sollen uns leichter finden.',
  'plan.principles': 'Werte und Prinzipien', 'plan.principlesPh': 'z. B. Budget höchstens 2000 €. Qualität geht vor Tempo.',
  'plan.visionHint': 'Das beste mögliche Ergebnis, so konkret wie möglich, als wäre es schon da.',
  'plan.visionLabel': 'Wie sieht Erfolg aus?', 'plan.visionPh': 'z. B. Die neue Seite ist live. Kunden finden in drei Klicks, was sie brauchen.',
  'plan.ideasHint': 'Alles raus, was dir einfällt: kein Filter, keine Reihenfolge.', 'plan.ideaPh': 'Neue Idee, Enter',
  'plan.ideasNone': 'Noch keine Ideen. Einfach losschreiben.',
  'plan.organizeHint': 'Bewerten und ordnen: Was ist wichtig, was kommt zuerst? Unwichtiges streichen.', 'plan.orderPh': 'Schritt hinzufügen, Enter',
  'plan.import': 'Aus Ideen übernehmen', 'plan.organizeNone': 'Noch nichts geordnet.', 'plan.down': 'nach unten',
  'plan.actionsNone': 'Erst unter „Ordnen“ die Schritte festlegen.', 'plan.made': '✓ angelegt',
  'plan.save': 'Speichern', 'plan.saving': 'Speichert …', 'plan.saved': 'Gespeichert', 'plan.unsaved': 'Nicht gespeichert',
  'plan.saveFailed': 'Nicht gespeichert: {m}', 'plan.saveFailedNet': 'Nicht gespeichert: kein Netz. Dein Text bleibt hier.',
  'plan.discard': 'Verwerfen', 'plan.discardQ': 'Änderungen am Plan verwerfen?', 'plan.keep': 'Weiter bearbeiten',
  'plan.leaveQ': 'Der Plan hat ungespeicherte Änderungen. Trotzdem verlassen?',
  'plan.loading': 'Plan wird geladen …', 'plan.loadFailed': 'Der Plan ließ sich nicht laden.', 'plan.reload': 'Erneut laden',
  'plan.keys': 'Esc verwerfen · ⌘S oder Ctrl S speichern',
}
