import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generateInvitationCode } from '../src/services/invitation.service.js'

test('generateInvitationCode produce formato INV-XXXX-XXXX', () => {
  const code = generateInvitationCode()
  assert.match(code, /^INV-[A-F0-9]{4}-[A-F0-9]{4}$/)
})

test('generateInvitationCode genera códigos distintos', () => {
  const a = generateInvitationCode()
  const b = generateInvitationCode()
  assert.notEqual(a, b)
})

test('generateInvitationCode es solo alfanumérico en mayúsculas (bloques hex)', () => {
  const code = generateInvitationCode()
  const blocks = code.split('-')
  assert.equal(blocks.length, 3)
  assert.equal(blocks[0], 'INV')
  for (const b of blocks.slice(1)) {
    assert.ok(/^[0-9A-F]{4}$/.test(b))
  }
})
