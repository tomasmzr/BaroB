import { describe, expect, it } from 'vitest'
import { amountToInput, formatAmountInput as f, parseAmount } from './format'

describe('formatAmountInput', () => {
  it('agrupa miles mientras se tipea', () => {
    let v = ''
    for (const ch of '1234567') v = f(v + ch)
    expect(v).toBe('$ 1.234.567')
  })
  it('coma y punto final como decimal', () => {
    expect(f('$ 1.234,5')).toBe('$ 1.234,5')
    expect(f('$ 1.234.')).toBe('$ 1.234,')
    expect(f('$ 1.234,567')).toBe('$ 1.234,56')
  })
  it('borra hasta vacío y sin negativos', () => {
    expect(f('$ ')).toBe('')
    expect(f('-500')).toBe('$ 500')
    expect(f('$ 1.23')).toBe('$ 123')
  })
  it('round-trip con parseAmount', () => {
    expect(parseAmount(f('$ 1.234.567,89'))).toBe(1234567.89)
    expect(parseAmount('$ 120.000')).toBe(120000)
    expect(parseAmount(amountToInput(45300.5))).toBe(45300.5)
    expect(parseAmount(amountToInput(-200))).toBe(200)
  })
})
