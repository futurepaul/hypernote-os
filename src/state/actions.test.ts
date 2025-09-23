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

    expect(actions.set_profile.template).toMatchObject({
      kind: 1,
      content: '{{ form.editor }}',
    })
    expect(actions.set_profile.formUpdates).toMatchObject({ editor: '' })
    expect(actions.set_profile.stateUpdates).toMatchObject({ profile_target: 'payload.pubkey' })
  })

  it('supports actions with only mutations', () => {
    const actions = buildDocActionMap({
      reset_input: {
        forms: {
          pubkey: 'user.pubkey',
        },
      },
    })

    expect(actions.reset_input.template).toBeUndefined()
    expect(actions.reset_input.formUpdates).toMatchObject({ pubkey: 'user.pubkey' })
  })
})
