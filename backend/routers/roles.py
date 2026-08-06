"""역할 및 glTF 모델 REST API (명세 9.1 / 9.2절).

역할을 코드에 고정하지 않고 API로 동적 관리한다. 캐릭터 모델(glTF 경로)
매핑이 역할 정의에 포함되므로, 새 역할을 추가하는 것이 곧 새 캐릭터를
등록하는 행위가 된다.
"""

from fastapi import APIRouter, Depends

from auth import verify_api_key

router = APIRouter(prefix="/api/roles", dependencies=[Depends(verify_api_key)])


# TODO(Phase 5): 엔드포인트 구현 (명세 9.2절 표)
#
#   GET    ""                    역할 목록
#   POST   ""                    생성 (role_id, display_name, model_path)
#   PATCH  "/{role_id}"          표시 이름 등 수정
#   POST   "/{role_id}/model"    glTF 업로드 (multipart, .glb/.gltf, 최대 20MB)
#                                → storage.get_storage().save() 로 저장하고
#                                  반환된 경로를 roles.model_path에 기록한다.
#                                  저장소 추상화 이유는 storage.py 참고 (10.6절).
#   DELETE "/{role_id}"          삭제
#                                ⚠️ 해당 역할을 쓰는 에이전트가 하나라도 있으면
#                                   FK 제약 위반(asyncpg ForeignKeyViolationError,
#                                   SQLSTATE 23503)이 난다. 이 에러를 그대로
#                                   노출하지 말고 409 Conflict +
#                                   "사용 중인 에이전트가 있습니다"로 감쌀 것
#                                   (9장 주의사항).
#
# 검증 규칙 (config.Settings에 값이 있음):
#   - 확장자: settings.allowed_model_ext (.glb / .gltf) 아니면 400
#   - 크기:   settings.max_model_size (20MB) 초과 시 413
