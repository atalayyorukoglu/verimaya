import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CommonModule } from '../common/common.module';
import { CommissionsModule } from '../commissions/commissions.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
	imports: [AuthModule, CommonModule, CommissionsModule],
	controllers: [ReportsController],
	providers: [ReportsService],
	// AI-11a: Maya'nın `openBalances` / `periodSummary` / `untouchedContacts` araçları
	// bu servisi yeniden kullanıyor (yeni sorgu yazılmadı).
	exports: [ReportsService]
})
export class ReportsModule {}
