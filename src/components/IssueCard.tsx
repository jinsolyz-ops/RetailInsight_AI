import { ExternalLink } from 'lucide-react';

interface Link {
  title: string;
  url: string;
}

interface Issue {
  emoji?: string;
  title: string;
  summary: string;
  articleCount: number;
  relatedLinks: Link[];
}

export default function IssueCard({ issue }: { issue: Issue }) {
  const indexPercentage = Math.min((issue.articleCount / 20) * 100, 100);

  return (
    <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow duration-200 flex flex-col gap-3">
      {/* 헤더 */}
      <div className="flex items-start gap-3">
        {issue.emoji && <span className="text-2xl leading-none shrink-0 mt-0.5">{issue.emoji}</span>}
        <h3 className="text-sm font-bold text-slate-900 leading-snug">{issue.title}</h3>
      </div>

      {/* 요약 */}
      <p className="text-sm text-slate-500 leading-relaxed flex-1">{issue.summary}</p>

      {/* 관심도 */}
      <div className="space-y-1">
        <div className="flex justify-between items-center">
          <span className="text-xs text-slate-400">관심도</span>
          <span className="text-xs font-bold text-[#00A651]">{Math.round(indexPercentage)}%</span>
        </div>
        <div className="w-full bg-slate-100 rounded-full h-1">
          <div className="bg-[#00A651] h-1 rounded-full" style={{ width: `${indexPercentage}%` }} />
        </div>
      </div>

      {/* 링크 */}
      {issue.relatedLinks?.length > 0 && (
        <ul className="space-y-1.5 border-t border-slate-100 pt-3">
          {issue.relatedLinks.map((link, idx) => (
            <li key={idx}>
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-[#00A651] transition-colors group"
              >
                <ExternalLink className="w-3 h-3 shrink-0" />
                <span className="line-clamp-1 group-hover:underline">{link.title}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
