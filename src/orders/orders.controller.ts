import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Headers,
  Logger,
  Get,
  Param,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';

/**
 * Contrôleur des commandes
 * 
 * Routes:
 * - POST /orders: Créer une nouvelle commande
 * - GET /orders/:id: Récupérer une commande par ID
 * - GET /health: Health check
 * 
 * Gestion des idempotency keys via header X-Idempotency-Key
 */
@Controller()
export class OrdersController {
  private readonly logger = new Logger(OrdersController.name);

  constructor(private readonly ordersService: OrdersService) {}

  /**
   * Créer une nouvelle commande
   * 
   * Flux:
   * 1. Vérifie l'idempotence (si clé fournie)
   * 2. Crée la commande en RDS
   * 3. Log l'événement en DynamoDB
   * 4. Envoie le message dans SQS
   * 
   * @param createOrderDto Données de la commande
   * @param idempotencyKey Header optionnel pour l'idempotence
   * @returns La commande créée avec son ID
   */
  @Post('orders')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() createOrderDto: CreateOrderDto,
    @Headers('x-idempotency-key') idempotencyKey?: string,
  ) {
    this.logger.log(`Création d'une commande pour ${createOrderDto.customerEmail}`);

    // Utilise la clé du header Idempotency-Key
    const finalIdempotencyKey = idempotencyKey;

    const order = await this.ordersService.create(createOrderDto, finalIdempotencyKey);

    return {
      success: true,
      data: {
        id: order.id,
        customerEmail: order.customerEmail,
        customerName: order.customerName,
        shippingAddress: order.shippingAddress,
        totalAmount: parseFloat(order.totalAmount.toString()),
        items: order.items,
        status: order.status,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
      },
      message: 'Commande créée avec succès',
      idempotencyKey: finalIdempotencyKey || null,
    };
  }

  /**
   * Récupérer une commande par son ID
   * Utile pour le polling du statut
   * 
   * @param id ID de la commande (UUID)
   * @returns La commande si trouvée
   */
  @Get('orders/:id')
  async findOne(@Param('id') id: string) {
    this.logger.log(`Récupération de la commande ${id}`);
    
    const order = await this.ordersService.findOne(id);

    return {
      success: true,
      data: {
        id: order.id,
        customerEmail: order.customerEmail,
        customerName: order.customerName,
        shippingAddress: order.shippingAddress,
        totalAmount: parseFloat(order.totalAmount.toString()),
        items: order.items,
        status: order.status,
        processingResult: order.processingResult,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        processedAt: order.processedAt,
      },
    };
  }

  /**
   * Health check pour monitoring
   * Vérifie la connectivité RDS et DynamoDB
   */
  @Get('health')
  async health() {
    const health = await this.ordersService.checkHealth();
    
    return {
      status: health.healthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      checks: {
        database: health.database ? 'connected' : 'disconnected',
        dynamodb: health.dynamodb ? 'connected' : 'disconnected',
        sqs: health.sqs ? 'connected' : 'disconnected',
      },
    };
  }
}
