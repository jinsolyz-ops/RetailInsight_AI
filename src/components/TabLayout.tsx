'use client';

import { useState } from 'react';
import { Newspaper, BarChart2 } from 'lucide-react';
import ReportDisplay from '@/components/ReportDisplay';
import type { ReportData } from '@/lib/report';

const TABS = [
  { id: 'report', label: '뉴스 리포트', icon: Newspaper },
  { id: 'dashboard', label: '브랜드 모니터링', icon: BarChart2 },
] as const;

type TabId = typeof TABS[number]['id'];

export default function TabLayout({ report }: { report: ReportData | null }) {
  const [activeTab, setActiveTab] = useState<TabId>('report');

  return (
    <>
      <div className="border-b border-slate-200 mb-8">
        <nav className="flex gap-1">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-colors ${
                activeTab === id
                  ? 'border-[#00A651] text-[#00A651]'
                  : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === 'report' && <ReportDisplay report={report} />}

      {activeTab === 'dashboard' && (
        <iframe
          src="/brand-dashboard.html"
          className="w-full rounded-2xl border border-slate-200 shadow-sm"
          style={{ height: 'calc(100vh - 180px)', minHeight: 600 }}
          title="브랜드 모니터링 대시보드"
        />
      )}
    </>
  );
}
