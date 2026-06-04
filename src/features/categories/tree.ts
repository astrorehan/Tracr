import type { Category } from '@/types/db'

export interface CategoryNode {
  category: Category
  children: Category[]
}

/**
 * Group a flat category list into top-level nodes each holding their direct
 * children. A category whose parent isn't in the list (e.g. filtered out by
 * kind, or a promoted orphan) is treated as top-level so nothing is dropped.
 * Input order is preserved, so callers control sorting.
 */
export function groupByParent(categories: Category[]): CategoryNode[] {
  const ids = new Set(categories.map((c) => c.id))
  const childrenByParent = new Map<string, Category[]>()
  const tops: Category[] = []
  for (const c of categories) {
    if (c.parent_id && ids.has(c.parent_id)) {
      const arr = childrenByParent.get(c.parent_id) ?? []
      arr.push(c)
      childrenByParent.set(c.parent_id, arr)
    } else {
      tops.push(c)
    }
  }
  return tops.map((category) => ({ category, children: childrenByParent.get(category.id) ?? [] }))
}

/** Flatten into render order with depth — each parent immediately before its children. */
export function flattenWithDepth(categories: Category[]): { category: Category; depth: number }[] {
  const out: { category: Category; depth: number }[] = []
  for (const node of groupByParent(categories)) {
    out.push({ category: node.category, depth: 0 })
    for (const child of node.children) out.push({ category: child, depth: 1 })
  }
  return out
}
