import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import App from './App.vue'

vi.mock('vue-router', () => ({
  RouterView: {
    name: 'RouterView',
    template: '<div data-testid="router-view">Router View</div>'
  },
  useRoute: () => ({
    path: '/dashboards',
    params: {}
  }),
  useRouter: () => ({
    push: vi.fn()
  })
}))

describe('App', () => {
  it('renders router view', () => {
    const wrapper = mount(App, {
      global: {
        stubs: {
          RouterView: true,
          Sidebar: true
        }
      }
    })
    expect(wrapper.findComponent({ name: 'RouterView' }).exists()).toBe(true)
  })
})
