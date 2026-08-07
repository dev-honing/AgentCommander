# AgentCommander

> AI 서브에이전트를 메타버스형 3D 캐릭터로 시각화하고 관리·모니터링하는 오픈소스 도구

[![CI](https://github.com/OWNER/AgentCommander/actions/workflows/ci.yml/badge.svg)](https://github.com/OWNER/AgentCommander/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

---

## 왜 만드나

AI 에이전트를 여러 개 동시에 굴리기 시작하면, 곧바로 같은 문제에 부딪힌다.

**지금 저것들이 각자 뭘 하고 있는지 알 수가 없다.**

터미널 로그는 여러 에이전트의 출력이 뒤섞여 흘러가고, 어떤 에이전트가 멈춰 있는지 · 재시도 중인지 · 조용히 실패했는지 한눈에 들어오지 않는다. 로그를 스크롤해서 되짚는 일은 에이전트가 5개만 넘어가도 사실상 불가능해진다.

AgentCommander는 각 서브에이전트를 3D 공간의 **캐릭터**로 표현한다. 상태(idle / running / waiting / retrying / error / done)는 캐릭터의 애니메이션과 위치로 드러나고, 클릭하면 대화풍선으로 지금 하는 일을 말한다. 전체 이력은 DB에 남아 나중에 복기할 수 있다.

- 한 화면에서 5~20개 에이전트의 상태를 동시에 파악
- 재시도(retrying)와 정상 진행(running)을 시각적으로 구분 — 조용한 실패를 놓치지 않도록
- 모든 상태 전이를 append-only 로그로 영속화 → 사후 복기 가능

## 비슷해 보이는 프로젝트와 무엇이 다른가

컨셉이 겹쳐 보이는 오픈소스가 둘 있다. 먼저 짚어 둔다.

| | [Pixel Agents](https://github.com/pablodelucca/pixel-agents) | [SkyOffice](https://github.com/kevinshen56714/SkyOffice) | AgentCommander |
|---|---|---|---|
| 형태 | VS Code 확장 + 단독 CLI | 독립 웹앱 (가상 오피스) | 독립 웹앱 (배포형) |
| 하는 일 | 이미 돌고 있는 에이전트를 **관찰·시각화** | **사람** 아바타 기반 화상협업 | 에이전트를 **직접 오케스트레이션**하고 상태를 시각화 |
| 제어 | 관찰만 — 에이전트 생성이나 재시도 정책 설정 불가 | 해당 없음 (사람이 조작) | REST로 생성·역할 관리·재시도 정책까지 |
| 이력 | — | — | 상태 전이를 DB에 append-only 로 보관, 사후 복기 |
| 기술 | React + Canvas 2D, Fastify | Phaser 3 + Colyseus + PeerJS | Next.js + react-three-fiber + FastAPI + PostgreSQL + LangGraph |
| 라이선스 | MIT | MIT | MIT |

**Pixel Agents는 관찰자(observer), AgentCommander는 오케스트레이터(orchestrator)다.** Pixel Agents는 Claude Code 같은 기존 도구가 만든 활동을 들여다보는 창이고, 이 프로젝트는 LangGraph로 에이전트를 직접 만들고 실패·재시도 정책까지 통제한 뒤 그 결과를 보여준다. 무엇을 볼 것인가가 아니라 무엇을 시킬 것인가에서 갈린다.

**SkyOffice는 사람이 모이는 공간이다.** 에이전트 개념이 없다. 다만 타일맵 기반 픽셀아트 오피스 UI는 좋은 선례라 참고 대상으로 남겨 둔다.

## 데모

> 🚧 Phase 2~4 완료 시 스크린샷 / GIF 삽입 예정
>
> `docs/media/demo.gif`

## 빠른 시작

```bash
docker compose up -d db
```

```bash
cd backend && pip install -r requirements.txt && alembic upgrade head && uvicorn main:app --reload --port 8000
```

프론트엔드는 별도로 실행한다.

```bash
cd frontend && npm install && npm run dev
```

- 프론트엔드: http://localhost:3000
- 백엔드 API 문서: http://localhost:8000/docs
- WebSocket: ws://localhost:8000/ws

> 처음 실행 전에 `backend/.env.example` → `backend/.env`, `frontend/.env.local.example` → `frontend/.env.local` 로 복사하고 값을 채운다. 자세한 절차는 [CONTRIBUTING.md](./CONTRIBUTING.md) 참고.

## 아키텍처

백엔드와 프론트엔드는 별개 프로세스이며 WebSocket으로만 실시간 통신한다. 설정성 작업(에이전트/역할 생성·삭제)은 REST API로 분리되어 있다.

```
[FastAPI : 8000]                            [Next.js : 3000]
  ├─ Orchestrator (목업 → LangGraph)
  ├─ WebSocket Hub  ── ws://localhost:8000/ws ──►  useAgents() 훅
  ├─ REST API (/api, API Key 인증)                    │
  └─ Persistence (PostgreSQL)                  react-three-fiber Scene
                                                 ├─ 캐릭터 (rigged glTF)
                                                 ├─ 클릭 상호작용
                                                 └─ 대화풍선 (<Html> 오버레이)
```

핵심 설계 원칙 — **WebSocket 메시지 스키마를 먼저 고정한다.** 목업 오케스트레이터를 나중에 LangGraph로 교체할 때 이 경계만 바뀌고 프론트엔드는 그대로 유지되어야 한다.

| 레이어 | 기술 |
|---|---|
| 백엔드 | Python 3.12, FastAPI, asyncpg |
| DB | PostgreSQL 16 (Alembic 마이그레이션) |
| 프론트엔드 | Next.js 16 (App Router), React 19, TypeScript 5, Node 24 |
| 3D | react-three-fiber 9, @react-three/drei 10, three.js |
| 오케스트레이션 | LangGraph (Phase 6부터) |
| LLM | Anthropic / OpenAI (어댑터로 추상화) |

## 로드맵

| Phase | 목표 | 완료 기준 | 상태 |
|---|---|---|---|
| 0 | 백엔드 목업 + WebSocket 배관 | 더미 상태가 2초마다 프론트에 도달 | ✅ |
| 1 | PostgreSQL 영속성 (로컬 Docker) | 서버 재시작 후에도 `agent_logs`로 이력 복기 | ✅ |
| 2 | 3D 씬 + 큐브 스텁 | 상태값에 따라 큐브 색상이 실시간 변경 | ✅ |
| 3 | 캐릭터 교체 | 역할별 캐릭터 + 상태별 전환 | ✅ 도트로 확정 |
| 4 | 클릭 상호작용 + 대화풍선 | 클릭 시 `agent_speak` 응답이 말풍선으로 표시 | ✅ |
| 5 | 상태 패널 UI | 목록, progress bar, 로그 뷰어 | ✅ |
| 6 | LangGraph 연동 | 목업 루프를 실제 오케스트레이션으로 교체 | 🟡 진행 중 |
| 7a | 로컬 상시 가동 (임시) | Tunnel로 개발 중 외부 접근 확인 | ✅ |
| 7b | AWS 전환 | EC2/RDS 이전 | ⬜ |

**Phase 3** — 도트와 리깅 캐릭터 두 방향을 모두 만들어 비교한 뒤 **도트로 확정했다.** 명세 10.1절이 조건으로 걸어 둔 20개 동시 렌더링 측정 결과는 최저 fps 기준 큐브 100 / 도트 98 / 리깅 73이다. 셋 다 통과지만, 서브에이전트 수가 늘어나는 방향이라 20개에서 이미 27을 내주는 표현은 감당하기 어렵다고 봤다. 리깅 경로는 `?avatar=character` 로 남아 있다 — [에셋 방향 비교](./docs/에셋-방향-비교.md) 참고.

**Phase 7a** — Tailscale Funnel로 열어 확인을 마쳤다. 명세 8.1절이 요구한 "환경변수만 갈아끼우면 되는 구조"가 실제로 성립했다. 절차와 함정은 [외부 공개](./docs/외부-공개.md) 참고. 임시 공개이므로 확인이 끝나면 닫는다.

**WebSocket 인증**은 7b 계획이었으나 7a(외부 공개) 이전에 앞당겨 적용했다. 그 사이 "설정은 막혔는데 실시간 상태는 누구나 보는" 구간이 생기기 때문이다 — 방식은 [명세 해석 노트](./docs/SPEC-NOTES.md)의 "WebSocket 인증 방식" 참고.

## 문서

- [설계 명세서](./docs/subagent-viz-design-spec.docx) — 전체 설계 원본 (11장)
- [명세 해석 노트](./docs/SPEC-NOTES.md) — 명세 내 불일치와 구현 시 채택한 해석
- [UI 목업](./docs/mockups/) — 예상 화면 10장. 브라우저로 바로 열리는 단일 HTML
- [Phase 6 초안](./docs/PHASE6-초안.md) — 목업을 LangGraph로 교체하는 계획 (논의용)
- [캐릭터 에셋 빌드 도구](./tools/README.md) — FBX를 glb로 합치는 콘솔 프로그램
- [외부 공개](./docs/외부-공개.md) — 터널로 임시 공개하는 절차와 빠지기 쉬운 함정
- [블렌더 작업 방법](./docs/블렌더-작업방법.md) — 위 도구가 자동화한 절차의 수동 버전(문제 해결용)
- [기여 가이드](./CONTRIBUTING.md)

## 기여

기여를 환영한다. 3D나 백엔드 지식 없이도 시작할 수 있는 항목은 `good first issue` 라벨로 정리해 둔다 — 캐릭터 애니메이션 클립 추가, 새 역할(role) 프리셋 추가, 상태 패널 UI 개선 등.

## 라이선스

[MIT](./LICENSE)
