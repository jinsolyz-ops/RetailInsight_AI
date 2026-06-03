# 편의점 브랜드 모니터링 — 주간 데이터 수집

프로젝트 경로: `C:\Users\isoda\RetailInsight_AI`

CLAUDE.md 지시에 따라 아래 순서대로 처리한다.

---

## Step 1: 수집 기간 계산

실행 당일(오늘) 날짜 기준으로 자동 계산:
- END_DATE = 오늘 날짜 (YYYY-MM-DD)
- START_DATE = 오늘 기준 6일 전 (YYYY-MM-DD)

---

## Step 2: 사이트별 크롤링 (브라우저 자동화 사용)

### 수집 키워드 및 brand 매핑
| 키워드 | brand |
|--------|-------|
| CU     | cu    |
| 씨유   | cu    |
| GS25   | gs    |

> 포켓CU, 포켓씨유, 우동지, 우리동네GS는 검색 결과가 있을 때만 수집

### 1. 더쿠 (theqoo.net)
- 로그인 세션 활용 (브라우저에 이미 로그인된 상태 이용)
- 검색 URL 패턴:
  - `https://theqoo.net/?_filter=search&act=&mid=talk&search_target=title_content&search_keyword={키워드}`
  - `https://theqoo.net/?_filter=search&act=&mid=theqdeal&search_target=title_content&search_keyword={키워드}`
  - `https://theqoo.net/?_filter=search&act=&mid=square&search_target=title_content&search_keyword={키워드}`
- 수집 항목: 제목, URL, 날짜
- 날짜 필터: START_DATE ~ END_DATE 범위 내 게시글만
- 개별 게시글 방문 → 본문(`class`에 `rhymix_content`가 포함된 `div` 태그 내 텍스트 추출), 조회수, 댓글수 수집

### 2. 에펨코리아 (fmkorea.com)
- 검색 URL: `https://www.fmkorea.com/search.php?mid=home&act=IS&search_target=title_content&is_keyword={키워드}&where=document&page=1&sph_sort=recentness`
- 편의점 관련 게시글만 수집 (게임/스포츠 관련 CU 언급 글 제외)
- 날짜 필터: START_DATE ~ END_DATE 범위 내 게시글만
- 개별 게시글 방문 → 본문, 조회수(`<span>조회 수 <b>N</b></span>` 구조에서 `<b>` 태그 내 숫자 추출), 댓글수(`.fdb_lst_ul > li` 카운트) 수집

### 3. 인스티즈 (instiz.net)
- 검색 URL: `https://www.instiz.net/bbs/list.php?k={키워드}&id=name&stype=9&category=1`
- 로그인 세션 활용 (브라우저에 이미 로그인된 상태 이용)
- 날짜 필터: START_DATE ~ END_DATE 범위 내 게시글만
- 개별 게시글 방문 → 본문(article 태그), 조회수(`<span id="hit">N</span>` 에서 숫자 추출), 댓글수 수집

---

## Step 3: new_posts.json 저장

수집된 데이터를 `C:\Users\isoda\RetailInsight_AI\new_posts.json`에 저장.

### 필드 정의
| 필드 | 타입 | 필수 |
|------|------|------|
| brand | string ("cu" 또는 "gs") | ✅ |
| title | string | ✅ |
| site | string ("더쿠", "에펨코리아", "인스티즈") | ✅ |
| keyword | string | ✅ |
| post_date | string (YYYY-MM-DD) | ✅ |
| url | string | ✅ |
| content | string (본문 앞 200자) | - |
| views | integer or null | - |
| comments | integer or null | - |

### 주의사항
- url이 없는 게시글 제외
- 중복 제거 기준: (brand, url) 복합
- 날짜 범위 외 게시글 제외
- 편의점 무관 게시글(게임 용어 CU, 인명 씨유 등) 제외

---

## Step 4: collect.py 실행

```bash
cd "C:\Users\isoda\RetailInsight_AI"
python collect.py
```

- 성공 시 `✅ 총 N건 Supabase 적재 완료` 메시지 확인
- `backups/` 폴더에 날짜별 백업 파일 생성 확인

---

## Step 5: generate_summary.js 실행

```bash
cd "C:\Users\isoda\RetailInsight_AI"
node generate_summary.js
```

- posts 테이블의 가장 최근 post_date 기준 7일간 게시글을 brand별로 조회
- Claude API로 CU/GS25 각각 트렌드 3줄 요약 생성
- summary 테이블에 UPSERT 저장
- 성공 시 `🎉 모든 요약 처리 완료!` 메시지 확인

---

## 오류 대응

| 상황 | 조치 |
|------|------|
| 더쿠/인스티즈 로그인 세션 만료 | 브라우저에서 직접 로그인 후 재시도 요청 |
| new_posts.json 유효성 오류 | 오류 메시지 확인 후 해당 데이터 수정 |
| Supabase 연결 오류 | .env 파일의 SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 확인 |
| collect.py UNIQUE 충돌 | upsert이므로 무시해도 됨 |
| generate_summary.js 401 오류 | 환경변수 ANTHROPIC_API_KEY 설정 확인 |
| generate_summary.js 409 오류 | 당일 이미 요약 생성됨, 정상 동작 |