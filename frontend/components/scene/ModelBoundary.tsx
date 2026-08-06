'use client'

/**
 * glTF 로딩 실패를 삼키고 대체 컴포넌트를 그리는 경계.
 *
 * 모델 파일이 아직 없거나(에셋 준비 전), 경로가 틀렸거나, 파일이 깨졌을 때
 * 씬 전체가 죽지 않도록 막는다. 실패한 에이전트만 큐브 스텁으로 되돌아간다.
 *
 * react-three-fiber는 자체 reconciler를 쓰지만 React의 에러 경계 규약은
 * 그대로 따르므로 클래스 컴포넌트가 정상 동작한다.
 */

import { Component, type ReactNode } from 'react'

type Props = {
  children: ReactNode
  fallback: ReactNode
  /** 모델 경로가 바뀌면 다시 시도할 수 있도록 리셋 키를 받는다 */
  resetKey?: string
  onError?: (error: Error) => void
}

type State = { failed: boolean }

export class ModelBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidUpdate(prev: Props) {
    if (prev.resetKey !== this.props.resetKey && this.state.failed) {
      this.setState({ failed: false })
    }
  }

  componentDidCatch(error: Error) {
    this.props.onError?.(error)
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}
