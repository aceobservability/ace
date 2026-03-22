import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import * as dashboardApi from '../api/dashboards'
import * as folderApi from '../api/folders'
import DashboardList from './DashboardList.vue'

const mockCurrentOrgId = ref<string | null>('org-1')
const mockCurrentOrg = ref({
  id: 'org-1',
  name: 'Acme',
  slug: 'acme',
  role: 'admin' as const,
  created_at: '2026-02-08T00:00:00Z',
  updated_at: '2026-02-08T00:00:00Z',
})
const mockPush = vi.fn()
const mockReplace = vi.fn()
const mockRoute = ref({
  query: {} as Record<string, unknown>,
})

vi.mock('vue-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
  }),
  useRoute: () => mockRoute.value,
}))

vi.mock('../composables/useOrganization', () => ({
  useOrganization: () => ({
    currentOrgId: mockCurrentOrgId,
    currentOrg: mockCurrentOrg,
  }),
}))

const mockToggleFavorite = vi.fn()
const mockIsFavorite = vi.fn().mockReturnValue(false)
const mockFavorites = ref<string[]>([])

vi.mock('../composables/useFavorites', () => ({
  useFavorites: () => ({
    favorites: mockFavorites,
    recentDashboards: ref([]),
    toggleFavorite: mockToggleFavorite,
    isFavorite: mockIsFavorite,
    addRecent: vi.fn(),
    _reset: vi.fn(),
  }),
}))

vi.mock('../api/dashboards')
vi.mock('../api/folders')

