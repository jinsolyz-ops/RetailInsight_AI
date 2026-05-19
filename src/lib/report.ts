import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

export interface Link {
  title: string;
  url: string;
}

export interface Issue {
  emoji?: string;
  title: string;
  summary: string;
  articleCount: number;
  relatedLinks: Link[];
}

export interface Category {
  name: string;
  issues: Issue[];
}

export interface ReportData {
  generatedAt: string;
  summary: string[];
  categories: Category[];
}

const CATEGORIES = [
  { name: '리테일 트렌드', keywords: ['유통업계 이슈', '유통업계 마케팅'] },
  { name: '이커머스 트렌드', keywords: ['이커머스 이슈', '온라인쇼핑 이슈', '버티컬커머스'] },
  { name: 'AI 트렌드', keywords: ['유통업계 AI', '커머스 AI', '리테일테크'] },
  { name: '당사 이슈', keywords: ['CU', 'BGF리테일'] },
  { name: '경쟁사 이슈', keywords: ['GS25', '세븐일레븐', '이마트24'] },
  { name: '상품 이슈', keywords: ['편의점 디저트', '편의점 신상', '식품 트렌드', 'F&B 트렌드', 'PB상품'] },
];

const CONCURRENCY = 3;
const BATCH_DELAY_MS = 500;
const MAX_RETRIES = 2;
const NEWS_DAYS = 2;
const MAX_PER_KEYWORD = 5;
const MAX_PER_CATEGORY = 15;

function cleanText(s: string): string {
  return s
    .replace(/<[^>]*>?/g, '')
    .replace(/&quot;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/[""]/g, "'")
    .trim();
}

async function fetchNaverNews(keyword: string): Promise<any[]> {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('Naver API keys are missing.');

  const url = `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(keyword)}&display=30&sort=date`;
  const response = await fetch(url, {
    headers: {
      'X-Naver-Client-Id': clientId,
      'X-Naver-Client-Secret': clientSecret,
    },
  });

  if (response.status === 429) throw new Error('RATE_LIMIT');

  if (!response.ok) {
    console.error(`Failed to fetch Naver news for ${keyword}: ${response.statusText}`);
    return [];
  }

  const data = await response.json();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - NEWS_DAYS);

  return (data.items || [])
    .filter((item: any) => new Date(item.pubDate) >= cutoff)
    .slice(0, MAX_PER_KEYWORD)
    .map((item: any) => ({
      title: cleanText(item.title),
      link: item.link,
      description: cleanText(item.description).slice(0, 200),
      pubDate: item.pubDate,
      keyword,
    }));
}

async function fetchWithRetry(keyword: string): Promise<any[]> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fetchNaverNews(keyword);
    } catch (error: any) {
      if (error.message === 'RATE_LIMIT' && attempt < MAX_RETRIES) {
        const delay = 1000 * Math.pow(2, attempt);
        console.warn(`Rate limited for "${keyword}", retrying in ${delay}ms`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      console.error(`Gave up fetching "${keyword}" after ${attempt + 1} attempt(s)`);
      return [];
    }
  }
  return [];
}

async function fetchAllKeywords(keywords: string[]): Promise<Map<string, any[]>> {
  const resultMap = new Map<string, any[]>();
  for (let i = 0; i < keywords.length; i += CONCURRENCY) {
    const batch = keywords.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(batch.map(kw => fetchWithRetry(kw)));
    batch.forEach((kw, j) => resultMap.set(kw, batchResults[j]));
    if (i + CONCURRENCY < keywords.length) {
      await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
    }
  }
  return resultMap;
}

function extractAndParseJSON(text: string): object {
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const src = codeBlock ? codeBlock[1].trim() : text;

  try {
    const firstBrace = src.indexOf('{');
    const lastBrace = src.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      return JSON.parse(src.substring(firstBrace, lastBrace + 1));
    }
  } catch {
    // sanitize 후 재시도
  }

  const firstBrace = src.indexOf('{');
  const lastBrace = src.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace <= firstBrace) {
    throw new Error('No JSON object found in the response.');
  }
  let jsonStr = src.substring(firstBrace, lastBrace + 1);
  jsonStr = jsonStr.replace(/[\n\r\t]+/g, ' ');
  jsonStr = jsonStr.replace(/,\s*([}\]])/g, '$1');
  return JSON.parse(jsonStr);
}

