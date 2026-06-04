/**
 * Safe arithmetic evaluator for the amount "calculator" — lets users type
 * `12000+3500` or `(5+3)*1000` in an amount field. Recursive-descent parser over
 * + - * / and parentheses; never uses eval(). Returns null on invalid input.
 * Comma is treated as a decimal separator (no thousands grouping in expressions).
 */
export function evalExpression(raw: string): number | null {
  if (!raw) return null
  const s = raw.replace(/\s+/g, '').replace(/,/g, '.')
  if (!/^[0-9.+\-*/()]+$/.test(s)) return null

  let i = 0
  const peek = () => s[i]

  function parseExpr(): number {
    let v = parseTerm()
    while (peek() === '+' || peek() === '-') {
      const op = s[i++]
      const r = parseTerm()
      v = op === '+' ? v + r : v - r
    }
    return v
  }

  function parseTerm(): number {
    let v = parseFactor()
    while (peek() === '*' || peek() === '/') {
      const op = s[i++]
      const r = parseFactor()
      v = op === '*' ? v * r : v / r
    }
    return v
  }

  function parseFactor(): number {
    if (peek() === '+') {
      i++
      return parseFactor()
    }
    if (peek() === '-') {
      i++
      return -parseFactor()
    }
    if (peek() === '(') {
      i++
      const v = parseExpr()
      if (peek() !== ')') throw new Error('unbalanced')
      i++
      return v
    }
    let num = ''
    while (i < s.length && /[0-9.]/.test(s[i])) num += s[i++]
    if (num === '' || num === '.') throw new Error('number')
    const n = parseFloat(num)
    if (!Number.isFinite(n)) throw new Error('nan')
    return n
  }

  try {
    const v = parseExpr()
    if (i !== s.length) return null // trailing garbage
    return Number.isFinite(v) ? v : null
  } catch {
    return null
  }
}

/** True when the input looks like an arithmetic expression (has an operator). */
export function isExpression(input: string): boolean {
  const t = input.trim()
  return /[+*/]/.test(t) || t.indexOf('-', 1) > 0
}
