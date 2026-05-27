"""
collect.py
----------
Claude Code가 생성한 new_posts.json을 읽어
Supabase posts 테이블에 upsert하는 주간 갱신 스크립트.

실행 흐름:
  1. Claude Code가 크롤링 → new_posts.json 생성
  2. collect.py 실행 → new_posts.json 읽기 → Supabase upsert
  3. 완료 후 new_posts.json 백업 보관 (덮어쓰지 않음)

사용법:
    python collect.py

.env 파일:
    SUPABASE_URL=https://xxxx.supabase.co
    SUPABASE_SERVICE_ROLE_KEY=eyJ...
"""

import json
import os
import shutil
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client, Client

# ── 설정 ──────────────────────────────────────────────
NEW_POSTS_FILE = "new_posts.json"   # Claude Code가 생성하는 파일
BACKUP_DIR     = "backups"          # 적재 완료된 파일 백업 폴더
# ─────────────────────────────────────────────────────

REQUIRED_FIELDS = {"brand", "title", "site", "keyword", "post_date", "url"}
VALID_BRANDS    = {"cu", "gs"}


# ① new_posts.json 읽기 및 유효성 검사
def load_new_posts(filepath: str) -> list[dict]:
    path = Path(filepath)
    if not path.exists():
        raise FileNotFoundError(
            f"'{filepath}' 파일이 없습니다.\n"
            "Claude Code가 크롤링을 완료한 후 다시 실행하세요."
        )

    with open(path, encoding="utf-8") as f:
        posts = json.load(f)

    if not isinstance(posts, list):
        raise ValueError("new_posts.json의 최상위 구조는 배열(list)이어야 합니다.")

    if len(posts) == 0:
        raise ValueError("new_posts.json에 데이터가 없습니다.")

    # 필드 및 값 유효성 검사
    errors = []
    for i, post in enumerate(posts):
        missing = REQUIRED_FIELDS - set(post.keys())
        if missing:
            errors.append(f"  [#{i}] 필수 필드 누락: {missing} | title: {post.get('title', '?')[:30]}")

        if post.get("brand") not in VALID_BRANDS:
            errors.append(f"  [#{i}] brand 값 오류: '{post.get('brand')}' (허용값: cu, gs)")

        if not post.get("url"):
            errors.append(f"  [#{i}] url이 비어있습니다: {post.get('title', '?')[:30]}")

    if errors:
        raise ValueError("유효성 검사 실패:\n" + "\n".join(errors))

    return posts


# ② Supabase upsert (url 기준 중복 방지, 500건 배치)
def upsert_posts(supabase: Client, posts: list[dict]) -> int:
    batch_size = 500
    total_upserted = 0

    for i in range(0, len(posts), batch_size):
        batch = posts[i : i + batch_size]
        result = (
            supabase.table("posts")
            .upsert(batch, on_conflict="brand,url")
            .execute()
        )
        total_upserted += len(result.data)
        print(f"  배치 {i // batch_size + 1}: {len(result.data)}건 완료")

    return total_upserted


# ③ 적재 완료 후 new_posts.json을 backups/ 폴더에 날짜별로 보관
def backup_file(filepath: str) -> str:
    backup_dir = Path(BACKUP_DIR)
    backup_dir.mkdir(exist_ok=True)

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup_path = backup_dir / f"posts_{timestamp}.json"
    shutil.copy2(filepath, backup_path)

    return str(backup_path)


def main():
    # 환경변수 로드
    load_dotenv()
    supabase_url = os.environ.get("SUPABASE_URL")
    service_key  = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

    if not supabase_url or not service_key:
        raise EnvironmentError(
            ".env 파일에 SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY를 설정해주세요."
        )

    # ① 파일 읽기 및 유효성 검사
    print(f"📂 {NEW_POSTS_FILE} 로드 중...")
    posts = load_new_posts(NEW_POSTS_FILE)

    # 수집 기간 요약 출력
    dates = sorted({p["post_date"] for p in posts})
    brands = {p["brand"]: sum(1 for x in posts if x["brand"] == p["brand"]) for p in posts}
    print(f"  → {len(posts)}건 로드 완료")
    print(f"  → 수집 기간: {dates[0]} ~ {dates[-1]}")
    print(f"  → CU: {brands.get('cu', 0)}건 / GS25: {brands.get('gs', 0)}건")

    # ② Supabase 연결 및 upsert
    print("\n🚀 Supabase 업로드 시작...")
    supabase = create_client(supabase_url, service_key)
    total = upsert_posts(supabase, posts)
    print(f"\n✅ 총 {total}건 Supabase 적재 완료")

    # ③ 백업
    backup_path = backup_file(NEW_POSTS_FILE)
    print(f"💾 백업 저장: {backup_path}")
    print("\n🎉 주간 갱신 완료!")


if __name__ == "__main__":
    main()