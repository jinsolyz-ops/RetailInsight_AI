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
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-1.5 mb-8 inline-flex gap-1">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 ${
              activeTab === id
                ? 'bg-[#00A651] text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
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
