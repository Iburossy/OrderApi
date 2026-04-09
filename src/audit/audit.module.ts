import { Module } from '@nestjs/common';
import { AuditService } from './audit.service';

/**
 * Module Audit
 * 
 * Fournit le service de logging d'événements dans DynamoDB
 * Utilisé par OrdersModule pour tracer les opérations
 */
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