const SYSTEM_PROMPT = `You are a retail marketing analyst for CU (씨유), a Korean convenience store brand operated by BGF리테일. CU/BGF리테일 is "당사" (our company). GS25, 세븐일레븐, and 이마트24 are "경쟁사" (competitors).
Your task is to extract marketing strategies, campaign insights, and notable business moves from recent news articles — NOT just general industry news.
Ensure the report is written in professional Korean.
You MUST be very concise to avoid output truncation.

WHAT TO EXTRACT (prioritize in this order):
1. New marketing campaigns, promotions, or collaborations with clear consumer impact
2. Strategic business moves: new service launches, format innovations, channel expansions
3. Shifts in consumer behavior or purchasing trends backed by data
4. Competitive positioning: how brands are differentiating or responding to each other
5. Notable product or brand moments with marketing significance

WHAT TO EXCLUDE:
- General industry earnings reports, stock news, or financial disclosures
- HR news: restructuring (구조조정), layoffs, voluntary resignation (희망퇴직)
- Cryptocurrency, blockchain, or fintech unrelated to retail payments
- Routine logistics or supply chain operational updates without strategic angle
- Any hallucinated content — base summaries ONLY on the provided articles

EXCLUSIONS SPECIFIC TO 'AI 트렌드' CATEGORY:
- Security/authentication articles (비밀번호, 인증, 해킹, 개인정보 보호)
- Telecom-only articles (SKT, KT, LGU+ as the sole subject, unrelated to retail)
- Finance/fintech articles (결제, 페이, 송금) unless directly tied to retail checkout innovation
- Any AI article not directly relevant to retail, commerce, or consumer experience

CRITICAL FORMAT RULES:
- DO NOT hallucinate. ABSOLUTELY DO NOT mention "물가안정 프로젝트" unless explicitly in the text.
- If a category has no relevant marketing/strategy articles, output an empty array [] for its issues.
- EVEN IF ALL CATEGORIES ARE EMPTY, RETURN THE FULL JSON STRUCTURE. NEVER output conversational text.
- You MUST output exactly 6 categories matching the input. Do not omit any category like '상품 이슈' or '이커머스 트렌드'.
- Each link MUST be used exactly ONCE across the entire report. Do not duplicate links.
- Consolidate articles ONLY when they report on the exact same single event (e.g., multiple outlets covering the same product launch). If topics differ even slightly — different products, different campaigns, different themes — keep them as SEPARATE issues. Never force-merge loosely related articles.

IMPORTANCE RANKING:
- Rank by marketing impact: buzz volume, strategic novelty, consumer relevance
- For '리테일 트렌드': output EXACTLY 2 issues. Each must be a clearly distinct topic.
- For '이커머스 트렌드': output EXACTLY 2 issues. Each must be a clearly distinct topic.
- For 'AI 트렌드': output EXACTLY 2 issues. Each must be a clearly distinct topic.
- For '경쟁사 이슈': output EXACTLY 3 issues — one each for 'GS25', '세븐일레븐', '이마트24'. Pick the single most marketing-relevant article for each brand.
- For '상품 이슈': output EXACTLY 2 issues. Focus on products going viral on SNS or generating strong consumer buzz. Prioritize new launches, limited-edition collabs, and trending items.
- For '당사 이슈': output 1 to 2 issues about CU or BGF리테일 only. Each must be a clearly distinct topic. Do NOT include issues about competitors.
- If a category lacks enough distinct relevant articles to meet the required count, output as many valid issues as possible rather than forcing irrelevant ones.

For each issue, provide:
1. title: Concise title (max 15 chars) referencing the actual campaign or event name.
2. summary: 1-sentence insight explaining the marketing angle or strategic significance, based ONLY on the articles.
3. articleIndices: Array of article [N] numbers from the input that cover this issue (e.g. [1, 3, 7]). Use the exact numbers from the input list.
4. relatedLinks: 1 to 2 article links (prefer 2).
5. emoji: A single relevant emoji. Use 💜 for issues about '우베' (Ube).

Also generate a top-level "summary" array with EXACTLY 3 strings.
Each string must be 1 concise Korean sentence (under 40 chars) highlighting the 3 most marketing-impactful moves across ALL categories.

Output STRICTLY in the following JSON schema without any markdown formatting or extra text.
{
  "summary": ["오늘의 핵심 이슈 1", "오늘의 핵심 이슈 2", "오늘의 핵심 이슈 3"],
  "categories": [
    {
      "name": "Category Name",
      "issues": [
        {
          "emoji": "🔥",
          "title": "Issue Title",
          "summary": "Issue Summary...",
          "articleIndices": [1, 3, 7],
          "relatedLinks": [
            { "title": "Article Title", "url": "http://..." }
          ]
        }
      ]
    }
  ]
}`;

