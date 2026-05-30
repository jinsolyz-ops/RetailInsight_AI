// generate_summary.js
// Supabase posts 테이블 → Claude API 요약 → summary 테이블 저장

const SUPABASE_URL = "https://gntaqfwkfolmufbwjmkk.supabase.co";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

const DAYS = 7; // 수집 범위 (최근 post_date 포함 총 7일)

// ─────────────────────────────────────────
// 1. posts 테이블에서 가장 최근 post_date 조회
// ─────────────────────────────────────────
async function getLatestPostDate() {
  const url = `${SUPABASE_URL}/rest/v1/posts?select=post_date&order=post_date.desc&limit=1`;

  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });

  if (!res.ok) throw new Error(`최근 post_date 조회 실패: ${res.status}`);
  const data = await res.json();
  if (!data.length) throw new Error("posts 테이블에 데이터가 없습니다.");

  return data[0].post_date; // "2026-05-26" 형식
}

// ─────────────────────────────────────────
// 2. 날짜 범위 계산 (최근 post_date 기준 총 7일)
// ─────────────────────────────────────────
function getDateRange(latestDateStr) {
  const end = new Date(latestDateStr);
  const start = new Date(latestDateStr);
  start.setDate(end.getDate() - (DAYS - 1));

  const fmt = (d) => d.toISOString().split("T")[0];
  return { start: fmt(start), end: fmt(end) };
}

// ─────────────────────────────────────────
// 2. Supabase에서 brand별 게시글 조회
// ─────────────────────────────────────────
async function fetchPosts(brand, start, end) {
  const params = new URLSearchParams({
    brand: `eq.${brand}`,
    post_date: `gte.${start}`,
    // post_date lte 는 and 조건이라 별도 처리
    select: "title,content,post_date,keyword",
    order: "post_date.desc",
  });

  // lte 조건 추가
  const url = `${SUPABASE_URL}/rest/v1/posts?brand=eq.${brand}&post_date=gte.${start}&post_date=lte.${end}&select=title,content,post_date,keyword&order=post_date.desc`;

  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });

  if (!res.ok) throw new Error(`Supabase 조회 실패 (${brand}): ${res.status}`);
  return await res.json();
}

// ─────────────────────────────────────────
// 3. Claude API로 트렌드 요약 생성
// ─────────────────────────────────────────
async function generateSummary(brand, posts) {
  const brandLabel = brand === "cu" ? "CU" : "GS25";

  // 토큰 절약: 게시글당 제목 + 본문 앞 300자만 사용
  const postTexts = posts
    .map((p, i) => {
      const body = p.content ? p.content.slice(0, 300) : "(본문 없음)";
      return `[${i + 1}] 제목: ${p.title}\n내용: ${body}`;
    })
    .join("\n\n");

  const prompt = `아래는 최근 6일간 수집된 ${brandLabel} 관련 커뮤니티 게시글 ${posts.length}건입니다.
전체 게시글을 분석하여 소비자 트렌드와 주요 반응을 3줄로 요약해주세요.

요약 규칙:
- 각 줄은 "• "으로 시작
- 한 줄당 30~50자 내외
- 구체적인 트렌드/이슈/감성 위주로 작성
- 마케팅 인사이트 관점으로 작성

게시글 목록:
${postTexts}
`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 300,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) throw new Error(`Claude API 실패 (${brand}): ${res.status}`);
  const data = await res.json();
  return data.content[0].text.trim();
}

// ─────────────────────────────────────────
// 4. summary 테이블에 UPSERT
// ─────────────────────────────────────────
async function upsertSummary({ brand, summaryContent, postCount, periodStart, periodEnd }) {
  const today = new Date().toISOString().split("T")[0];

  const res = await fetch(`${SUPABASE_URL}/rest/v1/summary?on_conflict=created_at,brand`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      Prefer: "resolution=merge-duplicates", // UPSERT
    },
    body: JSON.stringify({
      created_at: today,
      brand,
      summary_content: summaryContent,
      post_count: postCount,
      period_start: periodStart,
      period_end: periodEnd,
    }),
  });

  if (!res.ok) throw new Error(`Supabase UPSERT 실패 (${brand}): ${res.status}`);
  console.log(`✅ ${brand.toUpperCase()} summary 저장 완료`);
}

// ─────────────────────────────────────────
// 5. 메인 실행
// ─────────────────────────────────────────
async function main() {
  if (!SUPABASE_ANON_KEY) throw new Error("환경변수 SUPABASE_ANON_KEY 가 없습니다.");
  if (!ANTHROPIC_API_KEY) throw new Error("환경변수 ANTHROPIC_API_KEY 가 없습니다.");

  console.log(`📡 posts 테이블 최근 날짜 조회 중...`);
  const latestDate = await getLatestPostDate();
  console.log(`   → 최근 post_date: ${latestDate}`);

  const { start, end } = getDateRange(latestDate);
  console.log(`📅 수집 기간: ${start} ~ ${end} (총 ${DAYS}일)`);

  for (const brand of ["cu", "gs"]) {
    console.log(`\n🔍 ${brand.toUpperCase()} 게시글 조회 중...`);
    const posts = await fetchPosts(brand, start, end);
    console.log(`   → ${posts.length}건 조회됨`);

    if (posts.length === 0) {
      console.log(`   ⚠️  게시글 없음, 건너뜀`);
      continue;
    }

    console.log(`🤖 Claude API 요약 생성 중...`);
    const summaryContent = await generateSummary(brand, posts);
    console.log(`   → 요약 완료:\n${summaryContent}`);

    await upsertSummary({
      brand,
      summaryContent,
      postCount: posts.length,
      periodStart: start,
      periodEnd: end,
    });
  }

  console.log("\n🎉 모든 요약 처리 완료!");
}

main().catch((err) => {
  console.error("❌ 오류 발생:", err.message);
  process.exit(1);
});