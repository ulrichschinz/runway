/**
 * The texts only the Rückblick page shows (plan M14, brief 0061; 06 `reviewSteps`): a table of its
 * own, so they travel in the page's chunk rather than the entry (the 130 kB gzip budget while both
 * UIs ship); `tasks/views/ReviewPage.vue` adds it to `t()` (`addMessages`) before it renders. Same
 * rules as `messages.de.js`: text only, keys never repeat a key of another table
 * (`frontend/tests/strings.test.js`).
 */
export default {
  'review.last': 'zuletzt {day}', 'review.ago': 'vor {n} Tagen', 'review.ago1': 'gestern', 'review.today': 'heute',
  'review.never': 'noch keiner festgehalten',
  'review.lead': 'Sechs Schritte, einmal pro Woche. Was runway prüfen kann, hakt es selbst ab.',
  'rs.1': 'Inbox leeren', 'rs.1w': 'Jeder Eintrag hat einen Platz.', 'rs.1s': '{n} offen', 'rs.empty': 'leer',
  'rs.2': 'Nächste Aktionen durchsehen', 'rs.2w': 'Erledigtes abhaken, Veraltetes löschen.', 'rs.2s': '{n} · {d} fällig',
  'rs.3': 'Warten auf: nachhaken', 'rs.3w': 'Wer ist dran, wann fragst du nach?', 'rs.3s': '{n} heute · {s} diese Woche',
  'rs.4': 'Projekte: jedes hat eine nächste Aktion', 'rs.4w': 'Alle aktiven Projekte sind in Bewegung.', 'rs.4stalled': 'Steckt fest: {p}',
  'rs.5': 'Irgendwann durchsehen', 'rs.5w': 'Wird etwas davon jetzt wichtig?', 'rs.5s': '{n} Ideen', 'rs.5s1': '1 Idee',
  'rs.6': 'Kalender: letzte und nächste Woche', 'rs.6w': 'Außerhalb von runway, im Kalender.', 'rs.6s': 'Kalender',
  'rs.check': 'Schritt {n} abhaken', 'rs.auto': 'Schritt {n}: runway hat es geprüft', 'rs.steps': 'Die Schritte',
  'rs.goTo': '{what}: {status}',
  'rs.done': 'Erledigt', 'rs.doneWhen': 'letzte 7 Tage', 'rs.doneNone': 'In den letzten sieben Tagen nichts abgehakt.',
  'rs.doneMore': 'und {n} weitere · in Alle zeigen', 'rs.doneAll': 'in Alle zeigen',
  'rs.finish': 'Rückblick abschließen', 'rs.finishHint': 'speichert den Zeitpunkt für dich und für Claude',
}
