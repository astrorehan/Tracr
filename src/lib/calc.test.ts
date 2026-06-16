import { describe, it, expect } from 'vitest'
import { evalExpression, isExpression } from './calc'

describe('evalExpression', () => {
  it('evaluates the four operators with correct precedence', () => {
    expect(evalExpression('12000+3500')).toBe(15500)
    expect(evalExpression('2+3*4')).toBe(14) // * before +
    expect(evalExpression('10/4')).toBe(2.5)
    expect(evalExpression('100-30-5')).toBe(65) // left-associative
  })

  it('honors parentheses and unary minus', () => {
    expect(evalExpression('(5+3)*1000')).toBe(8000)
    expect(evalExpression('2*-3')).toBe(-6)
    expect(evalExpression('-(4+1)')).toBe(-5)
  })

  it('treats a comma as a decimal point and ignores whitespace', () => {
    expect(evalExpression('1,5')).toBe(1.5)
    expect(evalExpression('  3 + 4 ')).toBe(7)
  })

  it('returns null on invalid or unsafe input', () => {
    expect(evalExpression('')).toBeNull()
    expect(evalExpression('abc')).toBeNull()
    expect(evalExpression('1+')).toBeNull()
    expect(evalExpression('(1+2')).toBeNull() // unbalanced
    expect(evalExpression('1+2)')).toBeNull() // trailing garbage
    expect(evalExpression('1/0')).toBeNull() // non-finite
  })
})

describe('isExpression', () => {
  it('detects operators that signal a calculation', () => {
    expect(isExpression('12000+3500')).toBe(true)
    expect(isExpression('2*3')).toBe(true)
    expect(isExpression('1-2')).toBe(true) // minus after position 0
  })

  it('treats plain and negative-leading numbers as non-expressions', () => {
    expect(isExpression('100')).toBe(false)
    expect(isExpression('1.234,5')).toBe(false) // grouped number, not math
    expect(isExpression('-5')).toBe(false) // leading sign only
  })
})
