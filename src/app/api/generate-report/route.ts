import { NextResponse } from 'next/server';
import { generateReport } from '@/lib/report';

export async function POST() {
  try {
    const report = await generateReport();
    return NextResponse.json(report);
  } catch (error: any) {
    console.error('Error generating report:', error);
    return NextResponse.json({ error: `오류가 발생했습니다: ${error.message}` }, { status: 500 });
  }
}


