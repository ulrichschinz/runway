import { addMessages } from '../shared/i18n.js'
import settingsMessages from '../shared/messages.settings.de.js'

/**
 * Einstellungen's own texts (`shared/messages.settings.de.js`, brief 0061), added to `t()` as this
 * chunk loads. The page imports it first: every other settings component is one of its children,
 * so the table is in before anything renders.
 */
addMessages(settingsMessages)
