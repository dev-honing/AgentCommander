# 캐릭터 에셋 빌드 도구

Mixamo에서 받은 FBX 여러 개를 애니메이션 클립이 담긴 `.glb` 하나로 합친다.

블렌더를 창 없이 실행하므로 사람이 GUI를 만질 일이 없다. **GUI로 하면 슬롯·NLA 트랙·내보내기 모드가 서로 얽혀 매번 결과가 달라지는데, 이 도구는 결정적이다.** (그 과정에서 겪은 함정은 [`docs/블렌더-작업방법.md`](../docs/블렌더-작업방법.md)에 정리돼 있다.)

## 필요한 것

- **블렌더** — [blender.org](https://www.blender.org/download/)에서 설치. PATH에 없어도 표준 설치 경로를 자동으로 찾는다. 다른 곳에 있으면 `BLENDER` 환경변수로 지정한다.
- **Python 3.12** — 별도 패키지 없이 표준 라이브러리만 쓴다.

## 쓰는 법

```bash
python tools/asset.py add researcher "C:\Users\Ho\Downloads\Typing.fbx"
python tools/asset.py build researcher
```

`build`는 끝나고 자동으로 검증까지 한다. 문제가 있으면 exit 1로 끝난다.

| 명령 | 하는 일 |
|---|---|
| `list` | 역할별 FBX와 판별된 클립을 보여준다 |
| `add <역할> <fbx...>` | FBX를 에셋 폴더로 복사한다 |
| `build [역할...]` | glb를 만든다. `--all`로 전체, `--no-check`로 검증 생략 |
| `check [glb...]` | 만들어진 glb를 검증한다 |
| `clips` | 상태-클립 매핑 표를 보여준다 |

## 폴더 구조

```
tools/
  asset.py                    콘솔 프로그램 (진입점)
  fbx_to_glb.py               블렌더 안에서 도는 스크립트
  clips.json                  클립 판별 규칙
  assets/
    researcher/
      Breathing Idle.fbx      <- With Skin (몸통 포함)
      Typing.fbx
    coder/
      ...
                              ↓ build
backend/uploads/researcher.glb
```

FBX는 `tools/assets/`에, 결과 glb는 `backend/uploads/`에 들어간다. **둘 다 `.gitignore` 대상**이라 레포에 올라가지 않는다.

## 새 애니메이션 추가하기

[`clips.json`](./clips.json)에 항목만 넣으면 된다. 코드는 건드리지 않는다.

```json
{
  "clip": "Celebrate",
  "state": "done",
  "match": ["celebration", "victory"],
  "required": false
}
```

`match`는 FBX **파일명**에서 찾을 키워드다(소문자 부분 일치). 위에서부터 먼저 맞는 파일을 쓴다.

`clip` 값은 `frontend/lib/protocol.ts`의 `STATE_CLIP`과 맞춰야 화면에서 상태별로 재생된다. 다만 앱이 부분 일치까지 허용하고 못 찾으면 첫 클립으로 물러나므로, 정확히 맞지 않아도 화면이 깨지지는 않는다.

## Mixamo에서 받을 때

| 항목 | 값 |
|---|---|
| Format | `FBX Binary(.fbx)` |
| Skin | **한 파일만 `With Skin`, 나머지는 `Without Skin`** |
| Frames per Second | `30` |
| Keyframe Reduction | `none` |

**`Characters` 탭에서 캐릭터를 먼저 고르고** 애니메이션을 받아야 한다. 안 그러면 기본 마네킹에 적용된다.

⚠️ **앉는 동작은 피한다.** 씬에 책상·의자 소품이 없어서, 앉는 클립을 쓰면 캐릭터가 허공에 앉은 자세가 된다. **`Typing`과 `Writing` 둘 다 앉는 동작이다** — "일한다"는 개념이 Mixamo에서는 책상과 묶여 있다.

이름만으로는 알 수 없으므로 **검색 결과를 클릭해 미리보기가 재생될 때 서 있는지 눈으로 확인하고** 받는다.

작업 중인 느낌을 주는 서 있는 동작으로는 `Texting While Standing`, `Talking`, `Pointing` 등이 있다. 앉는 클립을 꼭 쓰고 싶다면 해당 존에 책상 소품을 함께 배치해야 한다.

`With Skin` 파일은 도구가 **파일 내용을 검사해** 자동으로 찾는다(크기로 어림잡지 않는다 — 애니메이션이 긴 `Without Skin` 파일이 더 커지는 경우가 있다).

## 검증에서 보는 것

`build`와 `check`가 출력하는 값들이다. **파일이 만들어졌다고 성공한 게 아니고, 클립 개수만 맞다고 성공한 것도 아니다.**

| 항목 | 기대값 | 어긋나면 |
|---|---|---|
| 루트 노드 | 1개 | 여분 아마튜어가 섞임 |
| 메시 | 1개 이상 | `With Skin` 파일이 빠짐 |
| 클립별 대상본 | 65 (Mixamo 표준) | 뼈대가 어긋남 |
| 클립별 키프레임 | 10 이상 | **이름만 있고 내용이 빈 클립** |

마지막 항목이 가장 잡기 어렵다. 블렌더 화면에서는 정상으로 보이는데 내보내면 껍데기만 나온다. 그래서 `build`가 끝나고 자동으로 확인한다.

## 앱에 반영

`backend/uploads/`에 두면 백엔드가 `/models/...`로 정적 서빙하므로 별도 등록이 필요 없다. DB의 `model_path`까지 갱신하려면 업로드 API를 쓴다.

```bash
curl -X POST http://localhost:8000/api/roles/researcher/model -H "x-api-key: local-dev-key" -F "file=@backend/uploads/researcher.glb"
```

앱은 **모델이 없거나 로딩에 실패하면 큐브로 되돌아간다.** 역할별로 따로 판단하므로 셋 중 하나만 준비돼도 그 역할만 캐릭터가 된다.
