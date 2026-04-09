import {
  Injectable,
  Logger,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order, OrderStatus } from './entities/order.entity';
import { CreateOrderDto } from './dto/create-order.dto';
import { AuditService } from '../audit/audit.service';
import * as AWS from 'aws-sdk';

/**
 * Service de gestion des commandes
 * 
 * Responsabilités:
 * - Création de commandes avec idempotence
 * - Envoi des messages SQS
 * - Logging des événements
 * - Gestion des statuts
 */
@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);
  private readonly sqs: AWS.SQS;
  private readonly queueUrl: string;
  private readonly dynamodb: AWS.DynamoDB.DocumentClient;

  constructor(
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
    private auditService: AuditService,
  ) {
    // Initialisation lazy des services AWS (optimisation cold start)
    this.sqs = new AWS.SQS({
      region: process.env.AWS_REGION || 'us-east-1',
    });
    
    this.dynamodb = new AWS.DynamoDB.DocumentClient({
      region: process.env.AWS_REGION || 'us-east-1',
    });
    
    this.queueUrl = process.env.SQS_QUEUE_URL || '';
  }

  /**
   * Créer une nouvelle commande avec gestion d'idempotence
   * 
   * @param createOrderDto Données de la commande
   * @param idempotencyKey Clé d'idempotence optionnelle
   * @returns Order créée
   */
  async create(
    createOrderDto: CreateOrderDto,
    idempotencyKey?: string,
  ): Promise<Order> {
    // Vérification de l'idempotence
    if (idempotencyKey) {
      const existingOrder = await this.findByIdempotencyKey(idempotencyKey);
      if (existingOrder) {
        this.logger.log(`Commande existante trouvée pour la clé ${idempotencyKey}`);
        return existingOrder;
      }
    }

    const orderId = this.generateOrderId();
    const timestamp = new Date().toISOString();

    try {
      // 1. Créer la commande en RDS
      const order = this.orderRepository.create({
        id: orderId,
        customerEmail: createOrderDto.customerEmail,
        customerName: createOrderDto.customerName,
        shippingAddress: createOrderDto.shippingAddress,
        totalAmount: createOrderDto.totalAmount,
        items: createOrderDto.items,
        status: OrderStatus.PENDING,
        idempotencyKey: idempotencyKey || null,
      });

      await this.orderRepository.save(order);
      this.logger.log(`Commande ${orderId} créée en RDS`);

      // 2. Logger l'événement en DynamoDB (fire-and-forget avec gestion d'erreur)
      this.logOrderCreated(order, timestamp).catch((error) => {
        this.logger.error(`Erreur de logging audit: ${error.message}`, error.stack);
      });

      // 3. Envoyer le message dans SQS
      await this.sendToQueue(orderId);
      this.logger.log(`Message SQS envoyé pour la commande ${orderId}`);

      return order;
    } catch (error) {
      this.logger.error(`Erreur lors de la création de la commande: ${error.message}`, error.stack);
      
      if (error.code === '23505') { // Violation de contrainte unique PostgreSQL
        throw new ConflictException('Une commande avec cette clé d\'idempotence existe déjà');
      }
      
      throw new ServiceUnavailableException('Impossible de créer la commande. Veuillez réessayer.');
    }
  }

  /**
   * Récupérer une commande par son ID
   * @param id UUID de la commande
   */
  async findOne(id: string): Promise<Order> {
    const order = await this.orderRepository.findOne({ where: { id } });
    
    if (!order) {
      throw new NotFoundException(`Commande ${id} non trouvée`);
    }
    
    return order;
  }

  /**
   * Rechercher une commande par clé d'idempotence
   * @param idempotencyKey Clé d'idempotence
   */
  private async findByIdempotencyKey(idempotencyKey: string): Promise<Order | null> {
    return this.orderRepository.findOne({
      where: { idempotencyKey },
    });
  }

  /**
   * Logger l'événement de création en DynamoDB
   * Pattern: Event Sourcing / Audit Logging
   */
  private async logOrderCreated(order: Order, timestamp: string): Promise<void> {
    const tableName = process.env.DYNAMODB_TABLE || 'order-audit-events';
    
    const params = {
      TableName: tableName,
      Item: {
        PK: `ORDER#${order.id}`,
        SK: `EVENT#CREATED#${timestamp}`,
        orderId: order.id,
        eventType: 'ORDER_CREATED',
        timestamp,
        customerEmail: order.customerEmail,
        totalAmount: order.totalAmount,
        items: JSON.stringify(order.items),
        status: order.status,
        // TTL: 90 jours de rétention
        ttl: Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60,
      },
    };

    await this.dynamodb.put(params).promise();
    this.logger.log(`Événement audit créé pour ${order.id}`);
  }

  /**
   * Envoyer un message dans SQS pour traitement asynchrone
   * @param orderId ID de la commande à traiter
   */
  private async sendToQueue(orderId: string): Promise<void> {
    if (!this.queueUrl) {
      throw new Error('SQS_QUEUE_URL non configuré');
    }

    const params: AWS.SQS.SendMessageRequest = {
      QueueUrl: this.queueUrl,
      MessageBody: JSON.stringify({
        orderId,
        timestamp: new Date().toISOString(),
        action: 'PROCESS_ORDER',
      }),
      // Déduplication pour les messages avec le même orderId (FIFO optionnel)
      MessageAttributes: {
        OrderId: {
          DataType: 'String',
          StringValue: orderId,
        },
      },
    };

    await this.sqs.sendMessage(params).promise();
  }

  /**
   * Générer un ID unique pour la commande
   * Format: UUID v4 pur (compatible PostgreSQL UUID)
   */
  private generateOrderId(): string {
    const uuid = require('uuid');
    return uuid.v4();
  }

  /**
   * Health check - vérifie les connexions aux services
   */
  async checkHealth(): Promise<{ 
    healthy: boolean; 
    database: boolean; 
    dynamodb: boolean; 
    sqs: boolean;
  }> {
    const results = {
      database: false,
      dynamodb: false,
      sqs: false,
      healthy: false,
    };

    try {
      // Test RDS
      await this.orderRepository.query('SELECT 1');
      results.database = true;
    } catch (error) {
      this.logger.error('Health check RDS failed', error.message);
    }

    try {
      // Test DynamoDB (describe table)
      const tableName = process.env.DYNAMODB_TABLE || 'order-audit-events';
      const dynamodbClient = new AWS.DynamoDB({ region: process.env.AWS_REGION || 'us-east-1' });
      await dynamodbClient.describeTable({ TableName: tableName }).promise();
      results.dynamodb = true;
    } catch (error) {
      this.logger.error('Health check DynamoDB failed', error.message);
    }

    try {
      // Test SQS (get queue attributes)
      if (this.queueUrl) {
        await this.sqs.getQueueAttributes({
          QueueUrl: this.queueUrl,
          AttributeNames: ['All'],
        }).promise();
        results.sqs = true;
      }
    } catch (error) {
      this.logger.error('Health check SQS failed', error.message);
    }

    results.healthy = results.database && results.dynamodb && results.sqs;
    return results;
  }
}
