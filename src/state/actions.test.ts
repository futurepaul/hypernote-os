import { describe, it, expect } from 'bun:test'
import { buildDocActionMap } from './actions'

describe('buildDocActionMap', () => {
  it('extracts publish template and mutation blocks', () => {
    const actions = buildDocActionMap({
      set_profile: {
        kind: 1,
        content: '{{ form.editor }}',
        forms: {
          editor: '',
        },
        state: {
          profile_target: 'payload.pubkey',
        },
      },
    })

    const setProfile = actions.set_profile
    expect(setProfile).toBeDefined()
    expect(setProfile!.template).toMatchObject({
      kind: 1,
      content: '{{ form.editor }}',
    })
    expect(setProfile!.formUpdates).toMatchObject({ editor: '' })
    expect(setProfile!.stateUpdates).toMatchObject({ profile_target: 'payload.pubkey' })
  })

  it('supports actions with only mutations', () => {
    const actions = buildDocActionMap({
      reset_input: {
        forms: {
          pubkey: 'user.pubkey',
        },
      },
    })

    const resetInput = actions.reset_input
    expect(resetInput).toBeDefined()
    expect(resetInput!.template).toBeUndefined()
    expect(resetInput!.formUpdates).toMatchObject({ pubkey: 'user.pubkey' })
  })
})
