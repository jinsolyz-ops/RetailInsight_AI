import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

const CATEGORIES = [
  { name: '유통 트렌드', keywords: ['유통업계 동향', '커머스 트렌드', '편의점 트렌드'] },
  { name: 'AI 트렌드', keywords: ['유통업계 AI', '커머스 AI', '리테일테크'] },
  { name: '당사 이슈', keywords: ['CU편의점', 'BGF리테일'] },
  { name: '경쟁사', keywords: ['GS25', '세븐일레븐', '이마트24'] },
  { name: '상품', keywords: ['편의점 디저트', '편의점 간편식', '편의점 신상품'] },
];

async function fetchNaverNews(keyword: string) {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('Naver API keys are missing.');
  }

  const url = `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(keyword)}&display=30&sort=date`;
  const response = await fetch(url, {
    headers: {
      'X-Naver-Client-Id': clientId,
      'X-Naver-Client-Secret': clientSecret,
    },
  });

  if (!response.ok) {
    console.error(`Failed to fetch Naver news for ${keyword}: ${response.statusText}`);
    return [];
  }

  const data = await response.json();
  
  // Filter for last 7 days (return all valid, dedupe globally later)
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  
  const filteredItems = (data.items || []).filter((item: any) => {
    const pubDate = new Date(item.pubDate);
    return pubDate >= sevenDaysAgo;
  });
  
  return filteredItems.map((item: any) => ({
    title: item.title.replace(/<[^>]*>?/g, '').replace(/&quot;/g, "'").replace(/&amp;/g, '&').replace(/"/g, "'"), // Strip HTML and convert double quotes to single quotes
    link: item.link,
    description: item.description.replace(/<[^>]*>?/g, '').replace(/&quot;/g, "'").replace(/&amp;/g, '&').replace(/"/g, "'"),
    pubDate: item.pubDate,
    keyword: keyword
  }));
}

export async function POST() {
  try {
    // 1. Fetch all news sequentially to prevent Naver API burst rate limit errors
    const fetchTasks = CATEGORIES.flatMap(category => 
      category.keywords.map(keyword => () => fetchNaverNews(keyword))
    );
    
    const results = [];
    for (const task of fetchTasks) {
      results.push(await task());
      // slight delay to be safe
      await new Promise(r => setTimeout(r, 100));
    }
    const flatResults = results.flat();

    // Global Deduplication based on article link
    const globalUniqueUrls = new Set();
    const dedupedResults = flatResults.filter((item: any) => {
      if (globalUniqueUrls.has(item.link)) return false;
      globalUniqueUrls.add(item.link);
      return true;
    });

    const categorizedNews: { [key: string]: any[] } = {};
    CATEGORIES.forEach(c => categorizedNews[c.name] = []);
    
    // Group deduped results by category and limit to top 15 per category to save tokens
    dedupedResults.forEach((item: any) => {
      const category = CATEGORIES.find(c => c.keywords.includes(item.keyword));
      if (category && categorizedNews[category.name].length < 15) {
        categorizedNews[category.name].push(item);
      }
    });

    // 2. Prepare Claude Prompt
    const promptData = Object.entries(categorizedNews).map(([catName, news]) => {
      return `Category: ${catName}\nNews Articles:\n` + news.map((n, i) => `[${i+1}] Title: ${n.title}\nDescription: ${n.description}\nLink: ${n.link}\nKeyword: ${n.keyword}`).join('\n\n');
    }).join('\n\n====================\n\n');

    const systemPrompt = `You are an expert business analyst for a retail company.
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

    // 3. Call Claude API
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 4000,
      temperature: 0.2,
      system: systemPrompt,
      messages: [
        { role: "user", content: `Here is the raw news data to analyze:\n\n${promptData}` }
      ]
    });

    const claudeText = response.content[0].type === 'text' ? response.content[0].text : '';
    
    // Attempt to extract and parse JSON robustly
    let finalJson;
    try {
      const firstBrace = claudeText.indexOf('{');
      const lastBrace = claudeText.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        let jsonStr = claudeText.substring(firstBrace, lastBrace + 1);
        
        // Sanitize: remove literal newlines/control chars which break JSON.parse, and fix trailing commas
        jsonStr = jsonStr.replace(/[\n\r\t]+/g, ' '); 
        jsonStr = jsonStr.replace(/,\s*([}\]])/g, '$1');
        
        finalJson = JSON.parse(jsonStr);
        // Post-process to ensure no duplicate links exist in the final UI
        const seenUrls = new Set<string>();
        for (const category of (finalJson.categories || [])) {
          for (const issue of (category.issues || [])) {
            const uniqueLinks = [];
            for (const link of (issue.relatedLinks || [])) {
              if (!seenUrls.has(link.url)) {
                seenUrls.add(link.url);
                uniqueLinks.push(link);
              }
            }
            issue.relatedLinks = uniqueLinks;
          }
        }
      } else {
        throw new Error("No JSON object found in the response.");
      }
    } catch (parseError: any) {
      console.error("Failed to parse Claude output as JSON:", parseError.message);
      console.error("Raw string:", claudeText);
      return NextResponse.json({ error: "AI가 리포트 구조를 만드는 데 실패했습니다. 다시 시도해주세요." }, { status: 500 });
    }

    return NextResponse.json(finalJson);
  } catch (error: any) {
    console.error("Error generating report:", error);
    return NextResponse.json({ error: `오류가 발생했습니다: ${error.message}` }, { status: 500 });
  }
}
