import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import EmptyState from './EmptyState.vue'

const FakeIcon = {
  name: 'FakeIcon',
  render() {
    return h('svg', { class: 'fake-icon' })
  },
}

const RouterLinkStub = defineComponent({
  name: 'RouterLink',
  props: { to: { type: [String, Object], default: '' } },
  setup(_, { slots }) {
    return () => h('a', { href: '#' }, slots.default?.())
  },
})

describe('EmptyState', () => {
  it('renders icon, title, and description', () => {
    const wrapper = mount(EmptyState, {
      props: {
        icon: FakeIcon,
        title: 'No dashboards',
        description: 'Create your first dashboard to get started.',
      },
      global: {
        stubs: { RouterLink: RouterLinkStub },
      },
    })

    expect(wrapper.findComponent(FakeIcon).exists()).toBe(true)
    expect(wrapper.text()).toContain('No dashboards')
    expect(wrapper.text()).toContain('Create your first dashboard to get started.')
  })

  it('renders action button when actionLabel is provided', () => {
    const wrapper = mount(EmptyState, {
      props: {
        icon: FakeIcon,
        title: 'No dashboards',
        description: 'Create your first dashboard.',
        actionLabel: 'Create Dashboard',
        actionRoute: '/dashboards/new',
      },
      global: {
        stubs: { RouterLink: RouterLinkStub },
      },
    })

    expect(wrapper.text()).toContain('Create Dashboard')
  })

  it('does NOT render action button when actionLabel is omitted', () => {
    const wrapper = mount(EmptyState, {
      props: {
        icon: FakeIcon,
        title: 'No dashboards',
        description: 'Create your first dashboard.',
      },
      global: {
        stubs: { RouterLink: RouterLinkStub },
      },
    })

    // No button should be rendered
    const buttons = wrapper.findAll('button')
    const links = wrapper.findAll('a')
    expect(buttons.length + links.length).toBe(0)
  })

  it('renders secondary action button when secondaryActionLabel is provided', () => {
    const wrapper = mount(EmptyState, {
      props: {
        icon: FakeIcon,
        title: 'No dashboards',
        description: 'Create your first dashboard.',
        actionLabel: 'Create Dashboard',
        actionRoute: '/dashboards/new',
        secondaryActionLabel: 'Learn More',
        secondaryActionRoute: '/docs',
      },
      global: {
        stubs: { RouterLink: RouterLinkStub },
      },
    })

    expect(wrapper.text()).toContain('Learn More')
  })
})
