import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'

// Mock echarts/core before importing the composable
vi.mock('echarts/core', () => ({
  use: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
}))

import { connect, disconnect } from 'echarts/core'
import { provideCrosshairSync, useCrosshairSync } from './useCrosshairSync'

describe('useCrosshairSync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('provideCrosshairSync creates group ID with dashboard- prefix', () => {
    const Provider = defineComponent({
      setup() {
        const groupId = provideCrosshairSync('abc-123')
        return { groupId }
      },
      template: '<div />',
    })

    const wrapper = mount(Provider)
    expect(wrapper.vm.groupId).toBe('dashboard-abc-123')
  })

  it('provideCrosshairSync calls connect with the group ID', () => {
    const Provider = defineComponent({
      setup() {
        provideCrosshairSync('test-id')
      },
      template: '<div />',
    })

    mount(Provider)
    expect(connect).toHaveBeenCalledWith('dashboard-test-id')
  })

  it('useCrosshairSync returns groupId when inside a provider context', () => {
    let capturedGroupId: string | null = null

    const Child = defineComponent({
      setup() {
        const { groupId } = useCrosshairSync()
        capturedGroupId = groupId
      },
      template: '<div />',
    })

    const Parent = defineComponent({
      components: { Child },
      setup() {
        provideCrosshairSync('my-dash')
      },
      template: '<Child />',
    })

    mount(Parent)
    expect(capturedGroupId).toBe('dashboard-my-dash')
  })

  it('useCrosshairSync returns null when outside provider context', () => {
    let capturedGroupId: string | null = 'should-be-null'

    const Standalone = defineComponent({
      setup() {
        const { groupId } = useCrosshairSync()
        capturedGroupId = groupId
      },
      template: '<div />',
    })

    mount(Standalone)
    expect(capturedGroupId).toBeNull()
  })

  it('disconnect is called on component unmount', () => {
    const Provider = defineComponent({
      setup() {
        provideCrosshairSync('unmount-test')
      },
      template: '<div />',
    })

    const wrapper = mount(Provider)
    expect(disconnect).not.toHaveBeenCalled()

    wrapper.unmount()
    expect(disconnect).toHaveBeenCalledWith('dashboard-unmount-test')
  })
})
