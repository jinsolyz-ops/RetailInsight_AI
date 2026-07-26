"""
backfill_keywords.py
---------------------
Supabase posts 테이블에 이미 저장된 기존 게시글들에 대해
keyword_extractor.py의 연관키워드 분석을 소급 적용(backfill)하는 스크립트.

대상 선정 기준 (기본값):
  - keywords가 NULL이거나
  - keyword_version이 현재 KEYWORD_VERSION과 다른 행
  (즉, 아직 분석되지 않았거나 예전 버전 로직으로 분석된 행만 재처리)

--force 옵션을 주면 조건 무시하고 전체 행을 재분석한다.
(예: 브랜드/불용어 목록을 손봐서 같은 KEYWORD_VERSION이지만 재적용하고 싶을 때)

collect.py와 마찬가지로 샌드박스(bash)에서는 Supabase 접속이 막혀있으므로(403),
mcp_computer_use로 사용자 PC 터미널에서 직접 실행해야 한다.

사용법:
    python backfill_keywords.py            # keywords가 없거나 버전이 다른 행만 재처리
    python backfill_keywords.py --force     # 전체 행 강제 재처리

.env 파일:
    SUPABASE_URL=https://xxxx.supabase.co
    SUPABASE_SERVICE_ROLE_KEY=eyJ...
"""

import argparse
import os

from dotenv import load_dotenv
from supabase import create_client, Client

from keyword_extractor import extract_keywords, KEYWORD_VERSION

PAGE_SIZE = 1000  # 한 번에 조회할 행 수 (Supabase 기본 최대 응답 행 수 대응)


# ① 재분석 대상 행 조회
def fetch_target_posts(supabase: Client, force: bool) -> list[dict]:
    all_rows = []
    offset = 0

    while True:
        query = (
            supabase.table("posts")
            .select("id, brand, title, content, keyword_version")
            .range(offset, offset + PAGE_SIZE - 1)
        )
        result = query.execute()
        rows = result.data
        if not rows:
            break
        all_rows.extend(rows)
        if len(rows) < PAGE_SIZE:
            break
        offset += PAGE_SIZE

    if force:
        return all_rows

    return [
        row for row in all_rows
        if row.get("keyword_version") != KEYWORD_VERSION
    ]


# ② 행별로 연관키워드 분석 후 업데이트
def backfill(supabase: Client, posts: list[dict]) -> tuple[int, list[str]]:
    from datetime import datetime, timezone

    success = 0
    errors = []

    for i, post in enumerate(posts, start=1):
        try:
            keywords = extract_keywords(
                post.get("title", ""),
                post.get("content", ""),
                post.get("brand"),
            )
            supabase.table("posts").update({
                "keywords": keywords,
                "keyword_version": KEYWORD_VERSION,
                "keywords_updated_at": datetime.now(timezone.utc).isoformat(),
            }).eq("id", post["id"]).execute()

            success += 1
            if i % 20 == 0 or i == len(posts):
                print(f"  진행 중... {i}/{len(posts)}건")

        except Exception as e:
            errors.append(f"  [id={post.get('id')}] {post.get('title', '?')[:30]} → {e}")

    return success, errors


def main():
    parser = argparse.ArgumentParser(description="기존 게시글 연관키워드 backfill")
    parser.add_argument(
        "--force",
        action="store_true",
        help="keyword_version 무관하게 전체 행 강제 재분석",
    )
    args = parser.parse_args()

    # 환경변수 로드
    load_dotenv()
    supabase_url = os.environ.get("SUPABASE_URL")
    service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

    if not supabase_url or not service_key:
        raise EnvironmentError(
            ".env 파일에 SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY를 설정해주세요."
        )

    supabase = create_client(supabase_url, service_key)

    # ① 대상 조회
    print(f"📂 재분석 대상 조회 중... (현재 KEYWORD_VERSION: {KEYWORD_VERSION}{', --force' if args.force else ''})")
    targets = fetch_target_posts(supabase, force=args.force)

    if not targets:
        print("✅ 재분석할 게시글이 없습니다. (모든 행이 최신 버전으로 분석되어 있음)")
        return

    brands = {b: sum(1 for p in targets if p.get("brand") == b) for b in {"cu", "gs"}}
    print(f"  → 총 {len(targets)}건 (CU: {brands.get('cu', 0)}건 / GS25: {brands.get('gs', 0)}건)")

    # ② 분석 및 업데이트
    print("\n🔍 연관키워드 분석 및 Supabase 업데이트 시작...")
    success, errors = backfill(supabase, targets)

    print(f"\n✅ 총 {success}/{len(targets)}건 backfill 완료 (version: {KEYWORD_VERSION})")

    if errors:
        print(f"\n⚠️ 오류 {len(errors)}건:")
        for err in errors:
            print(err)

    print("\n🎉 backfill 완료!")


if __name__ == "__main__":
    main()
