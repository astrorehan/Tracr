import { describe, it, expect } from 'vitest'
import { toMinorUnits, amountToMinor, fromMinorUnits, signedAmount } from './money'

describe('toMinorUnits', () => {
  it('scales by the currency decimals', () => {
    expect(toMinorUnits('12.34', 'USD')).toBe(1234)
    expect(toMinorUnits('1234.56', 'USD')).toBe(123456)
    expect(toMinorUnits('1000', 'IDR')).toBe(1000) // 0 decimals
    expect(toMinorUnits('0.00000001', 'BTC')).toBe(1) // 8 decimals
  })

  it('accepts numeric input', () => {
    expect(toMinorUnits(12.34, 'USD')).toBe(1234)
    expect(toMinorUnits(1000, 'IDR')).toBe(1000)
  })

  it('strips currency symbols and whitespace', () => {
    expect(toMinorUnits('$12.34', 'USD')).toBe(1234)
    expect(toMinorUnits('  12.34  ', 'USD')).toBe(1234)
  })

  it('handles grouped numbers where the last separator is the decimal', () => {
    expect(toMinorUnits('1.234,5', 'USD')).toBe(123450) // EU style: , is decimal
    expect(toMinorUnits('1,234.50', 'USD')).toBe(123450) // US style: , is grouping
    expect(toMinorUnits('12,5', 'USD')).toBe(1250) // lone comma = decimal
  })

  it('returns 0 for non-numeric / empty input', () => {
    expect(toMinorUnits('', 'USD')).toBe(0)
    expect(toMinorUnits('abc', 'USD')).toBe(0)
  })
})

describe('amountToMinor', () => {
  it('evaluates arithmetic expressions as major units', () => {
    expect(amountToMinor('12000+3500', 'USD')).toBe(1550000) // 15500.00
    expect(amountToMinor('100*3', 'USD')).toBe(30000) // 300.00
    expect(amountToMinor('5-2', 'USD')).toBe(300) // 3.00
    expect(amountToMinor('12000+3500', 'IDR')).toBe(15500) // 0 decimals
  })

  it('falls back to flexible parsing for plain grouped numbers', () => {
    expect(amountToMinor('1.234,5', 'USD')).toBe(123450)
    expect(amountToMinor('1234.56', 'USD')).toBe(123456)
  })

  it('falls back to plain parsing when an expression is invalid', () => {
    expect(amountToMinor('12.34', 'USD')).toBe(1234)
  })
})

describe('fromMinorUnits', () => {
  it('is the inverse of toMinorUnits', () => {
    expect(fromMinorUnits(123456, 'USD')).toBe(1234.56)
    expect(fromMinorUnits(1000, 'IDR')).toBe(1000)
    expect(fromMinorUnits(1, 'BTC')).toBe(0.00000001)
  })
})

describe('signedAmount', () => {
  it('credits income and debits expense/transfer', () => {
    expect(signedAmount('income', 5000)).toBe(5000)
    expect(signedAmount('expense', 5000)).toBe(-5000)
    expect(signedAmount('transfer', 5000)).toBe(-5000)
  })
})
