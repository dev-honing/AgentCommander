/**
 * 개발 서버에 접근을 허용할 호스트 (Phase 7a).
 *
 * Next dev 서버는 다른 호스트에서 오는 /_next/* 요청을 기본으로 막는다.
 * 터널로 열면 JS 청크가 전부 차단되어 화면이 껍데기만 뜨는데, 콘솔에는
 * 아무 것도 안 나오고 서버 로그에만 경고가 찍혀서 원인을 찾기 어렵다.
 *
 * 호스트 이름을 코드에 박지 않는다 — 사람마다 터널 주소가 다르다.
 * frontend/.env.local 에 ALLOWED_DEV_ORIGINS 로 넣는다 (쉼표로 여러 개).
 *
 * ⚠️ 개발 서버에만 해당한다. next build 결과물에는 이 제약이 없다.
 */
const allowedDevOrigins = (process.env.ALLOWED_DEV_ORIGINS ?? '')
  .split(',')
  .map((h) => h.trim())
  .filter(Boolean)

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // three.js는 ESM으로 배포되므로 서버 컴포넌트 번들링에서 제외한다.
  // 이 설정이 없으면 빌드 시 "Cannot use import statement outside a module" 류의
  // 오류가 나기 쉽다.
  transpilePackages: ['three'],

  ...(allowedDevOrigins.length > 0 && { allowedDevOrigins }),
}

export default nextConfig
