<script setup>
/**
 * Rückblick (plan M14, brief 0061; 06 `renderHead('review')`, `reviewSteps`, `renderReview`): the
 * weekly review as 06's six steps, each with its live count as a way into its list, ticked by
 * itself where runway can check it (an empty Inbox, no stuck project) and by hand otherwise; under
 * them what was done in the last seven days; "Rückblick abschließen" records the review
 * (`POST /gtd/review`, through the outbox) and says so on the notice.
 *
 * The hand ticks live for the session (`listState.reviewChecked`, as 06's `ui.reviewChecked`), so
 * going into a list and back keeps them; recording the review clears them. The margin column's
 * panels stand beside it as on every page (plan M12), without their own "Rückblick".
 */
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import NoticeBar from '../../layout/NoticeBar.vue'
import AppFrame from '../../layout/AppFrame.vue'
import EyebrowLine from '../../layout/ui/EyebrowLine.vue'
import PageHeading from '../../layout/ui/PageHeading.vue'
import PillButton from '../../layout/ui/PillButton.vue'
import SectionRule from '../../layout/ui/SectionRule.vue'
import { useFrame } from '../../composables/useFrame.js'
import { addMessages, t } from '../../shared/i18n.js'
import reviewMessages from '../../shared/messages.review.de.js'
import { doneShown, reviewHead, reviewSteps } from '../../shared/weeklyReview.js'
import InkStrike from '../components/InkStrike.vue'
import { reviewChecked, showDone } from '../listState.js'
import { notice, showNotice, undoNotice } from '../notice.js'
import { useGtdStore } from '../stores/gtd.js'

// The page's own texts travel in its chunk (brief 0061); in before anything renders.
addMessages(reviewMessages)

const frame = useFrame()
const gtd = useGtdStore()
const router = useRouter()

const text = (part) => t(part.key, part.vars)

const eyebrow = computed(() => [t('nav.review'), ...reviewHead(gtd.reviewAge).map(text)])

const steps = computed(() => {
  if (!gtd.loaded) return []
  return reviewSteps({
    inbox: gtd.inbox.length,
    next: gtd.next.length,
    due: gtd.sectionsFor().faellig.length,
    waitingDue: gtd.followUpCounts.due,
    waitingSoon: gtd.followUpCounts.soon,
    stalled: gtd.projects.filter((p) => p.status === 'active' && p.stalled).map((p) => p.name),
    someday: gtd.someday.length,
  }, reviewChecked.value).map((s) => ({ ...s, label: t(s.what), why: text(s.why), status: text(s.status) }))
})

const done = computed(() => doneShown(gtd.doneWeek))

function toggle(step) {
  if (step.auto) return
  const next = new Set(reviewChecked.value)
  if (next.has(step.id)) next.delete(step.id)
  else next.add(step.id)
  reviewChecked.value = next
}

/** Alle with its done section on: the whole week, where every row can be opened. */
function showAllDone() {
  showDone.value = true
  router.push('/all')
}

function finish() {
  gtd.recordReview()
  reviewChecked.value = new Set()
  showNotice(t('notice.review'))
}
</script>

<template>
  <AppFrame v-bind="frame.props.value" v-on="frame.on">
    <template #head>
      <div class="text">
        <EyebrowLine :parts="eyebrow" />
        <PageHeading :parts="t('h.review')" />
        <p class="lead" data-fold>{{ t('review.lead') }}</p>
      </div>
    </template>
    <template v-if="gtd.loaded">
      <ol class="steps" :aria-label="t('rs.steps')">
        <li v-for="s in steps" :key="s.id" class="step" :class="{ ok: s.ok }">
          <button
            type="button" class="num" :aria-pressed="s.ok" :aria-disabled="s.auto || undefined"
            :aria-label="s.auto ? t('rs.auto', { n: s.id }) : t('rs.check', { n: s.id })" @click="toggle(s)"
          >{{ String(s.id).padStart(2, '0') }}</button>
          <span class="body">
            <span class="what">{{ s.label }}</span>
            <span class="why">{{ s.why }}</span>
          </span>
          <RouterLink v-if="s.go" :to="s.go" class="go" :aria-label="t('rs.goTo', { what: s.label, status: s.status })">
            {{ s.status }} <span aria-hidden="true">→</span>
          </RouterLink>
          <span v-else class="go static">{{ s.status }}</span>
        </li>
      </ol>

      <section class="done" :aria-label="t('rs.done')">
        <SectionRule :parts="[t('rs.done'), t('rs.doneWhen'), gtd.doneWeek.length || '']" />
        <p v-if="!done.rows.length" class="none">{{ t('rs.doneNone') }}</p>
        <ul v-else class="rows">
          <li v-for="d in done.rows" :key="d.uuid" class="row">
            <span class="txt"><span class="ink">{{ d.description }}<InkStrike :seed="d.uuid" /></span></span>
            <span v-if="d.project" class="meta">{{ d.project }}</span>
          </li>
        </ul>
        <button v-if="done.rows.length" type="button" class="more" @click="showAllDone">
          {{ done.more ? t('rs.doneMore', { n: done.more }) : t('rs.doneAll') }} <span aria-hidden="true">→</span>
        </button>
      </section>

      <div class="foot">
        <PillButton action @click="finish">{{ t('rs.finish') }}</PillButton>
        <span class="hint">{{ t('rs.finishHint') }}</span>
      </div>
    </template>
    <template #notice>
      <NoticeBar v-if="notice" :key="notice.id" :text="notice.text" :undo="!!notice.undo" :ms="notice.ms" @undo="undoNotice" />
    </template>
    <template #margin><component :is="frame.margin" :view="frame.props.value.view" /></template>
  </AppFrame>
