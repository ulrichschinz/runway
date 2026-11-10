import { onScopeDispose } from 'vue'
import { useRouter } from 'vue-router'
import { registerSearch } from '../composables/useCommands.js'
import { contextTagsOf } from '../shared/contextTags.js'
import { listOf } from '../shared/gtdRules.js'
import { t } from '../shared/i18n.js'
import { matchesSearch } from '../shared/taskFilters.js'
import { showNotice } from './notice.js'
import { useGtdStore } from './stores/gtd.js'

/**
 * Search over the snapshot (plan M9): the `/` search's sections and the command palette's todos,
 * projects and "Als Todo erfassen". Both find a todo by `matchesSearch` — description, project and
 * raw tags, the old UI's rule — so the palette and the list never disagree about a hit.
 */

/** Where a todo's own list lives; one in no list is on Alle. */
const LIST_PATH = { inbox: '/inbox', next: '/next', waiting: '/waiting', someday: '/someday', none: '/all' }

/**
 * The `/` search's sections (06 `sectionsFor('search')`): the hits by list, empty lists left out.
 *
 * @param {ReturnType<typeof useGtdStore>} gtd
 * @param {string} query as typed (not empty)
 * @returns {Array<{key: string, label: string, kind: string, tasks: object[]}>}
 */
export function searchSections(gtd, query) {
  const needle = query.trim().toLowerCase()
  const hit = (tasks) => tasks.filter((task) => matchesSearch(task, needle))
  return [
    { key: 'inbox', label: t('list.inbox'), kind: 'inbox', tasks: hit(gtd.inbox) },
    { key: 'next', label: t('list.next'), kind: 'next', tasks: hit(gtd.next) },
    { key: 'waiting', label: t('list.waiting'), kind: 'waiting', tasks: hit(gtd.waiting) },
    { key: 'someday', label: t('list.someday'), kind: 'someday', tasks: hit(gtd.someday) },
    { key: 'unlisted', label: t('sec.unlisted'), kind: 'next', tasks: hit(gtd.unlisted) },
  ].filter((s) => s.tasks.length)
}

/**
 * Register the palette's task search for as long as the calling scope lives (the new UI's
 * composition root): a todo opens in its own list with its detail (`?task=`), a project on its
 * page, and the query can be captured into the Inbox with the notice's Rückgängig.
 */
export function useTaskSearch() {
  const gtd = useGtdStore()
  const router = useRouter()

  function provide(query) {
    const needle = query.toLowerCase()
    const todos = gtd.open
      .filter((task) => matchesSearch(task, needle))
      .map((task) => ({
        group: 'todo',
        label: task.description,
        keywords: [task.project ?? '', ...task.tags],
        sub: [t(`status.${listOf(task)}`), task.project, contextTagsOf(task).join(' ')].filter(Boolean).join(' · '),
        run: () => router.push({ path: LIST_PATH[listOf(task)], query: { task: task.uuid } }),
      }))
    const projects = gtd.projects
      .filter((p) => p.name.toLowerCase().includes(needle))
      .map((p) => ({
        group: 'proj',
        label: p.name,
        sub: t('proj.one'),
        run: () => router.push(`/projects/${encodeURIComponent(p.name)}`),
      }))
    const capture = {
      group: 'new',
      label: t('pal.capture', { q: query }),
      hint: '⏎',
      always: true,
      run: () => {
        const op = gtd.capture(query)
        if (op) showNotice(t('notice.captured'), () => gtd.undo(op))
      },
    }
    return [...todos, ...projects, capture]
  }

  onScopeDispose(registerSearch(provide))
}
