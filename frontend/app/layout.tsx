import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'AgentCommander',
  description: 'AI 서브에이전트를 3D 캐릭터로 시각화하고 관리하는 도구',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  )
}
