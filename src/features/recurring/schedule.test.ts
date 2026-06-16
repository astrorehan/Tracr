import { describe, it, expect } from 'vitest'
import { advanceDue, dueInfo, frequencyText, dueText } from './schedule'

describe('advanceDue', () => {
  it('advances by one period for each frequency', () => {
    expect(advanceDue('2024-03-10', 'weekly')).toBe('2024-03-17')
    expect(advanceDue('2024-03-10', 'monthly')).toBe('2024-04-10')
    expect(advanceDue('2024-03-10', 'yearly')).toBe('2025-03-10')
  })

  it('honors a multi-period interval', () => {
    expect(advanceDue('2024-03-10', 'weekly', 2)).toBe('2024-03-24')
    expect(advanceDue('2024-01-31', 'monthly', 1)).toBe('2024-02-29') // clamps to leap Feb
  })
})

describe('dueInfo', () => {
  const today = new Date('2024-03-10T12:00:00')

  it('buckets a date relative to today', () => {
    expect(dueInfo('2024-03-08', today)).toEqual({ status: 'overdue', days: -2 })
    expect(dueInfo('2024-03-10', today)).toEqual({ status: 'due_soon', days: 0 })
    expect(dueInfo('2024-03-15', today)).toEqual({ status: 'due_soon', days: 5 })
    expect(dueInfo('2024-03-20', today)).toEqual({ status: 'upcoming', days: 10 })
  })

  it('treats exactly 7 days out as due_soon, 8 as upcoming', () => {
    expect(dueInfo('2024-03-17', today).status).toBe('due_soon')
    expect(dueInfo('2024-03-18', today).status).toBe('upcoming')
  })
})

describe('frequencyText', () => {
  it('uses a single word for interval 1', () => {
    expect(frequencyText('monthly')).toBe('monthly')
    expect(frequencyText('weekly', 1)).toBe('weekly')
  })

  it('spells out multi-period intervals', () => {
    expect(frequencyText('weekly', 2)).toBe('every 2 weeks')
    expect(frequencyText('monthly', 3)).toBe('every 3 months')
    expect(frequencyText('yearly', 2)).toBe('every 2 years')
  })
})

describe('dueText', () => {
  const today = new Date('2024-03-10T12:00:00')

  it('phrases the relative due date', () => {
    expect(dueText('2024-03-07', today)).toBe('Overdue 3d')
    expect(dueText('2024-03-10', today)).toBe('Due today')
    expect(dueText('2024-03-11', today)).toBe('Due tomorrow')
    expect(dueText('2024-03-15', today)).toBe('in 5d')
  })
})
