/**
 * 3D 씬 안의 DOM 오버레이(drei `<Html>`) 깊이.
 *
 * drei의 `<Html>`은 기본 zIndexRange가 [16777271, 0]이라, 그냥 두면 씬 안의
 * 이름표·말풍선이 화면 위의 패널·토스트를 전부 뚫고 올라온다. 실제로
 * 상세 패널을 열었을 때 캐릭터 이름표가 패널 위에 겹쳐 보였다.
 *
 * 씬 오버레이는 UI보다 항상 아래에 있어야 하므로 한 자릿수로 묶는다.
 * globals.css 의 UI 레이어와 함께 봐야 한다:
 *
 *   .hud    10
 *   .panel  20
 *   .toast  30
 */

/** 존 라벨 — 바닥에 붙은 표시라 가장 아래 */
export const Z_ZONE_LABEL: [number, number] = [2, 0]

/** 캐릭터 이름표 */
export const Z_NAMETAG: [number, number] = [3, 0]

/** 대화풍선 — 이름표보다는 위, UI보다는 아래 */
export const Z_BUBBLE: [number, number] = [5, 0]
