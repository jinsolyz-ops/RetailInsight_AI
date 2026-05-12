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
  categories: Category[];
}

const CATEGORIES = [
  { name: '유통 트렌드', keywords: ['유통업계 동향', '커머스 트렌드', '편의점 트렌드', '유통업계', '유통 이슈', '이커머스 이슈'] },
  { name: 'AI 트렌드', keywords: ['유통업계 AI', '커머스 AI', '리테일테크'] },
  { name: '당사 이슈', keywords: ['CU편의점', 'BGF리테일'] },
  { name: '경쟁사', keywords: ['GS25', '세븐일레븐', '이마트24'] },
  { name: '상품', keywords: ['편의점 디저트', '편의점 간편식', '편의점 신상품', '편의점 콜라보', '편의점 음료', '편의점 도시락', '유통 콜라보', '유통 PB상품'] },
];

const CONCURRENCY = 3;
const BATCH_DELAY_MS = 500;
const MAX_RETRIES = 2;
const NEWS_DAYS = 2;
const MAX_PER_KEYWORD = 5;
const MAX_PER_CATEGORY = 10;

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

const SYSTEM_PROMPT = `You are an expert business analyst for a retail company.
Your task is to analyze recent news articles grouped by categories and generate a structured summary report.
Ensure the report is written in professional Korean.
You MUST be very concise to avoid output truncation.

CRITICAL INSTRUCTIONS:
- DO NOT hallucinate. You MUST base your summary ONLY on the provided articles. If an article doesn't explicitly mention the trend, ignore it.
- ABSOLUTELY DO NOT mention "물가안정 프로젝트" or anything similar unless it is explicitly in the news text. This is a known hallucination.
- If a category has no relevant articles, output an empty array [] for its issues. Do not invent issues.
- EVEN IF ALL CATEGORIES ARE EMPTY, YOU MUST RETURN THE FULL JSON STRUCTURE WITH EMPTY ARRAYS. NEVER output conversational text.
- You MUST output exactly 5 categories matching the input. Do not omit any category like '상품'.
- Each link MUST be used exactly ONCE across the entire report. Do not duplicate links.
- IMPORTANCE RANKING LOGIC: You must analyze the articles to determine the "truly important" issues. An issue is important if it has a high volume of related articles (heavy press coverage) OR if it represents a major strategic business shift in the retail industry.
- For the '경쟁사' category, you MUST output EXACTLY 3 issues: one for 'GS25', one for '세븐일레븐', and one for '이마트24'. For each competitor, select their single MOST IMPORTANT news event of the week based on press coverage volume and industry impact.
- For the '상품' category, prioritize structural consumer trends (e.g., small-portion '소분' products, new formats) over simple temporary discount/promo events.
- For all other categories (including 'AI 트렌드'), identify 1 to 2 issues. Rank all potential events by their importance (article volume and business impact) and only output the top events.
- Consolidate multiple articles discussing the exact same event into a single issue.
- STRICTLY EXCLUDE any news about cryptocurrency, blockchain, or generic global payment apps (e.g., Oobit) that are unrelated to domestic traditional retail.
- STRICTLY EXCLUDE negative corporate news such as restructuring (구조조정), layoffs, voluntary resignation (희망퇴직), or scandals. Focus ONLY on forward-looking business strategies, new retail formats, services, and positive innovations.

For each issue, you must provide:
1. title: A VERY concise title (max 15 chars) that will fit on one line, using an actual event or keyword.
2. summary: A 1-sentence factual summary based ONLY on the articles.
3. articleCount: The estimated number of articles that discuss this specific issue.
4. relatedLinks: A list of 1 to 2 relevant article links. Provide 2 links if possible, 1 if not enough articles.
5. emoji: A single relevant emoji representing the issue. If the issue is about '우베' (Ube), use the 💜 emoji.

Output STRICTLY in the following JSON schema without any markdown formatting or extra text.
{
  "categories": [
    {
      "name": "Category Name",
      "issues": [
        {
          "emoji": "🔥",
          "title": "Issue Title",
          "summary": "Issue Summary...",
          "articleCount": 5,
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

  const seenUrls = new Set<string>();
  const seenTitles = new Set<string>();
  const categorizedNews: { [key: string]: any[] } = {};
  CATEGORIES.forEach(c => { categorizedNews[c.name] = []; });

  for (const category of CATEGORIES) {
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

  const promptData = Object.entries(categorizedNews).map(([catName, news]) => {
    return `Category: ${catName}\nNews Articles:\n` +
      news.map((n, i) => `[${i + 1}] Title: ${n.title}\nDescription: ${n.description}\nLink: ${n.link}\nKeyword: ${n.keyword}`).join('\n\n');
  }).join('\n\n====================\n\n');

  const aiResponse = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
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
    categories: parsed.categories || [],
  };
}
