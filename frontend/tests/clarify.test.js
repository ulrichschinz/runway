import { describe, expect, it } from 'vitest'

import {
  NO_STEP, answerStep, filedLabel, moveLabel, pickChoice, startStep, stepBack, stepChoices,
} from '../src/shared/clarify.js'
import { clarifyPayload } from '../src/shared/gtdRules.js'

// Saturday: "morgen" is the next working day, Monday.
const TODAY = '2026-10-31'
const CONTEXTS = ['@computer', '@anrufe', '@buero', '@unterwegs', '@zuhause', '@garten']
const PROJECTS = ['Garten', 'Website-Relaunch', 'Steuer 2026', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9', 'P10']
const sources = { contexts: CONTEXTS, projects: PROJECTS, today: TODAY }
const at = (step, project = null) => ({ step, project })

describe('opening and closing a question', () => {
  it('opens a, w, p with their question; the same key closes it', () => {
    expect(startStep(NO_STEP, 'ctx')).toEqual(at('ctx'))
    expect(startStep(at('ctx'), 'ctx')).toEqual(NO_STEP)
    expect(startStep(at('ctx'), 'follow')).toEqual(at('follow'))
    expect(startStep(NO_STEP, 'project')).toEqual(at('project'))
    expect(startStep(at('projctx', 'Garten'), 'project')).toEqual(NO_STEP)
    expect(startStep(at('newproject'), 'project')).toEqual(NO_STEP)
    expect(startStep(at('projctx', 'Garten'), 'ctx')).toEqual(at('ctx'))
  })

  it('goes back one level with Esc', () => {
    expect(stepBack(at('projctx', 'Garten'))).toEqual(at('project'))
    expect(stepBack(at('newproject'))).toEqual(at('project'))
    expect(stepBack(at('project'))).toEqual(NO_STEP)
    expect(stepBack(at('ctx'))).toEqual(NO_STEP)
    expect(stepBack(NO_STEP)).toEqual(NO_STEP)
  })
})

describe('the answers a question offers', () => {
  it('keys the first five contexts, and offers the rest without a key', () => {
    const choices = stepChoices(at('ctx'), sources)
    expect(choices.map((c) => c.value)).toEqual(CONTEXTS)
    expect(choices.map((c) => c.key)).toEqual(['1', '2', '3', '4', '5', null])
    expect(stepChoices(at('projctx', 'Garten'), sources).map((c) => c.key)).toEqual(['1', '2', '3', '4', '5', null])
  })

  it('keys the first nine projects', () => {
    const choices = stepChoices(at('project'), sources)
    expect(choices).toHaveLength(10)
    expect(choices[8]).toEqual({ key: '9', value: 'P9', label: 'P9' })
    expect(choices[9].key).toBe(null)
  })

  it('offers the four follow-up answers with their day', () => {
    expect(stepChoices(at('follow'), sources)).toEqual([
      { key: '1', value: '2026-11-02', label: 'Montag', hint: 'Mo 02.11.' },
      { key: '2', value: '2026-11-06', label: 'Freitag', hint: 'Fr 06.11.' },
      { key: '3', value: '2026-11-09', label: 'nächste Woche', hint: 'Mo 09.11.' },
      { key: '4', value: '', label: 'ohne Datum', hint: 'nur Warten auf' },
    ])
  })

  it('offers nothing on the first question or while a name is typed', () => {
    expect(stepChoices(NO_STEP, sources)).toEqual([])
    expect(stepChoices(at('newproject'), sources)).toEqual([])
  })
})

describe('answering', () => {
  it('files Nächste only with the context chosen', () => {
    expect(answerStep(at('ctx'), '2', sources)).toEqual({ file: { to: 'next:@anrufe', opts: {} } })
    expect(answerStep(at('ctx'), '6', sources)).toBe(null)
    expect(answerStep(NO_STEP, '1', sources)).toBe(null)
  })

  it('files Warten auf with the follow-up day, or none for "ohne Datum"', () => {
    expect(answerStep(at('follow'), '1', sources)).toEqual({ file: { to: 'waiting', opts: { followUp: '2026-11-02' } } })
    expect(answerStep(at('follow'), '4', sources)).toEqual({ file: { to: 'waiting', opts: { followUp: '' } } })
    expect(answerStep(at('follow'), '5', sources)).toBe(null)
  })

  it('asks a project, then its first action\'s context, then files both', () => {
    expect(answerStep(at('project'), '1', sources)).toEqual({ state: at('projctx', 'Garten') })
    expect(answerStep(at('projctx', 'Garten'), '5', sources)).toEqual({
      file: { to: 'project:Garten', opts: { ctx: '@zuhause' } },
    })
  })

  it('asks a new project\'s name with n, in the project question only', () => {
    expect(answerStep(at('project'), 'n', sources)).toEqual({ state: at('newproject') })
    expect(answerStep(at('ctx'), 'n', sources)).toBe(null)
    expect(answerStep(at('newproject'), '1', sources)).toBe(null)
  })

  it('takes a click on an unkeyed choice like a digit', () => {
    const sixth = stepChoices(at('ctx'), sources)[5]
    expect(pickChoice(at('ctx'), sixth)).toEqual({ file: { to: 'next:@garten', opts: {} } })
    expect(pickChoice(at('ctx'), undefined)).toBe(null)
  })

  it('never files what clarifyPayload would refuse', () => {
    for (const step of ['ctx', 'follow', 'projctx']) {
      for (const choice of stepChoices(at(step, 'Garten'), sources)) {
        const { file } = pickChoice(at(step, 'Garten'), choice)
        expect(() => clarifyPayload(file.to, file.opts), `${step} ${choice.value}`).not.toThrow()
      }
    }
  })
})

describe('what the notice says', () => {
  it('names where an Inbox item went', () => {
    expect(filedLabel('next:@computer')).toBe('Nächste · @computer')
    expect(filedLabel('waiting', { followUp: '2026-11-06' })).toBe('Warten auf · nachhaken Fr 06.11.')
    expect(filedLabel('waiting', { followUp: '' })).toBe('Warten auf')
    expect(filedLabel('someday')).toBe('Irgendwann')
    expect(filedLabel('project:Garten', { ctx: '@zuhause' })).toBe('Projekt · Garten · @zuhause')
    expect(filedLabel('done')).toBe('erledigt')
    expect(filedLabel('delete')).toBe('gelöscht')
    expect(() => filedLabel('elsewhere')).toThrow()
  })

  it('names where a list move took a todo, with its contexts for Nächste', () => {
    expect(moveLabel({ tags: ['waiting', '@anrufe', '@computer'] }, 'next')).toBe('Nächste · @anrufe @computer')
    expect(moveLabel({ tags: ['next,@unterwegs,@buero'] }, 'next')).toBe('Nächste · @unterwegs @buero')
    expect(moveLabel({ tags: ['next', '@anrufe'] }, 'waiting')).toBe('Warten auf')
    expect(moveLabel({ tags: ['next', '@anrufe'] }, 'someday')).toBe('Irgendwann')
    expect(moveLabel({ tags: ['waiting'] }, 'next', '@computer')).toBe('Nächste · @computer')
  })
})
