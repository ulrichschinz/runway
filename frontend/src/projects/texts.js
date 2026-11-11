import { addMessages } from '../shared/i18n.js'
import projectMessages from '../shared/messages.projects.de.js'

/**
 * The projects pages' own texts (`shared/messages.projects.de.js`, brief 0060), added to `t()` as
 * this chunk loads. The two pages import it first: every other component of `fe/projects` is one
 * of theirs, so the table is in before anything renders.
 */
addMessages(projectMessages)
