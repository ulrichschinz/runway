/**
 * The texts only Einstellungen shows (plan M14, brief 0061; 06 `renderSettings`, the old
 * `SettingsView.vue`): a table of its own, so they travel in the page's chunk rather than the entry
 * (the 130 kB gzip budget while both UIs ship); `identity/texts.js` adds it to `t()` (`addMessages`)
 * before the page renders. Same rules as `messages.de.js`: text only, keys never repeat a key of
 * another table (`frontend/tests/strings.test.js`). The four "Claude verbinden" steps keep their
 * text in `claudeConnect.js`; only their titles are here, by the step's `id`.
 */
export default {
  'set.role.admin': 'Admin', 'set.role.user': 'Benutzer',
  'set.account': 'Konto', 'set.profile': 'Profil bearbeiten', 'set.name': 'Name', 'set.namePh': 'Dein Name',
  'set.email': 'E-Mail', 'set.emailPh': 'du@example.com', 'set.noName': 'Noch kein Name eingetragen.',
  'set.save': 'Speichern', 'set.cancel': 'Abbrechen', 'set.saving': 'Speichert …', 'set.saved': 'Gespeichert',
  'set.password': 'Passwort', 'set.pwChange': 'Passwort ändern', 'set.pw.current': 'Aktuelles Passwort',
  'set.pw.new': 'Neues Passwort', 'set.pw.confirm': 'Neues Passwort wiederholen',
  'set.pw.needCurrent': 'Gib dein aktuelles Passwort ein.', 'set.pw.needNew': 'Das neue Passwort darf nicht leer sein.',
  'set.pw.mismatch': 'Die beiden neuen Passwörter stimmen nicht überein.', 'set.pw.wrong': 'Das aktuelle Passwort stimmt nicht.',
  'set.pw.done': 'Passwort geändert.',
  'set.apiKey': 'API-Key', 'set.apiKeyP': 'Für die Android-App („Key einfügen“) und für Claude. Wer ihn hat, kann in runway alles, was du kannst.',
  'set.show': 'Anzeigen', 'set.hide': 'Verbergen', 'set.copy': 'Kopieren', 'set.copied': 'Kopiert',
  'set.copyFailed': 'Kopieren ging nicht. Markiere den Text und kopiere ihn selbst.',
  'set.copyFailedHidden': 'Kopieren ging nicht. Der Key ist hier verborgen: zeig ihn erst mit „Anzeigen“ beim API-Key, dann markiere den Text und kopiere ihn selbst.',
  'set.keyLoading': 'Key wird geladen …', 'set.keyOf': 'Dein API-Key',
  'set.regen': 'Neuen Key erzeugen …', 'set.regenGo': 'Neuen Key erzeugen',
  'set.regenQ': 'Neuen Key erzeugen? Der alte hört sofort auf zu funktionieren, auch in der Android-App und in Claude.',
  'set.regenDone': 'Neuer Key erzeugt. Trag ihn in der Android-App und in ~/.zshenv neu ein.',
  'set.claude': 'Claude verbinden',
  'set.claudeP': 'Vier Schritte, einmal je Rechner. Danach erreicht Claude dieses runway über MCP, und der Skill weiß, wie ein täglicher oder wöchentlicher Rückblick geht.',
  'set.step.key': 'API-Key und diesen Server in die Shell schreiben',
  'set.step.mcp': 'Den MCP-Server verbinden, für deinen Benutzer, damit jedes Repository ihn sieht',
  'set.step.skill': 'Den runway-Skill installieren',
  'set.step.rule': 'Die feste Regel in deine globalen Anweisungen schreiben (~/.claude/CLAUDE.md)',
  'set.keyHidden': 'Der Key ist verborgen; Kopieren nimmt den echten. Anzeigen beim API-Key zeigt ihn.',
  'set.skillZip': ['Oder, für jeden anderen Client, der einen festen X-Api-Key-Header senden kann: ', 'den Skill herunterladen (.zip)', '. Das ist die Fassung, die zu diesem Server passt. Ohne den verbundenen MCP-Server nützt der Skill nichts.'],
  'set.setupRef': ['Berechtigungen und das optionale Profil: Abschnitt 2 und 5 von ', 'references/setup.md', ' im Skill.'],
  'set.projectLine': 'Einem Repository sagen, welches Projekt es ist, mit einer Zeile in seiner CLAUDE.md oder AGENTS.md:',
  'set.pluginUpdate': 'Den Skill später aktualisieren:',
  'set.mcp': 'MCP-Server', 'set.mcpP': 'Jeder MCP-Client erreicht runway über Streamable HTTP, unter dieser Adresse:',
  'set.mcpClient': 'Client',
  'set.lang': 'Sprache', 'set.langP': 'Deutsch. Weitere Sprachen kommen als eigene Texttabelle dazu.',
  'set.admin': 'Verwaltung', 'set.reg': 'Registrierung erlauben', 'set.regP': 'Ausgeschaltet kann niemand mehr ein Konto anlegen.',
  'set.users': 'Benutzer', 'set.you': 'du', 'set.promote': 'Zum Admin machen', 'set.demote': 'Admin-Rechte entziehen',
  'set.admin.lastAdmin': 'Der letzte Admin kann nicht zurückgestuft werden. Mach erst jemand anderen zum Admin.',
  'set.admin.noUser': 'Diesen Benutzer gibt es nicht mehr.',
  'set.offline': 'Kein Netz. Es wurde nichts geändert.', 'set.failed': 'Das hat nicht geklappt. Versuch es noch einmal.',
  'set.loadFailed': 'Ließ sich nicht laden.', 'set.reload': 'Erneut laden', 'set.loading': 'Wird geladen …',
  'set.signoutP': 'Meldet diesen Browser ab. Die Android-App und Claude bleiben verbunden: sie nutzen den API-Key.',
}