</template>

<style scoped>
.text { display: grid; row-gap: 12px; }
.lead { margin: 6px 0 0; max-width: 54ch; color: var(--rw-mute); font-size: 15.5px; line-height: 1.5; }
/* 06 web.css .step */
.steps { list-style: none; margin: 18px 0 0; padding: 0; }
.step {
  display: grid; grid-template-columns: 44px minmax(0, 1fr) auto; column-gap: 14px; align-items: center;
  min-height: 64px; padding: 10px 4px; border-bottom: 1px solid var(--rw-rule);
}
.num {
  min-height: 44px; min-width: 44px; text-align: left;
  font-family: var(--rw-font-mono); font-size: 11px; letter-spacing: 0.08em; color: var(--rw-mute);
}
.num:hover:not([aria-disabled]) { color: var(--rw-text); }
.num[aria-disabled] { cursor: default; }
.what { display: block; font-size: 16px; font-weight: 500; }
.why { display: block; margin-top: 2px; font-size: 13px; color: var(--rw-mute); }
.ok .what { color: var(--rw-mute); }
.ok .num { color: var(--rw-text); }
.ok .num::after { content: ' ✓'; }
/* 06 `pill quiet` with its arrow, as a link into the list */
.go {
  display: inline-flex; align-items: center; gap: 6px; min-height: 44px; padding: 0 12px; border-radius: var(--rw-radius-pill);
  font-size: 13.5px; font-weight: 500; white-space: nowrap; color: var(--rw-mute); text-decoration: none;
}
.go:hover { color: var(--rw-text); background: var(--rw-hover); }
.go.static { font-family: var(--rw-font-mono); font-size: 11.5px; font-weight: 400; }
.go.static:hover { color: var(--rw-mute); background: transparent; }

.done { margin-top: 30px; }
.none { margin: 12px 4px 0; color: var(--rw-mute); font-size: 14px; }
/* 06 base.css .donelist: struck through, at rest; ink means done, so no ring and no coral but the strike */
.rows { list-style: none; margin: 12px 0 0; padding: 0 4px; display: grid; gap: 7px; }
.row { display: flex; gap: 10px; align-items: baseline; min-width: 0; }
.txt { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--rw-mute); font-size: 13.5px; }
.ink { position: relative; }
.ink :deep(.strike path) { opacity: 1; stroke-dashoffset: 0; }
.meta { margin-left: auto; font-family: var(--rw-font-mono); font-size: 11px; color: var(--rw-mute); white-space: nowrap; }
.more {
  display: inline-flex; align-items: center; gap: 6px; min-height: 44px; margin-top: 4px; padding: 0 4px;
  font-family: var(--rw-font-mono); font-size: 11.5px; color: var(--rw-mute);
}
.more:hover { color: var(--rw-text); }

/* 06 web.css .review-foot */
.foot { display: flex; flex-wrap: wrap; align-items: center; gap: 16px; margin: 26px 0 8px; }
.hint { font-family: var(--rw-font-mono); font-size: 11.5px; color: var(--rw-mute); }
@media (max-width: 760px) {
  .text { row-gap: 8px; }
  .step { grid-template-columns: 44px minmax(0, 1fr); column-gap: 8px; row-gap: 2px; }
  .num { grid-row: span 2; align-self: start; }
  .step .go { grid-column: 2; justify-self: start; padding: 0; min-height: 44px; }
  .meta { display: none; }
}
</style>
