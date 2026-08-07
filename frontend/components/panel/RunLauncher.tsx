'use client'

/**
 * 리서치 실행 입력창 (Phase 6c).
 *
 * 질문을 넣으면 에이전트 여러 개가 갈라져 나와 조사·검증·정리를 한다.
 * 실행 자체는 REST로 접수만 하고, 생겨나는 에이전트는 WebSocket을 통해
 * 3D 씬에 저절로 나타난다 — 이 컴포넌트가 결과를 기다릴 필요가 없다.
 */

import { useCallback, useState } from 'react'
import { createRun } from '@/lib/api'

const EXAMPLES = [
  'AgentCommander 같은 도구의 경쟁 제품은?',
  'LangGraph 와 CrewAI 의 차이는?',
  '3D 웹에서 캐릭터를 다루는 방법은?',
]

type Status =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'sent'; runId: string; count: number }
  | { kind: 'failed'; message: string }

export function RunLauncher() {
  const [question, setQuestion] = useState('')
  const [status, setStatus] = useState<Status>({ kind: 'idle' })

  const submit = useCallback(async () => {
    const text = question.trim()
    if (!text || status.kind === 'sending') return

    setStatus({ kind: 'sending' })
    try {
      const run = await createRun(text)
      setStatus({ kind: 'sent', runId: run.run_id, count: run.agents.length })
      setQuestion('')
    } catch (e) {
      setStatus({ kind: 'failed', message: e instanceof Error ? e.message : '실행에 실패했습니다' })
    }
  }, [question, status.kind])

  return (
    <div className="launcher">
      <form
        className="launcher-row"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <span className="launcher-caret">›</span>
        <input
          className="launcher-input"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="질문을 입력하면 에이전트가 조사를 시작합니다"
          aria-label="리서치 질문"
          maxLength={500}
          disabled={status.kind === 'sending'}
        />
        <button
          type="submit"
          className="launcher-go"
          disabled={!question.trim() || status.kind === 'sending'}
        >
          {status.kind === 'sending' ? '보내는 중' : '실행'}
        </button>
      </form>

      {status.kind === 'idle' && !question && (
        <div className="launcher-examples">
          {EXAMPLES.map((ex) => (
            <button key={ex} type="button" className="launcher-chip" onClick={() => setQuestion(ex)}>
              {ex}
            </button>
          ))}
        </div>
      )}

      {status.kind === 'sent' && (
        <div className="launcher-note">
          {status.runId} 시작 — 에이전트 {status.count}개가 씬에 나타납니다
        </div>
      )}

      {status.kind === 'failed' && <div className="launcher-note launcher-error">{status.message}</div>}
    </div>
  )
}
