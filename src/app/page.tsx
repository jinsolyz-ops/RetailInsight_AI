"use client";

import { useState, useRef } from 'react';
import IssueCard from '@/components/IssueCard';
import { toPng } from 'html-to-image';
import { Newspaper, Loader2, FileText, AlertCircle } from 'lucide-react';

interface Link {
  title: string;
  url: string;
}

interface Issue {
  title: string;
  summary: string;
  articleCount: number;
  relatedLinks: Link[];
}

interface Category {
  name: string;
  issues: Issue[];
}

interface ReportData {
  categories: Category[];
}

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<ReportData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reportRef = useRef<HTMLDivElement>(null);

  const today = new Date();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  const dayOfWeek = ['일', '월', '화', '수', '목', '금', '토'][today.getDay()];
  const dateStr = `${month}/${day}(${dayOfWeek})`;

  const handleDownloadImage = async () => {
    if (!reportRef.current) return;
    try {
      const dataUrl = await toPng(reportRef.current, { 
        cacheBust: true, 
        pixelRatio: 2,
        backgroundColor: '#ffffff'
      });
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `Retail_Report_${today.getFullYear()}${month}${day}.png`;
      link.click();
    } catch (err) {
      console.error('Failed to capture image', err);
      alert('이미지 캡처에 실패했습니다.');
    }
  };

  const generateReport = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/generate-report', {
        method: 'POST',
      });
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || '리포트 생성 중 오류가 발생했습니다.');
      }
      
      setReport(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-indigo-100 selection:text-indigo-900">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[#00A651]">
            <Newspaper className="w-6 h-6" />
            <h1 className="text-xl font-bold tracking-tight">RetailInsight AI</h1>
          </div>
          <button
            onClick={generateReport}
            disabled={loading}
            className="inline-flex items-center justify-center px-4 py-2 bg-[#00A651] text-white rounded-lg font-medium text-sm hover:bg-[#008f46] focus:outline-none focus:ring-2 focus:ring-[#00A651] focus:ring-offset-2 transition-all disabled:opacity-70 disabled:cursor-not-allowed shadow-sm"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                분석 중...
              </>
            ) : (
              <>
                <FileText className="w-4 h-4 mr-2" />
                리포트 생성
              </>
            )}
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {!report && !loading && !error && (
          <div className="text-center py-32">
            <div className="w-16 h-16 bg-indigo-50 text-indigo-500 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <Newspaper className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-bold text-slate-800 mb-2">뉴스 요약 리포트</h2>
            <p className="text-slate-500 max-w-md mx-auto">
              유통 인사이트, 당사 및 경쟁사 이슈, 상품 트렌드에 대한 최신 뉴스 기사를 AI가 분석하여 핵심만 요약해 드립니다.
            </p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 text-red-700 p-4 rounded-lg flex items-start mb-8">
            <AlertCircle className="w-5 h-5 mr-3 mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="font-semibold">오류가 발생했습니다</h3>
              <p className="text-sm mt-1 text-red-600">{error}</p>
            </div>
          </div>
        )}

        {loading && !report && (
          <div className="flex flex-col items-center justify-center py-32 text-slate-400">
            <Loader2 className="w-10 h-10 animate-spin text-indigo-500 mb-4" />
            <p className="font-medium animate-pulse">최신 기사를 수집하고 AI가 분석하고 있습니다...</p>
          </div>
        )}

        {report && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700 ease-out">
            <div className="flex justify-end">
              <button 
                onClick={handleDownloadImage}
                className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-5 py-2.5 rounded-xl font-bold transition-all shadow-sm hover:shadow-md"
              >
                📸 리포트 이미지 저장
              </button>
            </div>
            <div ref={reportRef} className="bg-white rounded-3xl shadow-xl border border-slate-100 p-8 md:p-12 space-y-16">
              <div className="text-center relative">
                <div className="text-[#00A651] font-bold mb-3 tracking-wide uppercase">{dateStr}</div>
                <h1 className="text-4xl md:text-5xl font-black text-slate-900 mb-6 tracking-tight">Trend Summary</h1>
                <p className="text-slate-500 text-lg md:text-xl max-w-2xl mx-auto leading-relaxed">
                  자사/경쟁사 최신 이슈를 한눈에 파악하세요.
                </p>
              </div>

            {report.categories.map((category, idx) => (
              <section key={idx} className="relative mb-16">
                <div className="flex items-center gap-4 mb-8">
                  <h2 className="text-2xl font-black text-slate-900 tracking-tight bg-slate-100 px-5 py-2 rounded-xl border border-slate-200 shadow-sm">{category.name}</h2>
                  <div className="flex-grow h-px bg-gradient-to-r from-slate-200 to-transparent"></div>
                </div>
                
                <div className={`grid grid-cols-1 ${category.name === '경쟁사' ? 'md:grid-cols-3' : 'md:grid-cols-2'} gap-6 lg:gap-8`}>
                  {category.issues.map((issue, issueIdx) => (
                    <IssueCard key={issueIdx} issue={issue} />
                  ))}
                  {category.issues.length === 0 && (
                    <p className="text-slate-400 col-span-full italic">이 카테고리에 해당하는 주요 이슈가 분석되지 않았습니다.</p>
                  )}
                </div>
              </section>
            ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
