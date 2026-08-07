"""캐릭터 에셋 빌드 도구.

Mixamo에서 받은 FBX 여러 개를 애니메이션 클립이 담긴 glb 하나로 합친다.
블렌더를 창 없이 실행하므로 사람이 GUI를 만질 일이 없고, 결과가 매번 같다.

    python tools/asset.py list                       역할별 FBX와 판별된 클립
    python tools/asset.py add researcher a.fbx b.fbx FBX를 에셋 폴더로 복사
    python tools/asset.py build researcher           glb 생성 (--all 로 전체)
    python tools/asset.py check                      만들어진 glb 검증
    python tools/asset.py clips                      상태-클립 매핑 표

FBX는 tools/assets/<역할>/ 아래에 둔다. 결과는 backend/uploads/<역할>.glb.
클립 판별 규칙은 tools/clips.json 에 있다.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import struct
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TOOLS = ROOT / "tools"
ASSETS = TOOLS / "assets"
OUT_DIR = ROOT / "backend" / "uploads"
CLIPS_JSON = TOOLS / "clips.json"
BLENDER_SCRIPT = TOOLS / "fbx_to_glb.py"

# 키프레임이 이보다 적으면 껍데기로 본다
MIN_KEYFRAMES = 10
GLTF_JSON_CHUNK = 0x4E4F534A

# FBX 바이너리에서 메시 존재를 판별하는 마커.
# With Skin 파일에만 지오메트리가 들어 있다.
MESH_MARKERS = (b"Geometry", b"Mesh")
BONE_RE = re.compile(rb"mixamorig:[A-Za-z0-9_]{2,}")


# --- 설정 --------------------------------------------------------------


@dataclass(frozen=True)
class ClipRule:
    clip: str
    state: str
    match: tuple[str, ...]
    required: bool


def load_clip_rules() -> list[ClipRule]:
    if not CLIPS_JSON.exists():
        die(f"클립 설정이 없습니다: {rel(CLIPS_JSON)}")
    data = json.loads(CLIPS_JSON.read_text(encoding="utf-8"))
    return [
        ClipRule(
            clip=item["clip"],
            state=item.get("state", ""),
            match=tuple(m.lower() for m in item.get("match", [])),
            required=bool(item.get("required", False)),
        )
        for item in data.get("clips", [])
    ]


# --- 공용 --------------------------------------------------------------


def rel(path: Path) -> str:
    try:
        return str(path.relative_to(ROOT))
    except ValueError:
        return str(path)


def die(message: str) -> None:
    print(f"오류: {message}", file=sys.stderr)
    raise SystemExit(1)


def mb(size: int) -> str:
    return f"{size / 1024 / 1024:.2f} MB"


def find_blender() -> Path:
    env = os.environ.get("BLENDER")
    if env and Path(env).exists():
        return Path(env)

    found = shutil.which("blender")
    if found:
        return Path(found)

    bases = [
        Path(r"C:\Program Files\Blender Foundation"),
        Path.home() / "AppData/Local/Programs/Blender Foundation",
        Path("/Applications/Blender.app/Contents/MacOS"),
        Path("/usr/bin"),
    ]
    for base in bases:
        if not base.exists():
            continue
        for pattern in ("*/blender.exe", "blender.exe", "blender", "Blender"):
            hits = sorted(base.glob(pattern))
            if hits:
                return hits[-1]

    die(
        "블렌더를 찾지 못했습니다. blender.org 에서 설치하거나 BLENDER 환경변수를 지정하세요.\n"
        '  set BLENDER="C:\\Program Files\\Blender Foundation\\Blender 5.2\\blender.exe"'
    )
    raise AssertionError  # 도달하지 않음


# --- FBX 판별 ----------------------------------------------------------


def fbx_has_mesh(path: Path) -> bool:
    """With Skin 파일인지(몸통을 품고 있는지) 확인한다.

    파일 크기로 어림잡지 않고 내용을 본다. 애니메이션이 긴 Without Skin
    파일이 With Skin 파일보다 커지는 경우가 실제로 있다.
    """
    data = path.read_bytes()
    return all(data.count(marker) > 0 for marker in MESH_MARKERS)


def fbx_bone_count(path: Path) -> int:
    data = path.read_bytes()
    return len({m.group(0) for m in BONE_RE.finditer(data)})


@dataclass
class Plan:
    role: str
    skin: Path
    clips: list[tuple[str, Path]]
    skipped: list[Path]


def plan_role(role: str, rules: list[ClipRule]) -> Plan:
    src = ASSETS / role
    if not src.is_dir():
        die(
            f"에셋 폴더가 없습니다: {rel(src)}\n"
            f"  python tools/asset.py add {role} <fbx...> 로 넣으세요"
        )

    files = sorted(src.glob("*.fbx"))
    if not files:
        die(f"FBX가 없습니다: {rel(src)}")

    skins = [f for f in files if fbx_has_mesh(f)]
    if not skins:
        die(
            f"[{role}] With Skin 파일이 없습니다.\n"
            "  Mixamo에서 첫 파일만 Skin='With Skin'으로 다시 받으세요"
        )
    if len(skins) > 1:
        print(f"  참고: With Skin 파일이 여러 개라 가장 큰 것을 씁니다 — {[s.name for s in skins]}")
    skin = max(skins, key=lambda p: p.stat().st_size)

    clips: list[tuple[str, Path]] = []
    used: set[Path] = set()
    for rule in rules:
        for fbx in files:
            if fbx in used:
                continue
            if any(k in fbx.stem.lower() for k in rule.match):
                clips.append((rule.clip, fbx))
                used.add(fbx)
                break

    missing_required = [r.clip for r in rules if r.required and r.clip not in {c for c, _ in clips}]
    if missing_required:
        die(f"[{role}] 필수 클립이 없습니다: {', '.join(missing_required)}")

    return Plan(role=role, skin=skin, clips=clips, skipped=[f for f in files if f not in used])


def all_roles() -> list[str]:
    if not ASSETS.exists():
        return []
    return [d.name for d in sorted(ASSETS.iterdir()) if d.is_dir()]


# --- glb 검증 ----------------------------------------------------------


def read_gltf_json(path: Path) -> dict:
    data = path.read_bytes()
    if data[:4] != b"glTF":
        raise ValueError("glb 파일이 아닙니다")
    offset = 12
    while offset < len(data):
        length, chunk_type = struct.unpack_from("<II", data, offset)
        if chunk_type == GLTF_JSON_CHUNK:
            return json.loads(data[offset + 8 : offset + 8 + length])
        offset += 8 + length
    raise ValueError("JSON 청크를 찾지 못했습니다")


def check_glb(path: Path) -> bool:
    doc = read_gltf_json(path)
    accessors = doc.get("accessors", [])
    animations = doc.get("animations", [])
    skins = doc.get("skins", [])
    meshes = doc.get("meshes", [])
    scene = (doc.get("scenes") or [{}])[0]
    roots = [doc["nodes"][i].get("name", "?") for i in scene.get("nodes", [])]
    bones = len(skins[0].get("joints", [])) if skins else 0

    print(f"\n{path.name}  ({mb(path.stat().st_size)})")
    print(f"  본 {bones}개 · 메시 {len(meshes)}개 · 루트 {roots}")

    ok = True
    if len(roots) != 1:
        print(f"  ! 루트 노드가 {len(roots)}개입니다. 여분 아마튜어가 섞였습니다")
        ok = False
    if not meshes:
        print("  ! 메시가 없습니다. With Skin 파일이 빠졌습니다")
        ok = False
    if not animations:
        print("  ! 애니메이션이 없습니다")
        ok = False

    for anim in animations:
        keys = 0
        duration = 0.0
        for sampler in anim.get("samplers", []):
            acc = accessors[sampler["input"]]
            keys = max(keys, acc.get("count", 0))
            if acc.get("max"):
                duration = max(duration, acc["max"][0])
        targets = len({c["target"]["node"] for c in anim.get("channels", [])})
        good = keys >= MIN_KEYFRAMES
        ok = ok and good
        print(
            f"  {'OK ' if good else '비었음'} {anim.get('name', '?'):<14}"
            f" 대상본 {targets:>3} · 키프레임 {keys:>4} · 길이 {duration:>6.2f}s"
        )

    print(f"  => {'정상' if ok else '문제 있음'}")
    return ok


# --- 명령 --------------------------------------------------------------


def cmd_clips(args: argparse.Namespace) -> int:
    rules = load_clip_rules()
    print(f"클립 매핑 ({rel(CLIPS_JSON)})\n")
    print(f"  {'앱 상태':<10} {'클립 이름':<14} 파일명 키워드")
    print(f"  {'-' * 10} {'-' * 14} {'-' * 40}")
    for r in rules:
        mark = " *" if r.required else "  "
        print(f"  {r.state:<10} {r.clip:<14} {', '.join(r.match)}{mark}")
    print("\n  * 필수 클립")
    return 0


def cmd_list(args: argparse.Namespace) -> int:
    rules = load_clip_rules()
    roles = all_roles()
    if not roles:
        print(f"에셋이 없습니다: {rel(ASSETS)}")
        print("  python tools/asset.py add <역할> <fbx...> 로 추가하세요")
        return 0

    for role in roles:
        files = sorted((ASSETS / role).glob("*.fbx"))
        print(f"\n[{role}]  FBX {len(files)}개")
        for f in files:
            skin = " (With Skin)" if fbx_has_mesh(f) else ""
            print(f"  {f.name:<32} {mb(f.stat().st_size):>10}  본 {fbx_bone_count(f)}{skin}")

        try:
            plan = plan_role(role, rules)
        except SystemExit:
            continue
        print("  판별된 클립:")
        for clip, fbx in plan.clips:
            print(f"    {clip:<14} <- {fbx.name}")
        for fbx in plan.skipped:
            print(f"    (건너뜀)       {fbx.name}  — clips.json 에 키워드를 추가하세요")

        out = OUT_DIR / f"{role}.glb"
        print(f"  출력: {rel(out)} {'(있음)' if out.exists() else '(아직 없음)'}")
    return 0


def cmd_add(args: argparse.Namespace) -> int:
    dest = ASSETS / args.role
    dest.mkdir(parents=True, exist_ok=True)

    added = 0
    for raw in args.files:
        src = Path(raw).expanduser()
        if not src.exists():
            print(f"  건너뜀 (없음): {raw}")
            continue
        if src.suffix.lower() != ".fbx":
            print(f"  건너뜀 (.fbx 아님): {src.name}")
            continue
        shutil.copy2(src, dest / src.name)
        kind = "With Skin" if fbx_has_mesh(dest / src.name) else "Without Skin"
        print(f"  추가: {src.name}  ({mb(src.stat().st_size)}, {kind})")
        added += 1

    if not added:
        die("추가된 파일이 없습니다")
    print(f"\n{added}개를 {rel(dest)} 에 넣었습니다.")
    print(f"  python tools/asset.py build {args.role}")
    return 0


def cmd_build(args: argparse.Namespace) -> int:
    rules = load_clip_rules()
    roles = all_roles() if args.all else args.roles
    if not roles:
        die("빌드할 역할을 지정하세요. 예: python tools/asset.py build researcher")

    blender = find_blender()
    print(f"블렌더: {blender}")
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    failed: list[str] = []
    for role in roles:
        print(f"\n=== {role} ===")
        plan = plan_role(role, rules)
        print(f"  몸통: {plan.skin.name}")
        for clip, fbx in plan.clips:
            print(f"  {clip:<14} <- {fbx.name}")
        for fbx in plan.skipped:
            print(f"  (건너뜀)       {fbx.name}")

        out = OUT_DIR / f"{role}.glb"
        cmd = [
            str(blender),
            "--background",
            # 사용자 설정과 애드온의 영향을 배제해 결과를 고정한다
            "--factory-startup",
            "--python",
            str(BLENDER_SCRIPT),
            "--",
            "--skin",
            str(plan.skin),
            "--out",
            str(out),
        ]
        for clip, fbx in plan.clips:
            cmd += ["--anim", f"{clip}={fbx}"]

        result = subprocess.run(
            cmd, capture_output=True, text=True, encoding="utf-8", errors="replace"
        )

        # 블렌더 로그는 잡음이 많아 우리 스크립트 출력만 골라 보여준다
        for line in (result.stdout or "").splitlines():
            if line.startswith(("[clip]", "[nla]", "[오류]")):
                print("  " + line)

        if result.returncode != 0 or not out.exists():
            print(f"  실패 (exit {result.returncode})")
            for line in (result.stderr or result.stdout or "").strip().splitlines()[-12:]:
                print("    " + line)
            failed.append(role)
            continue

        if args.no_check:
            print(f"  완료 — {rel(out)} ({mb(out.stat().st_size)})")
        elif not check_glb(out):
            failed.append(role)

    if failed:
        print(f"\n실패: {', '.join(failed)}")
        return 1

    print("\n전부 완료.")
    return 0


def cmd_check(args: argparse.Namespace) -> int:
    targets = [Path(a) for a in args.files] or sorted(OUT_DIR.glob("*.glb"))
    if not targets:
        die(f"검사할 glb가 없습니다: {rel(OUT_DIR)}")

    results = []
    for path in targets:
        if not path.exists():
            print(f"\n{path} — 없음")
            results.append(False)
            continue
        try:
            results.append(check_glb(path))
        except ValueError as exc:
            print(f"\n{path.name} — 읽을 수 없습니다: {exc}")
            results.append(False)

    return 0 if all(results) else 1


def main() -> int:
    parser = argparse.ArgumentParser(
        prog="asset.py",
        description="Mixamo FBX를 캐릭터 glb로 합치는 도구",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "예시:\n"
            '  python tools/asset.py add researcher "C:\\Downloads\\Typing.fbx"\n'
            "  python tools/asset.py build researcher\n"
            "  python tools/asset.py check\n"
        ),
    )
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("list", help="역할별 FBX와 판별된 클립 보기")
    p.set_defaults(func=cmd_list)

    p = sub.add_parser("add", help="FBX를 에셋 폴더로 복사")
    p.add_argument("role", help="역할 이름 (예: researcher)")
    p.add_argument("files", nargs="+", help="복사할 .fbx 경로")
    p.set_defaults(func=cmd_add)

    p = sub.add_parser("build", help="glb 생성")
    p.add_argument("roles", nargs="*", help="빌드할 역할")
    p.add_argument("--all", action="store_true", help="에셋 폴더 전체")
    p.add_argument("--no-check", action="store_true", help="빌드 후 검증 생략")
    p.set_defaults(func=cmd_build)

    p = sub.add_parser("check", help="만들어진 glb 검증")
    p.add_argument("files", nargs="*", help="검사할 .glb (없으면 backend/uploads 전부)")
    p.set_defaults(func=cmd_check)

    p = sub.add_parser("clips", help="상태-클립 매핑 표")
    p.set_defaults(func=cmd_clips)

    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
