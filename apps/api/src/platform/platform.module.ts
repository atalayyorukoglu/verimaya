import { Module } from "@nestjs/common";
import { TenantModule } from "../tenant/tenant.module";
import { PlatformAdminGuard } from "./platform-admin.guard";
import { PlatformController } from "./platform.controller";
import { PlatformService } from "./platform.service";

@Module({
  imports: [TenantModule],
  controllers: [PlatformController],
  providers: [PlatformService, PlatformAdminGuard],
  exports: [PlatformService],
})
export class PlatformModule {}
