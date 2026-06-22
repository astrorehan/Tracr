import { describe, it, expect } from 'vitest'
import { matchesCondition, evaluateRules, type RuleInput } from './engine'
import type { Rule, RuleCondition } from '@/types/db'

function input(overrides: Partial<RuleInput> = {}): RuleInput {
  return { payee: null, note: null, amount: 0, currency: 'USD', type: 'expense', ...overrides }
}

function rule(overrides: Partial<Rule> = {}): Rule {
  return {
    id: 'r1',
    user_id: 'u1',
    book_id: 'b1',
    name: 'rule',
    is_active: true,
    sort_order: 0,
    match_type: 'all',
    conditions: [],
    actions: {},
    stop_after: false,
    created_at: '',
    ...overrides,
  }
}

const cond = (c: RuleCondition): RuleCondition => c

describe('matchesCondition', () => {
  it('matches text fields case-insensitively', () => {
    const i = input({ payee: 'GoFood Jakarta' })
    expect(matchesCondition(cond({ field: 'payee', op: 'contains', value: 'gofood' }), i)).toBe(true)
    expect(matchesCondition(cond({ field: 'payee', op: 'starts_with', value: 'go' }), i)).toBe(true)
    expect(matchesCondition(cond({ field: 'payee', op: 'equals', value: 'gofood jakarta' }), i)).toBe(true)
    expect(matchesCondition(cond({ field: 'payee', op: 'contains', value: 'grab' }), i)).toBe(false)
  })

  it('matches the transaction type only with equals', () => {
    const i = input({ type: 'income' })
    expect(matchesCondition(cond({ field: 'type', op: 'equals', value: 'income' }), i)).toBe(true)
    expect(matchesCondition(cond({ field: 'type', op: 'equals', value: 'expense' }), i)).toBe(false)
  })

  it('compares amount in major units', () => {
    const i = input({ amount: 50000, currency: 'USD' }) // $500.00
    expect(matchesCondition(cond({ field: 'amount', op: 'gt', value: '100' }), i)).toBe(true)
    expect(matchesCondition(cond({ field: 'amount', op: 'lt', value: '100' }), i)).toBe(false)
    expect(matchesCondition(cond({ field: 'amount', op: 'equals', value: '500' }), i)).toBe(true)
  })

  it('never matches an empty value for non-type fields', () => {
    expect(matchesCondition(cond({ field: 'payee', op: 'contains', value: '  ' }), input({ payee: 'x' }))).toBe(false)
  })
})

describe('evaluateRules', () => {
  it('applies matching rules in sort_order with last-category-wins and tag union', () => {
    const rules = [
      rule({
        id: 'b',
        sort_order: 2,
        conditions: [{ field: 'payee', op: 'contains', value: 'food' }],
        actions: { category_id: 'cat-2', tag_ids: ['t2'] },
      }),
      rule({
        id: 'a',
        sort_order: 1,
        conditions: [{ field: 'payee', op: 'contains', value: 'food' }],
        actions: { category_id: 'cat-1', tag_ids: ['t1'] },
      }),
    ]
    const out = evaluateRules(rules, input({ payee: 'GoFood' }))
    expect(out.categoryId).toBe('cat-2') // higher sort_order runs last, wins
    expect(out.tagIds.sort()).toEqual(['t1', 't2'])
    expect(out.matched.map((r) => r.id)).toEqual(['a', 'b'])
  })

  it('skips inactive rules and rules with no conditions', () => {
    const rules = [
      rule({ id: 'off', is_active: false, conditions: [{ field: 'payee', op: 'contains', value: 'x' }], actions: { category_id: 'c' } }),
      rule({ id: 'empty', conditions: [], actions: { category_id: 'c' } }),
    ]
    const out = evaluateRules(rules, input({ payee: 'xyz' }))
    expect(out.categoryId).toBeNull()
    expect(out.matched).toHaveLength(0)
  })

  it('stops after a matching rule with stop_after set', () => {
    const rules = [
      rule({ id: 'first', sort_order: 1, stop_after: true, conditions: [{ field: 'type', op: 'equals', value: 'expense' }], actions: { category_id: 'first-cat' } }),
      rule({ id: 'second', sort_order: 2, conditions: [{ field: 'type', op: 'equals', value: 'expense' }], actions: { category_id: 'second-cat' } }),
    ]
    const out = evaluateRules(rules, input())
    expect(out.categoryId).toBe('first-cat')
    expect(out.matched.map((r) => r.id)).toEqual(['first'])
  })

  it('respects match_type "all" vs "any"', () => {
    const conds: RuleCondition[] = [
      { field: 'payee', op: 'contains', value: 'food' },
      { field: 'amount', op: 'gt', value: '100' },
    ]
    const i = input({ payee: 'GoFood', amount: 5000, currency: 'USD' }) // $50, fails the >100 check
    expect(evaluateRules([rule({ match_type: 'all', conditions: conds, actions: { category_id: 'c' } })], i).categoryId).toBeNull()
    expect(evaluateRules([rule({ match_type: 'any', conditions: conds, actions: { category_id: 'c' } })], i).categoryId).toBe('c')
  })
})
