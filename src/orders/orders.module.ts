import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { Order } from './entities/order.entity';
import { AuditModule } from '../audit/audit.module';

/**
 * Module Orders
 * 
 * Fournit:
 * - OrdersController: Endpoints REST
 * - OrdersService: Logique métier
 * - Order Entity: Mapping TypeORM
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Order]),
    AuditModule,
  ],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