export async function generateReport(): Promise<ReportData> {
  const allKeywords = CATEGORIES.flatMap(c => c.keywords);
  const keywordResults = await fetchAllKeywords(allKeywords);

  const categorizedNews: { [key: string]: any[] } = {};
  CATEGORIES.forEach(c => { categorizedNews[c.name] = []; });

  for (const category of CATEGORIES) {
    const seenUrls = new Set<string>();
    const seenTitles = new Set<string>();
    for (const keyword of category.keywords) {
      for (const item of keywordResults.get(keyword) || []) {
        const normalizedTitle = item.title.replace(/[\s\W]+/g, '').toLowerCase();
        if (
          !seenUrls.has(item.link) &&
          !seenTitles.has(normalizedTitle) &&
          categorizedNews[category.name].length < MAX_PER_CATEGORY
        ) {
          seenUrls.add(item.link);
          seenTitles.add(normalizedTitle);
          categorizedNews[category.name].push(item);
        }
      }
    }
  }

  // 당사 이슈: CU 또는 BGF리테일이 제목에 포함된 기사만 AI에 전달
  categorizedNews['당사 이슈'] = categorizedNews['당사 이슈'].filter(
    item => item.title.includes('CU') || item.title.includes('BGF리테일')
  );

  // 경쟁사 이슈: 브랜드별 제목 필터링 후 각 최대 5개씩 전달
  const competitorBrands = ['GS25', '세븐일레븐', '이마트24'];
  categorizedNews['경쟁사 이슈'] = competitorBrands.flatMap(brand =>
    categorizedNews['경쟁사 이슈'].filter(item => item.title.includes(brand)).slice(0, 5)
  );

  const promptData = Object.entries(categorizedNews).map(([catName, news]) => {
    return `Category: ${catName}\nNews Articles:\n` +
      news.map((n, i) => `[${i + 1}] Title: ${n.title}\nDescription: ${n.description}\nLink: ${n.link}\nKeyword: ${n.keyword}`).join('\n\n');
  }).join('\n\n====================\n\n');

  const aiResponse = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4000,
    temperature: 0.2,
    system: SYSTEM_PROMPT,
    messages: [
      { role: 'user', content: `Here is the raw news data to analyze:\n\n${promptData}` }
    ]
  });

  const claudeText = aiResponse.content[0].type === 'text' ? aiResponse.content[0].text : '';

  if (!claudeText) {
    throw new Error('Claude API가 빈 응답을 반환했습니다.');
  }

  let parsed: any;
  try {
    parsed = extractAndParseJSON(claudeText);
  } catch (parseError: any) {
    throw new Error(
      `JSON 파싱 실패: ${parseError.message}\n--- Claude 응답 ---\n${claudeText.slice(0, 500)}`
    );
  }

  // 카테고리명 기반 매칭 및 순서 정렬 (AI 출력 순서와 무관하게 안전하게 처리)
  parsed.categories = CATEGORIES.map(cat => {
    const found = (parsed.categories || []).find(
      (c: any) => typeof c.name === 'string' && c.name.trim() === cat.name
    );
    return found ? { ...found, name: cat.name } : { name: cat.name, issues: [] };
  });

  // articleIndices → articleCount 변환 + relatedLinks 없는 이슈 제거
  for (const category of (parsed.categories || [])) {
    for (const issue of (category.issues || [])) {
      issue.articleCount = Array.isArray(issue.articleIndices) ? issue.articleIndices.length : 0;
    }
    category.issues = (category.issues || []).filter(
      (issue: any) => Array.isArray(issue.relatedLinks) && issue.relatedLinks.length > 0
    );
  }

  // 최종 링크 dedup
  const seenFinalUrls = new Set<string>();
  for (const category of (parsed.categories || [])) {
    for (const issue of (category.issues || [])) {
      const uniqueLinks = [];
      for (const link of (issue.relatedLinks || [])) {
        if (!seenFinalUrls.has(link.url)) {
          seenFinalUrls.add(link.url);
          uniqueLinks.push(link);
        }
      }
      issue.relatedLinks = uniqueLinks;
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    summary: parsed.summary || [],
    categories: parsed.categories || [],
  };
}