const mockDashboards = [
  {
    id: '123e4567-e89b-12d3-a456-426614174000',
    folder_id: 'folder-a',
    title: 'Test Dashboard',
    description: 'Test description',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
  {
    id: '223e4567-e89b-12d3-a456-426614174001',
    folder_id: null,
    title: 'Another Dashboard',
    created_at: '2024-01-02T00:00:00Z',
    updated_at: '2024-01-02T00:00:00Z',
  },
  {
    id: '323e4567-e89b-12d3-a456-426614174002',
    folder_id: 'missing-folder',
    title: 'Needs Reassignment',
    description: 'Folder was deleted',
    created_at: '2024-01-03T00:00:00Z',
    updated_at: '2024-01-03T00:00:00Z',
  },
]

const mockFolders = [
  {
    id: 'folder-a',
    organization_id: 'org-1',
    parent_id: null,
    name: 'Operations',
    sort_order: 0,
    created_by: 'user-1',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 'folder-b',
    organization_id: 'org-1',
    parent_id: null,
    name: 'Product',
    sort_order: 1,
    created_by: 'user-1',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
]

describe('DashboardList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCurrentOrgId.value = 'org-1'
    mockRoute.value = { query: {} }
    mockFavorites.value = []
    mockIsFavorite.mockReturnValue(false)
    mockCurrentOrg.value = {
      id: 'org-1',
      name: 'Acme',
      slug: 'acme',
      role: 'admin',
      created_at: '2026-02-08T00:00:00Z',
      updated_at: '2026-02-08T00:00:00Z',
    }
  })

  it('displays loading state initially', () => {
    vi.mocked(dashboardApi.listDashboards).mockImplementation(() => new Promise(() => {}))
    vi.mocked(folderApi.listFolders).mockImplementation(() => new Promise(() => {}))
    const wrapper = mount(DashboardList)
    expect(wrapper.text()).toContain('Loading')
  })

  it('renders dashboard cards (not a tree) after loading', async () => {
    vi.mocked(dashboardApi.listDashboards).mockResolvedValue(mockDashboards)
    vi.mocked(folderApi.listFolders).mockResolvedValue(mockFolders)

    const wrapper = mount(DashboardList)
    await flushPromises()

    const cards = wrapper.findAll('[data-testid^="dashboard-card-"]')
    expect(cards.length).toBe(3)

    // Verify card content
    expect(wrapper.text()).toContain('Test Dashboard')
    expect(wrapper.text()).toContain('Another Dashboard')
    expect(wrapper.text()).toContain('Needs Reassignment')
  })

  it('shows folder name on cards for dashboards in folders', async () => {
    vi.mocked(dashboardApi.listDashboards).mockResolvedValue(mockDashboards)
    vi.mocked(folderApi.listFolders).mockResolvedValue(mockFolders)

    const wrapper = mount(DashboardList)
    await flushPromises()

    const card = wrapper.get('[data-testid="dashboard-card-123e4567-e89b-12d3-a456-426614174000"]')
    expect(card.text()).toContain('Operations')
  })

  it('shows empty state when no dashboards and no folders', async () => {
    vi.mocked(dashboardApi.listDashboards).mockResolvedValue([])
    vi.mocked(folderApi.listFolders).mockResolvedValue([])

    const wrapper = mount(DashboardList)
    await flushPromises()

    expect(wrapper.text()).toContain('No dashboards yet')
  })

  it('renders empty state with Create Dashboard and Generate with AI buttons', async () => {
    vi.mocked(dashboardApi.listDashboards).mockResolvedValue([])
    vi.mocked(folderApi.listFolders).mockResolvedValue([])

    const wrapper = mount(DashboardList)
    await flushPromises()

    const buttons = wrapper.findAll('button')
    const createBtn = buttons.find((b) => b.text().includes('Create Dashboard'))
    const aiBtn = buttons.find((b) => b.text().includes('Generate with AI'))

    expect(createBtn).toBeDefined()
    expect(aiBtn).toBeDefined()
  })

  it('displays error state on fetch failure', async () => {
    vi.mocked(dashboardApi.listDashboards).mockRejectedValue(new Error('Network error'))
    vi.mocked(folderApi.listFolders).mockResolvedValue([])

    const wrapper = mount(DashboardList)
    await flushPromises()

    expect(wrapper.text()).toContain('Network error')
  })

  it('navigates to dashboard on card click', async () => {
    vi.mocked(dashboardApi.listDashboards).mockResolvedValue(mockDashboards)
    vi.mocked(folderApi.listFolders).mockResolvedValue(mockFolders)

    const wrapper = mount(DashboardList)
    await flushPromises()

    await wrapper
      .get('[data-testid="dashboard-card-123e4567-e89b-12d3-a456-426614174000"]')
      .trigger('click')

    expect(mockPush).toHaveBeenCalledWith('/app/dashboards/123e4567-e89b-12d3-a456-426614174000')
  })

  it('shows star icon on cards and calls toggleFavorite on click', async () => {
    vi.mocked(dashboardApi.listDashboards).mockResolvedValue(mockDashboards)
    vi.mocked(folderApi.listFolders).mockResolvedValue(mockFolders)

    const wrapper = mount(DashboardList)
    await flushPromises()

    const starBtn = wrapper.get('[data-testid="favorite-btn-123e4567-e89b-12d3-a456-426614174000"]')
    expect(starBtn.exists()).toBe(true)

    await starBtn.trigger('click')

    expect(mockToggleFavorite).toHaveBeenCalledWith('123e4567-e89b-12d3-a456-426614174000')
  })

  it('renders folder chips as filters', async () => {
    vi.mocked(dashboardApi.listDashboards).mockResolvedValue(mockDashboards)
    vi.mocked(folderApi.listFolders).mockResolvedValue(mockFolders)

    const wrapper = mount(DashboardList)
    await flushPromises()

    const chips = wrapper.findAll('[data-testid^="folder-chip-"]')
    expect(chips.length).toBeGreaterThanOrEqual(2)

    const chipTexts = chips.map((c) => c.text())
    expect(chipTexts).toContain('Operations')
    expect(chipTexts).toContain('Product')
  })

  it('filters dashboards by folder chip selection', async () => {
    vi.mocked(dashboardApi.listDashboards).mockResolvedValue(mockDashboards)
    vi.mocked(folderApi.listFolders).mockResolvedValue(mockFolders)

    const wrapper = mount(DashboardList)
    await flushPromises()

    // Click the Operations folder chip
    await wrapper.get('[data-testid="folder-chip-folder-a"]').trigger('click')

    // Only dashboards in folder-a should remain
    const cards = wrapper.findAll('[data-testid^="dashboard-card-"]')
    expect(cards.length).toBe(1)
    expect(cards[0].text()).toContain('Test Dashboard')
  })

  it('does not fetch dashboards when no organization is selected', async () => {
    mockCurrentOrgId.value = null

    const wrapper = mount(DashboardList)
    await flushPromises()

    expect(vi.mocked(dashboardApi.listDashboards)).not.toHaveBeenCalled()
    expect(vi.mocked(folderApi.listFolders)).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('No dashboards yet')
  })

  it('opens create modal when "Create Dashboard" empty state button is clicked', async () => {
    vi.mocked(dashboardApi.listDashboards).mockResolvedValue([])
    vi.mocked(folderApi.listFolders).mockResolvedValue([])

    const wrapper = mount(DashboardList)
    await flushPromises()

    const createBtn = wrapper.findAll('button').find((b) => b.text().includes('Create Dashboard'))
    await createBtn?.trigger('click')

    expect(wrapper.findComponent({ name: 'CreateDashboardModal' }).exists()).toBe(true)
  })

  it('disables dashboard drag for viewers', async () => {
    mockCurrentOrg.value = {
      ...mockCurrentOrg.value,
      role: 'viewer',
    }
    vi.mocked(dashboardApi.listDashboards).mockResolvedValue(mockDashboards)
    vi.mocked(folderApi.listFolders).mockResolvedValue(mockFolders)

    const wrapper = mount(DashboardList)
    await flushPromises()

    expect(
      wrapper
        .get('[data-testid="dashboard-card-123e4567-e89b-12d3-a456-426614174000"]')
        .attributes('draggable'),
    ).toBe('false')
  })

  it('moves dashboard to a different folder via drag and drop', async () => {
    vi.mocked(dashboardApi.listDashboards).mockResolvedValue(mockDashboards)
    vi.mocked(folderApi.listFolders).mockResolvedValue(mockFolders)
    vi.mocked(dashboardApi.updateDashboard).mockImplementation(async (id, data) => {
      const source = mockDashboards.find((dashboard) => dashboard.id === id)
      if (!source) {
        throw new Error('Dashboard not found')
      }

      return {
        ...source,
        folder_id: data.folder_id ?? null,
      }
    })

    const wrapper = mount(DashboardList)
    await flushPromises()

    await wrapper
      .get('[data-testid="dashboard-card-123e4567-e89b-12d3-a456-426614174000"]')
      .trigger('dragstart')
    await wrapper.get('[data-testid="folder-drop-folder-b"]').trigger('dragover')
    await wrapper.get('[data-testid="folder-drop-folder-b"]').trigger('drop')
    await flushPromises()

    expect(vi.mocked(dashboardApi.updateDashboard)).toHaveBeenCalledWith(
      '123e4567-e89b-12d3-a456-426614174000',
      {
        folder_id: 'folder-b',
      },
    )
  })

  it('rolls back dashboard move on drag-and-drop API failure', async () => {
    vi.mocked(dashboardApi.listDashboards).mockResolvedValue(mockDashboards)
    vi.mocked(folderApi.listFolders).mockResolvedValue(mockFolders)
    vi.mocked(dashboardApi.updateDashboard).mockRejectedValue(
      new Error('Not authorized to update this dashboard'),
    )

    const wrapper = mount(DashboardList)
    await flushPromises()

    await wrapper
      .get('[data-testid="dashboard-card-123e4567-e89b-12d3-a456-426614174000"]')
      .trigger('dragstart')
    await wrapper.get('[data-testid="folder-drop-folder-b"]').trigger('dragover')
    await wrapper.get('[data-testid="folder-drop-folder-b"]').trigger('drop')
    await flushPromises()

    // Dashboard should be rolled back to original folder
    const card = wrapper.get(
      '[data-testid="dashboard-card-123e4567-e89b-12d3-a456-426614174000"]',
    )
    expect(card.text()).toContain('Operations')
    expect(wrapper.text()).toContain('Not authorized to update this dashboard')
  })
})
