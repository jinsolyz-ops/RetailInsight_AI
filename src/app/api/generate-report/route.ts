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

const categories = [
  { name: '경쟁사', keywords: ['GS25', '세븐일레븐', '이마트24'] },
  { name: '상품', keywords: ['편의점 신상품', '편의점 간편식', '편의점 디저트', '유통업계 식품', '외식 트렌드', '식음료 트렌드', 'HMR 트렌드'] },
];
