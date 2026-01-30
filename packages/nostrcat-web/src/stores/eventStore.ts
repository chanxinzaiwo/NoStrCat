import { create } from 'zustand'

// Nostr 事件类型
interface NostrEvent {
  id: string
  pubkey: string
  kind: number
  content: string
  tags: string[][]
  created_at: number
  sig: string
}

// 用户资料缓存
interface ProfileCache {
  [pubkey: string]: {
    name?: string
    picture?: string
    about?: string
    nip05?: string
    fetchedAt: number
  }
}

interface EventState {
  // 事件缓存
  events: Map<string, NostrEvent>

  // 时间线事件 ID
  timelineIds: string[]

  // 用户资料缓存
  profiles: ProfileCache

  // 加载状态
  isLoading: boolean
  error: string | null

  // 方法
  addEvent: (event: NostrEvent) => void
  addEvents: (events: NostrEvent[]) => void
  setTimeline: (ids: string[]) => void
  appendTimeline: (ids: string[]) => void
  setProfile: (pubkey: string, profile: ProfileCache[string]) => void
  getEvent: (id: string) => NostrEvent | undefined
  getProfile: (pubkey: string) => ProfileCache[string] | undefined
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  clear: () => void
}

export const useEventStore = create<EventState>((set, get) => ({
  events: new Map(),
  timelineIds: [],
  profiles: {},
  isLoading: false,
  error: null,

  addEvent: (event: NostrEvent) => {
    const { events } = get()
    const newEvents = new Map(events)
    newEvents.set(event.id, event)
    set({ events: newEvents })
  },

  addEvents: (newEvents: NostrEvent[]) => {
    const { events } = get()
    const updatedEvents = new Map(events)
    newEvents.forEach(event => {
      updatedEvents.set(event.id, event)
    })
    set({ events: updatedEvents })
  },

  setTimeline: (ids: string[]) => {
    set({ timelineIds: ids })
  },

  appendTimeline: (ids: string[]) => {
    const { timelineIds } = get()
    const newIds = ids.filter(id => !timelineIds.includes(id))
    set({ timelineIds: [...timelineIds, ...newIds] })
  },

  setProfile: (pubkey: string, profile: ProfileCache[string]) => {
    const { profiles } = get()
    set({
      profiles: {
        ...profiles,
        [pubkey]: { ...profile, fetchedAt: Date.now() },
      },
    })
  },

  getEvent: (id: string) => {
    return get().events.get(id)
  },

  getProfile: (pubkey: string) => {
    return get().profiles[pubkey]
  },

  setLoading: (isLoading: boolean) => {
    set({ isLoading })
  },

  setError: (error: string | null) => {
    set({ error })
  },

  clear: () => {
    set({
      events: new Map(),
      timelineIds: [],
      profiles: {},
      isLoading: false,
      error: null,
    })
  },
}))
