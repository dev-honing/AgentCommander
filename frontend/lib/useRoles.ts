'use client'

/**
 * 역할 정의를 한 번 읽어 role_id → model_path 로 들고 있는다.
 *
 * 역할은 자주 바뀌지 않으므로 실시간 스트림(WebSocket)이 아니라 REST로
 * 한 번만 읽는다. 새 역할을 추가했다면 새로고침하면 반영된다.
 */

import { useEffect, useState } from 'react'
import { fetchRoles } from './api'

export type RoleMap = Record<string, string>

export function useRoles(): RoleMap {
  const [roles, setRoles] = useState<RoleMap>({})

  useEffect(() => {
    let alive = true
    fetchRoles()
      .then((list) => {
        if (!alive) return
        const map: RoleMap = {}
        list.forEach((r) => (map[r.role_id] = r.model_path))
        setRoles(map)
      })
      .catch(() => {
        // 역할을 못 읽어도 씬은 떠야 한다 — 큐브 스텁으로 그려진다
      })
    return () => {
      alive = false
    }
  }, [])

  return roles
}
