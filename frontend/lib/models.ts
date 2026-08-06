/**
 * glTF 모델 URL 조립 (명세 9.2 / 6.4절, docs/SPEC-NOTES.md 5번 항목).
 *
 * DB의 roles.model_path 는 '/models/researcher.glb' 형태의 **경로**다.
 * 그 경로를 그대로 useGLTF에 넘기면 Next.js(:3000) 기준으로 해석되어 404가 난다.
 * 실제 파일은 백엔드(:8000)가 StaticFiles로 서빙하므로 오리진을 붙여야 한다.
 *
 * 오리진 결합을 이 파일 한 곳에 모아 두면, AWS 전환 후 저장소가 S3로 바뀌어도
 * 고칠 곳이 여기뿐이다. DB에 저장된 값은 마이그레이션할 필요가 없다.
 */

function apiOrigin(): string {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api'
  return new URL(apiUrl).origin
}

/** roles.model_path 를 브라우저가 로드 가능한 절대 URL로 바꾼다. */
export function modelUrl(modelPath: string): string {
  if (modelPath.startsWith('http://') || modelPath.startsWith('https://')) {
    return modelPath // 이미 절대 URL이면 그대로 (Phase 7b S3 대비)
  }
  return `${apiOrigin()}${modelPath}`
}
