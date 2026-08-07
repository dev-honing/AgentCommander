'use client'

/**
 * 역할 정의를 한 번 읽어 role_id → model_path 로 들고 있는다.
 *
 * 역할은 자주 바뀌지 않으므로 실시간 스트림(WebSocket)이 아니라 REST로
 * 한 번만 읽는다. 새 역할을 추가했다면 새로고침하면 반영된다.
 *
 * ⚠️ 등록된 model_path 는 있는데 파일이 아직 없을 수 있다. 초기 마이그레이션이
 *    역할 3종을 시드하면서 경로도 함께 넣기 때문이다(에셋은 각자 만든다).
 *    그대로 두면 캐릭터를 그리려다 404가 나고, 에러 경계가 잡아 큐브로
 *    되돌아가긴 하지만 개발 중 에러 오버레이가 계속 뜬다.
 *    그래서 실제로 받을 수 있는 모델만 골라 돌려준다.
 */

import { useEffect, useState } from 'react'
import { fetchRoles } from './api'
import { modelUrl } from './models'

export type RoleMap = Record<string, string>

async function isReachable(path: string): Promise<boolean> {
  try {
    const res = await fetch(modelUrl(path), { method: 'HEAD', cache: 'no-store' })
    return res.ok
  } catch {
    return false
  }
}

export function useRoles(): RoleMap {
  const [roles, setRoles] = useState<RoleMap>({})

  useEffect(() => {
    let alive = true

    async function load() {
      const list = await fetchRoles()
      const checked = await Promise.all(
        list.map(async (r) => [r.role_id, r.model_path, await isReachable(r.model_path)] as const),
      )
      if (!alive) return

      const map: RoleMap = {}
      checked.forEach(([roleId, path, ok]) => {
        if (ok) map[roleId] = path
      })
      setRoles(map)
    }

    load().catch(() => {
      // 역할을 못 읽어도 씬은 떠야 한다 — 전부 큐브 스텁으로 그려진다
    })

    return () => {
      alive = false
    }
  }, [])

  return roles
}
