import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CommonModule } from '../common/common.module';
import { CommissionsModule } from '../commissions/commissions.module';
import { AiAccuracyReportService } from './ai-accuracy-report.service';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
	imports: [AuthModule, CommonModule, CommissionsModule],
	controllers: [ReportsController],
	// AI-03: AiAccuracyReportService only needs TenantContextService (global,
	// TenantModule) — no WhatsappModule/RecordSuggestionsModule/MayaModule import;
	// it queries their tables directly, same convention as ReportsService itself.
	providers: [ReportsService, AiAccuracyReportService],
	// AI-11a: Maya'nın `openBalances` / `periodSummary` / `untouchedContacts` araçları
	// bu servisi yeniden kullanıyor (yeni sorgu yazılmadı).
	exports: [ReportsService]
})
export class ReportsModule {}
