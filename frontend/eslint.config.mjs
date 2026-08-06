// Next.js 16에서 `next lint`가 제거되어 ESLint CLI + flat config로 전환했다.
// eslint-config-next는 flat config 배열을 그대로 내보낸다.
//
// ⚠️ ESLint는 9.x로 고정한다. 10.x는 eslint-config-next가 번들한
//    eslint-plugin-react와 아직 호환되지 않아 룰 로딩 단계에서 죽는다.

import next from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

const config = [
  {
    ignores: ['.next/**', 'out/**', 'node_modules/**', 'next-env.d.ts'],
  },
  ...next,
  ...nextTs,
  {
    rules: {
      // 밑줄로 시작하는 인자는 "아직 안 쓴다"는 의도적 표시로 취급한다.
      // Phase별 자리표시 컴포넌트가 _props를 받는 형태라 필요하다.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
]

export default config
