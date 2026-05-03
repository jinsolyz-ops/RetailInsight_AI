import { ExternalLink, Flame } from 'lucide-react';

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
  // Assume a max of 20 for scaling
  const indexPercentage = Math.min((issue.articleCount / 20) * 100, 100);

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col h-full group relative overflow-hidden">
      {/* Top Accent Line */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-[#00A651] opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>

      {/* Top Section: Fixed minimum height to keep index box aligned */}
      <div className="min-h-[140px] mb-2">
        {issue.emoji && <div className="text-3xl mb-3">{issue.emoji}</div>}
        <h3 className="text-xl font-extrabold text-slate-900 mb-3 tracking-tight truncate leading-snug group-hover:text-slate-700 transition-colors">{issue.title}</h3>
        <p className="text-slate-600 text-sm leading-relaxed line-clamp-3">{issue.summary}</p>
      </div>

      {/* Middle Section: Index Box */}
      <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 mb-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center text-xs font-bold text-slate-500 uppercase tracking-wider">
            <Flame className="w-4 h-4 mr-1 text-orange-500" />
            관심도 지수
          </div>
          <span className="text-sm font-black text-[#00A651]">{Math.round(indexPercentage)}%</span>
        </div>
        <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
          <div
            className="bg-[#00A651] h-1.5 rounded-full transition-all duration-1000 ease-out"
            style={{ width: `${indexPercentage}%` }}
          ></div>
        </div>
      </div>

      {/* Links Section */}
      <div>
        {issue.relatedLinks && issue.relatedLinks.length > 0 && (
          <ul className="space-y-2">
            {issue.relatedLinks.map((link, idx) => (
              <li key={idx}>
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center text-sm font-medium text-slate-700 hover:text-[#00A651] transition-colors"
                >
                  <span className="line-clamp-1 border-b border-transparent hover:border-[#00A651] pb-0.5">{link.title}</span>
                  <ExternalLink className="w-3.5 h-3.5 ml-1.5 flex-shrink-0" />
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Bottom Empty Space */}
      <div className="flex-1"></div>
    </div>
  );
}
