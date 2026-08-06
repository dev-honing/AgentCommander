/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // three.js는 ESM으로 배포되므로 서버 컴포넌트 번들링에서 제외한다.
  // 이 설정이 없으면 빌드 시 "Cannot use import statement outside a module" 류의
  // 오류가 나기 쉽다.
  transpilePackages: ['three'],
}

export default nextConfig
