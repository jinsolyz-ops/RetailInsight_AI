'use client';

import { useRef } from 'react';
import { toPng } from 'html-to-image';
import IssueCard from '@/components/IssueCard';
import type { ReportData } from '@/lib/report';

const categoryId = (name: string) => `category-${name.replace(/\s+/g, '-')}`;

const scrollTo = (name: string) => {
  const el = document.getElementById(categoryId(name));
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

export default function ReportDisplay({ report }: { report: ReportData | null }) {
  const reportRef = useRef<HTMLDivElement>(null);

  const today = new Date();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  const dayOfWeek = ['일', '월', '화', '수', '목', '금', '토'][today.getDay()];
  const dateStr = `${month}/${day}(${dayOfWeek})`;

  const generatedLabel = report?.generatedAt
    ? new Date(report.generatedAt).toLocaleString('ko-KR', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit',
      })
    : null;

  const handleDownloadImage = async () => {
    if (!reportRef.current) return;
    try {
      const dataUrl = await toPng(reportRef.current, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: '#f8fafc',
      });
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `RetailInsight_${today.getFullYear()}${month}${day}.png`;
      link.click();
    } catch (err) {
      console.error('Failed to capture image', err);
      alert('이미지 캡처에 실패했습니다.');
    }
  };

  if (!report || report.categories.length === 0) {
    return (
      <div className="text-center py-32">
        <div className="w-16 h-16 bg-emerald-50 text-emerald-500 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <span className="text-2xl">📰</span>
        </div>
        <h2 className="text-2xl font-bold text-slate-800 mb-2">아직 생성된 리포트가 없습니다</h2>
        <p className="text-slate-500 max-w-md mx-auto">매일 오전 8시에 자동으로 리포트가 생성됩니다.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700 ease-out">
      {/* 상단 메타 & 저장 버튼 */}
      <div className="flex items-center justify-between">
        {generatedLabel && (
          <p className="text-sm text-slate-400">최종 업데이트: {generatedLabel}</p>
        )}
        <button
          onClick={handleDownloadImage}
          className="ml-auto flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-5 py-2.5 rounded-xl font-bold transition-all shadow-sm hover:shadow-md"
        >
          📸 리포트 저장
        </button>
      </div>

      <div ref={reportRef} className="bg-white rounded-3xl shadow-xl border border-slate-100 p-8 md:p-12 space-y-12">
        {/* 헤더 */}
        <div className="text-center">
          <div className="text-[#00A651] font-bold mb-3 tracking-wide uppercase">{dateStr}</div>
          <h1 className="text-4xl md:text-5xl font-black text-slate-900 mb-6 tracking-tight">Trend Summary</h1>
          <p className="text-slate-500 text-lg md:text-xl max-w-2xl mx-auto leading-relaxed">
            자사/경쟁사 최신 이슈를 한눈에 파악하세요.
          </p>
        </div>

        {/* 카테고리 네비게이션 */}
        <div className="flex flex-wrap justify-center gap-2">
          {report.categories.map((category) => (
            <button
              key={category.name}
              onClick={() => scrollTo(category.name)}
              className="px-4 py-1.5 rounded-full text-sm font-semibold border border-slate-200 text-slate-600 hover:bg-[#00A651] hover:text-white hover:border-[#00A651] transition-all"
            >
              {category.name}
            </button>
          ))}
        </div>

        {/* 3줄 요약 */}
        {report.summary?.length > 0 && (
          <div className="bg-slate-50 rounded-2xl border border-slate-100 px-7 py-6">
            <p className="text-xs font-bold tracking-widest uppercase text-[#00A651] mb-4">3줄 요약</p>
            <ol className="space-y-3">
              {report.summary.map((line, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="w-5 h-5 rounded-full bg-[#00A651] text-white text-xs font-black flex items-center justify-center shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  <span className="text-slate-700 text-sm leading-relaxed">{line}</span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {/* 카테고리별 섹션 */}
        <div className="space-y-12">
          {report.categories.map((category, idx) => (
            <section key={idx} id={categoryId(category.name)} className="scroll-mt-24">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-1 h-5 bg-[#00A651] rounded-full shrink-0" />
                <h2 className="text-xl font-black text-slate-900 tracking-tight">{category.name}</h2>
                <div className="flex-1 h-px bg-slate-200" />
              </div>

              <div className={`grid grid-cols-1 ${category.name === '경쟁사 이슈' ? 'md:grid-cols-3' : 'md:grid-cols-2'} gap-6 lg:gap-8`}>
                {category.issues.map((issue, issueIdx) => (
                  <IssueCard key={issueIdx} issue={issue} />
                ))}
                {category.issues.length === 0 && (
                  <p className="text-slate-400 col-span-full italic text-sm">
                    이 카테고리에 해당하는 주요 이슈가 분석되지 않았습니다.
                  </p>
                )}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
