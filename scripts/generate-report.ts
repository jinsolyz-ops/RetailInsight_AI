import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import * as fs from 'fs';
import * as path from 'path';
import { generateReport } from '../src/lib/report';

async function main() {
  console.log('리포트 생성 시작...');

  const report = await generateReport();

  const outputPath = path.join(process.cwd(), 'data', 'report.json');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf-8');

  console.log(`리포트 저장 완료: ${outputPath}`);
  console.log(`생성 시각: ${report.generatedAt}`);
}

main().catch(err => {
  console.error('리포트 생성 실패:', err);
  process.exit(1);
});
