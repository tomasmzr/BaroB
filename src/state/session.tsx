import type { Session } from '@supabase/supabase-js'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import type { Group, Profile } from '../lib/types'

interface SessionCtx {
  session: Session | null
  loading: boolean
  userId: string | null
  profile: Profile | null
  groups: Group[]
  groupsLoading: boolean
  group: Group | null
  selectGroup: (id: string) => void
  refreshGroups: () => Promise<unknown>
}

const Ctx = createContext<SessionCtx | null>(null)
const GROUP_KEY = 'barob.group'

function readStored(): string | null {
  try {
    return localStorage.getItem(GROUP_KEY)
  } catch {
    return null
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [groupId, setGroupId] = useState<string | null>(readStored)
  const qc = useQueryClient()

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
      if (!s) qc.clear()
    })
    return () => data.subscription.unsubscribe()
  }, [qc])

  const userId = session?.user.id ?? null

  const profileQ = useQuery({
    queryKey: ['profile', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('id, display_name, email').eq('id', userId!).single()
      if (error) throw error
      return data as Profile
    },
  })

  const groupsQ = useQuery({
    queryKey: ['groups', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.from('groups').select('id, name, currency').order('created_at')
      if (error) throw error
      return data as Group[]
    },
  })

  const groups = useMemo(() => groupsQ.data ?? [], [groupsQ.data])
  const group = groups.find((g) => g.id === groupId) ?? groups[0] ?? null

  const selectGroup = useCallback((id: string) => {
    setGroupId(id)
    try {
      localStorage.setItem(GROUP_KEY, id)
    } catch {
      /* sin storage */
    }
  }, [])

  const value: SessionCtx = {
    session,
    loading,
    userId,
    profile: profileQ.data ?? null,
    groups,
    groupsLoading: !!userId && groupsQ.isLoading,
    group,
    selectGroup,
    refreshGroups: () => groupsQ.refetch(),
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useSession() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useSession fuera de SessionProvider')
  return v
}

/** Para pantallas que ya garantizan grupo seleccionado. */
export function useGroup() {
  const s = useSession()
  if (!s.group || !s.userId) throw new Error('sin grupo')
  return { ...s, group: s.group, userId: s.userId }
}
