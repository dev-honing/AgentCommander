"""Mixamo FBX 여러 개를 애니메이션 클립이 담긴 glb 하나로 합친다.

블렌더를 창 없이 실행해 쓴다. GUI로 하면 슬롯·NLA 트랙·내보내기 모드가
서로 얽혀 매번 결과가 달라지는데, API로 하면 결정적이다.

사용법 (레포 루트에서):

    python tools/build_character.py researcher

또는 블렌더를 직접 부를 때:

    blender --background --python tools/fbx_to_glb.py -- \
        --skin "Breathing Idle.fbx" \
        --anim Idle="Breathing Idle.fbx" \
        --anim Working=Typing.fbx \
        --out backend/uploads/researcher.glb

--skin 은 With Skin으로 받은 파일(몸통 포함) 하나.
--anim 은 클립이름=파일경로 형태로 여러 번.
"""

import argparse
import sys
from pathlib import Path

import bpy


def parse_args() -> argparse.Namespace:
    # 블렌더는 "--" 뒤의 인자를 스크립트에 넘긴다
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--skin", required=True, help="With Skin FBX (몸통 포함)")
    p.add_argument(
        "--anim",
        action="append",
        default=[],
        metavar="클립이름=파일경로",
        help="클립 이름과 FBX 경로. 여러 번 지정 가능",
    )
    p.add_argument("--out", required=True, help="출력 .glb 경로")
    return p.parse_args(argv)


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()
    # Import가 남긴 고아 데이터까지 비운다. 안 그러면 이전 실행의 액션이
    # 파일에 남아 내보내기에 섞여 들어간다.
    for coll in (bpy.data.actions, bpy.data.armatures, bpy.data.meshes, bpy.data.objects):
        for item in list(coll):
            coll.remove(item)


def import_fbx(path: Path) -> set:
    """FBX를 가져오고 새로 생긴 오브젝트 집합을 돌려준다."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=str(path))
    return set(bpy.data.objects) - before


def find_armature(objects) -> bpy.types.Object | None:
    for obj in objects:
        if obj.type == "ARMATURE":
            return obj
    return None


def action_of(armature: bpy.types.Object):
    """아마튜어에 물려 있는 액션과 슬롯을 돌려준다."""
    ad = armature.animation_data
    if ad is None or ad.action is None:
        return None, None
    slot = getattr(ad, "action_slot", None)
    return ad.action, slot


def frame_range(action) -> tuple[float, float]:
    return tuple(action.frame_range)


def main() -> None:
    args = parse_args()
    out_path = Path(args.out).resolve()
    out_path.parent.mkdir(parents=True, exist_ok=True)

    clear_scene()

    # 1) 몸통이 있는 FBX를 먼저 가져온다. 이 아마튜어가 최종 결과물이 된다.
    skin_objs = import_fbx(Path(args.skin).resolve())
    target = find_armature(skin_objs)
    if target is None:
        sys.exit(f"[오류] {args.skin} 에 아마튜어가 없습니다")

    meshes = [o for o in skin_objs if o.type == "MESH"]
    if not meshes:
        sys.exit(f"[오류] {args.skin} 에 메시가 없습니다. With Skin으로 받았는지 확인하세요")

    print(f"[skin] {target.name}  본 {len(target.data.bones)}개, 메시 {len(meshes)}개")

    # target 자신의 액션도 클립 후보다
    own_action, own_slot = action_of(target)

    # 2) 클립별로 액션을 모은다
    collected: list[tuple[str, object, object]] = []  # (클립이름, 액션, 슬롯)

    for spec in args.anim:
        if "=" not in spec:
            sys.exit(f"[오류] --anim 형식이 잘못됨: {spec} (클립이름=파일경로)")
        clip_name, _, fbx = spec.partition("=")
        fbx_path = Path(fbx).resolve()

        if fbx_path == Path(args.skin).resolve():
            # 몸통 파일 자신의 애니메이션
            action, slot = own_action, own_slot
            if action is None:
                sys.exit(f"[오류] {fbx} 에 애니메이션이 없습니다")
        else:
            new_objs = import_fbx(fbx_path)
            extra = find_armature(new_objs)
            if extra is None:
                sys.exit(f"[오류] {fbx} 에 아마튜어가 없습니다")
            action, slot = action_of(extra)
            if action is None:
                sys.exit(f"[오류] {fbx} 에 애니메이션이 없습니다")
            # 액션만 챙기고 여분 아마튜어는 즉시 버린다.
            # 이걸 나중에 지우면 트랙까지 딸려 사라진다 — GUI 작업의 단골 함정.
            for obj in new_objs:
                bpy.data.objects.remove(obj, do_unlink=True)

        start, end = frame_range(action)
        length = end - start
        if length < 2:
            sys.exit(
                f"[오류] '{clip_name}' 액션이 비어 있습니다 "
                f"(프레임 {start:.0f}~{end:.0f}). FBX를 다시 확인하세요"
            )

        action.name = clip_name
        action.use_fake_user = True
        collected.append((clip_name, action, slot))
        print(f"[clip] {clip_name:12} 프레임 {start:.0f}~{end:.0f} ({length:.0f}f)")

    if not collected:
        sys.exit("[오류] --anim 이 하나도 없습니다")

    # 3) 모든 액션을 target의 NLA 트랙으로 올린다.
    #
    # 액션 에디터에 물린 뒤 push_down 하는 GUI 방식은 슬롯이 안 맞으면
    # 빈 스트립이 생긴다. 여기서는 NLA 트랙과 스트립을 직접 만들고
    # 슬롯을 명시적으로 지정해 그 문제를 피한다.
    if target.animation_data is None:
        target.animation_data_create()
    ad = target.animation_data

    # 활성 액션은 비워 둔다. 남아 있으면 내보내기에서 중복 클립이 생긴다.
    ad.action = None

    for clip_name, action, slot in collected:
        track = ad.nla_tracks.new()
        track.name = clip_name
        strip = track.strips.new(clip_name, int(action.frame_range[0]), action)
        strip.name = clip_name
        # 슬롯이 있으면 명시적으로 물린다 (Blender 4.4+ 슬롯 액션 대응)
        if slot is not None and hasattr(strip, "action_slot"):
            try:
                strip.action_slot = slot
            except (TypeError, RuntimeError):
                # 슬롯 목록에서 이름으로 다시 찾아본다
                for cand in getattr(action, "slots", []):
                    if cand.name_display == slot.name_display:
                        strip.action_slot = cand
                        break
        print(f"[nla]  {clip_name:12} 스트립 {strip.frame_start:.0f}~{strip.frame_end:.0f}")

    # 4) 내보내기
    bpy.ops.object.select_all(action="DESELECT")
    target.select_set(True)
    for mesh in meshes:
        mesh.select_set(True)
    bpy.context.view_layer.objects.active = target

    bpy.ops.export_scene.gltf(
        filepath=str(out_path),
        export_format="GLB",
        export_animation_mode="NLA_TRACKS",
        export_animations=True,
        export_nla_strips=True,
        export_skins=True,
        use_selection=True,
    )
    print(f"[out]  {out_path}")


if __name__ == "__main__":
    main()
