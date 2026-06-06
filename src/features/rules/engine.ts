import { fromMinorUnits } from '@/lib/money'
import type { Rule, RuleCondition, TransactionType } from '@/types/db'

/** The transaction fields a rule can match against. */
export interface RuleInput {
  payee: string | null
  note: string | null
  /** Native amount in minor units. */
  amount: number
  currency: string
  type: TransactionType
}

export interface RuleOutcome {
  /** Last category set by a matching rule (null = none touched it). */
  categoryId: string | null
  /** Union of tag ids added by matching rules. */
  tagIds: string[]
  /** Rules that matched (in order), for UI hints. */
  matched: Rule[]
}

function textMatch(op: RuleCondition['op'], haystack: string, needle: string): boolean {
  const h = haystack.toLowerCase()
  const n = needle.toLowerCase()
  switch (op) {
    case 'contains':
      return h.includes(n)
    case 'equals':
      return h === n
    case 'starts_with':
      return h.startsWith(n)
    default:
      return false // gt/lt are meaningless for text
  }
}

export function matchesCondition(cond: RuleCondition, input: RuleInput): boolean {
  if (!cond.value.trim() && cond.field !== 'type') return false
  switch (cond.field) {
    case 'payee':
      return textMatch(cond.op, input.payee ?? '', cond.value)
    case 'note':
      return textMatch(cond.op, input.note ?? '', cond.value)
    case 'type':
      return cond.op === 'equals' && input.type === cond.value
    case 'amount': {
      const lhs = fromMinorUnits(input.amount, input.currency)
      const rhs = parseFloat(cond.value)
      if (!Number.isFinite(rhs)) return false
      switch (cond.op) {
        case 'gt':
          return lhs > rhs
        case 'lt':
          return lhs < rhs
        case 'equals':
          return lhs === rhs
        default:
          return false
      }
    }
    default:
      return false
  }
}

function ruleMatches(rule: Rule, input: RuleInput): boolean {
  const conds = rule.conditions ?? []
  if (conds.length === 0) return false // a rule with no conditions never fires
  return rule.match_type === 'any'
    ? conds.some((c) => matchesCondition(c, input))
    : conds.every((c) => matchesCondition(c, input))
}

/**
 * Run active rules (in sort_order) against a transaction. Category is overwritten
 * by each matching rule that sets one (last wins); tags accumulate as a union.
 * `stop_after` halts evaluation once a rule matches.
 */
export function evaluateRules(rules: Rule[], input: RuleInput): RuleOutcome {
  const active = rules
    .filter((r) => r.is_active)
    .sort((a, b) => a.sort_order - b.sort_order)

  let categoryId: string | null = null
  const tagIds = new Set<string>()
  const matched: Rule[] = []

  for (const rule of active) {
    if (!ruleMatches(rule, input)) continue
    matched.push(rule)
    const { category_id, tag_ids } = rule.actions ?? {}
    if (category_id) categoryId = category_id
    for (const id of tag_ids ?? []) tagIds.add(id)
    if (rule.stop_after) break
  }

  return { categoryId, tagIds: [...tagIds], matched }
}
