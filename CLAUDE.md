# 편의점 브랜드 모니터링 — 주간 데이터 수집

프로젝트 경로: `C:\Users\isoda\RetailInsight_AI`

CLAUDE.md 지시에 따라 아래 순서대로 처리한다.

---

## ⚠️ 필수 원칙 (사용자 지시 — 절대 준수)

1. **개별 게시글 방문 절대 생략 금지**: 수집된 모든 게시글은 반드시 개별 URL을 방문하여 본문(content), 조회수(views), 댓글수(comments)를 수집한다. 목록 페이지 정보만으로 저장하는 것은 어떤 상황에서도 허용되지 않는다.

2. **컴퓨터 사용 자동 실행**: 브라우저 자동화(`Chrome MCP`)에 한해 `request_access` 권한 요청 다이얼로그를 생략하고 바로 실행한다. 터미널·파일 탐색기 등 다른 앱 접근 시에도 `request_access` 없이 바로 실행한다.

3. **샌드박스는 Supabase 접속 불가 — mcp_computer_use로 Step 4, 5 실행**: 이 프로젝트(RetailInsight 주간 수집) 작업에 한해 사용자가 `mcp_computer_use`(컴퓨터 사용) 사용을 허용함. 코드 실행용 샌드박스(bash)는 네트워크가 제한되어 있어 supabase.co에 접속할 수 없음(항상 403 Forbidden). 따라서 Step 4(collect.py)와 Step 5(generate_summary.js)는 샌드박스 bash로 시도하지 말고, `mcp_computer_use`로 사용자의 실제 PC 화면을 제어하여 터미널(CMD/PowerShell)을 열고 직접 실행한다. new_posts.json도 반드시 `C:\Users\isoda\RetailInsight_AI\new_posts.json` 경로에 정확히 그 파일명으로 존재해야 collect.py가 읽을 수 있음.

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
- 개별 게시글 방문 → 아래 JS로 본문·조회수·댓글수 수집:

```javascript
// 조회수: window 전역 변수에서 직접 읽기
var views = typeof window.share_readed_count === 'number' ? window.share_readed_count : null;

// 댓글수: "댓글 N개" 패턴의 <b> 태그
var commentB = Array.from(document.querySelectorAll('b')).find(b =>
  b.parentElement?.innerText?.includes('댓글')
);
var comments = commentB ? parseInt(commentB.innerText) : 0;

// 본문: .rhymix_content — 이미지 게시글이면 "[이미지 N장]"으로 표시
var contentEl = document.querySelector('[class*="rhymix_content"]');
var contentText = contentEl ? contentEl.innerText?.trim() : '';
if (!contentText && contentEl) {
  var imgs = contentEl.querySelectorAll('img');
  contentText = imgs.length > 0 ? '[이미지 ' + imgs.length + '장]' : '';
}
var content = contentText.slice(0, 200);
```

### 2. 에펨코리아 (fmkorea.com)
- 검색 URL: `https://www.fmkorea.com/search.php?mid=home&act=IS&search_target=title_content&is_keyword={키워드}&where=document&page=1&sph_sort=recentness`
- 편의점 관련 게시글만 수집 (게임/스포츠 관련 CU 언급 글 제외)
- 날짜 필터: START_DATE ~ END_DATE 범위 내 게시글만
- 제목 수집 시 게시판 경로 제거: `a.innerText.replace(/^\[.*?\]\s*/, '').trim()` (예: `[유머/움짤/이슈] 제목` → `제목`)
- 개별 게시글 방문 → 아래 JS로 본문·조회수·댓글수 수집:

```javascript
// 날짜·조회수·댓글수: .rd_hd 텍스트에서 regex 추출
var hdText = document.querySelector('.rd_hd')?.innerText || '';
var dateMatch = hdText.match(/(\d{4})\.(\d{2})\.(\d{2})/);
var date = dateMatch ? dateMatch[1] + '-' + dateMatch[2] + '-' + dateMatch[3] : null;
var viewMatch = hdText.match(/조회\s*수\s*(\d+)/);
var commentMatch = hdText.match(/댓글\s*(\d+)/);
var views = viewMatch ? parseInt(viewMatch[1]) : null;
var comments = commentMatch ? parseInt(commentMatch[1]) : null;

// 본문: .xe_content — 이미지만 있으면 "[이미지 N장]"으로 표시
var contentEl = document.querySelector('.xe_content');
var content = contentEl ? contentEl.innerText?.trim()?.replace(/\s+/g, ' ').slice(0, 200) : null;
if (!content && contentEl) {
  var imgs = contentEl.querySelectorAll('img');
  content = imgs.length > 0 ? '[이미지 ' + imgs.length + '장]' : null;
}

JSON.stringify({date, views, comments, content, title: document.title})
```

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

## Step 4: collect.py 실행 (mcp_computer_use 사용)

샌드박스 bash에서 실행하지 말 것 (Supabase 접속 불가, 항상 403). `mcp_computer_use`로 사용자 PC 화면을 제어해 실행한다:

1. `request_access`로 터미널(CMD/PowerShell) 접근 권한 요청
2. 터미널을 열고 아래 명령 실행:
```bash
cd "C:\Users\isoda\RetailInsight_AI"
python collect.py
```
3. 스크린샷으로 결과 확인: `✅ 총 N건 Supabase 적재 완료` 메시지, `backups/` 폴더에 날짜별 백업 파일 생성 확인

---

## Step 5: generate_summary.js 실행 (mcp_computer_use 사용)

같은 터미널에서 이어서 실행 (마찬가지로 샌드박스 bash 사용 금지):
```bash
cd "C:\Users\isoda\RetailInsight_AI"
node generate_summary.js
```

- posts 테이블의 가장 최근 post_date 기준 7일간 게시글을 brand별로 조회
- Claude API로 CU/GS25 각각 트렌드 3줄 요약 생성
- summary 테이블에 UPSERT 저장
- 스크린샷으로 `🎉 모든 요약 처리 완료!` 메시지 확인

---

## 오류 대응

| 상황 | 조치 |
|------|------|
| 더쿠/인스티즈 로그인 세션 만료 | 브라우저에서 직접 로그인 후 재시도 요청 |
| new_posts.json 유효성 오류 | 오류 메시지 확인 후 해당 데이터 수정 |
| Supabase 연결 오류 (샌드박스 bash에서 403 Forbidden) | 정상 — 샌드박스는 네트워크 제한으로 항상 이럼. mcp_computer_use로 사용자 PC에서 직접 실행해야 함 |
| .env 관련 오류가 mcp_computer_use 실행에서도 발생 | .env 파일의 SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 확인 |
| new_posts.json 파일명이 다르거나 안 보임(캐시 이슈) | 워크스페이스 폴더 마운트 캐시 문제일 수 있음. 다른 파일명으로 저장 후 mcp_computer_use로 실제 PC에서 new_posts.json으로 rename하거나 파일탐색기에서 직접 확인 |
| collect.py UNIQUE 충돌 | upsert이므로 무시해도 됨 |
| generate_summary.js 401 오류 | 환경변수 ANTHROPIC_API_KEY 설정 확인 |
| generate_summary.js 409 오류 | 당일 이미 요약 생성됨, 정상 동작 |
