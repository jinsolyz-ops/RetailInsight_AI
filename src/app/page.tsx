import { readFileSync } from 'fs';
import path from 'path';
import { Newspaper } from 'lucide-react';
import TabLayout from '@/components/TabLayout';
import type { ReportData } from '@/lib/report';

function getReport(): ReportData | null {
  try {
    const filePath = path.join(process.cwd(), 'data', 'report.json');
    const raw = readFileSync(filePath, 'utf-8');
    const data = JSON.parse(raw);
    if (!data.categories?.length) return null;
    return data as ReportData;
  } catch {
    return null;
  }
}

export default function Home() {
  const report = getReport();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-indigo-100 selection:text-indigo-900">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center">
          <div className="flex items-center gap-2 text-[#00A651]">
            <Newspaper className="w-6 h-6" />
            <h1 className="text-xl font-bold tracking-tight">News Summary</h1>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <TabLayout report={report} />
      </main>
    </div>
  );
}
