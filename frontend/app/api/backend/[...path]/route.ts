/**
 * 백엔드 REST 프록시.
 *
 * 명세 9.3절은 로컬 단계부터 REST를 API Key로 잠그기로 했다. 그런데
 * 프론트는 브라우저에서 도는 SPA라, 키를 NEXT_PUBLIC_ 변수로 내려보내면
 * 페이지를 여는 누구나 키를 읽을 수 있어 인증이 무의미해진다.
 *
 * 그래서 브라우저는 같은 오리진의 이 라우트만 호출하고, 실제 키는 서버에서만
 * 읽어 백엔드로 전달한다. BACKEND_API_KEY 에는 NEXT_PUBLIC_ 접두사를 붙이지
 * 않는다 — 붙이는 순간 번들에 박혀 브라우저로 나간다.
 *
 * docs/SPEC-NOTES.md "REST 인증과 브라우저" 항목 참고.
 */

const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:8000'
const API_KEY = process.env.BACKEND_API_KEY ?? ''

async function forward(request: Request, path: string[]): Promise<Response> {
  const incoming = new URL(request.url)
  const target = new URL(`/api/${path.join('/')}`, BACKEND_URL)
  target.search = incoming.search

  const headers = new Headers()
  headers.set('x-api-key', API_KEY)
  const contentType = request.headers.get('content-type')
  if (contentType) headers.set('content-type', contentType)

  const hasBody = request.method !== 'GET' && request.method !== 'DELETE'

  let upstream: Response
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers,
      body: hasBody ? await request.arrayBuffer() : undefined,
      cache: 'no-store',
    })
  } catch {
    // 백엔드가 꺼져 있을 때 프론트가 500 대신 명확한 메시지를 받게 한다
    return Response.json(
      { detail: '백엔드에 연결할 수 없습니다. 서버가 실행 중인지 확인하세요.' },
      { status: 502 },
    )
  }

  // 204 등 본문 없는 응답은 body를 그대로 넘기면 안 된다
  if (upstream.status === 204 || upstream.status === 304) {
    return new Response(null, { status: upstream.status })
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'content-type': upstream.headers.get('content-type') ?? 'application/json',
    },
  })
}

type Ctx = { params: Promise<{ path: string[] }> }

export async function GET(request: Request, ctx: Ctx) {
  return forward(request, (await ctx.params).path)
}
export async function POST(request: Request, ctx: Ctx) {
  return forward(request, (await ctx.params).path)
}
export async function PATCH(request: Request, ctx: Ctx) {
  return forward(request, (await ctx.params).path)
}
export async function DELETE(request: Request, ctx: Ctx) {
  return forward(request, (await ctx.params).path)
}
