import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { lockBodyScroll } from './scrollLock'

// The suite runs in the `node` environment, so stand up the one DOM bit the
// module touches rather than pulling in jsdom for three assertions.
const fakeDocument = { body: { style: { overflow: '' } } }

function overflow() {
  return fakeDocument.body.style.overflow
}

describe('lockBodyScroll', () => {
  beforeEach(() => {
    ;(globalThis as { document?: unknown }).document = fakeDocument
    fakeDocument.body.style.overflow = ''
  })

  afterAll(() => {
    delete (globalThis as { document?: unknown }).document
  })

  it('locks and restores page scrolling', () => {
    const release = lockBodyScroll()
    expect(overflow()).toBe('hidden')
    release()
    expect(overflow()).toBe('')
  })

  it('stays locked while an outer overlay still holds it', () => {
    const releaseModal = lockBodyScroll()
    const releaseConfirm = lockBodyScroll()

    // The confirm dialog closes; the form modal behind it is still open.
    releaseConfirm()
    expect(overflow()).toBe('hidden')

    releaseModal()
    expect(overflow()).toBe('')
  })

  it('ignores a release called twice', () => {
    const releaseModal = lockBodyScroll()
    const releaseConfirm = lockBodyScroll()

    releaseConfirm()
    releaseConfirm()
    expect(overflow()).toBe('hidden')

    releaseModal()
    expect(overflow()).toBe('')
  })
})
