import { Injectable, Logger } from '@nestjs/common';
import * as AWS from 'aws-sdk';

/**
 * Service d'audit pour le logging d'événements
 * 
 * Stocke les événements dans DynamoDB avec:
 * - Pattern clé composite (PK/SK)
 * - TTL pour nettoyage automatique
 * - Index GSI pour requêtes par orderId
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);
  private readonly dynamodb: AWS.DynamoDB.DocumentClient;
  private readonly tableName: string;

  constructor() {
    this.dynamodb = new AWS.DynamoDB.DocumentClient({
      region: process.env.AWS_REGION || 'us-east-1',
    });
    this.tableName = process.env.DYNAMODB_TABLE || 'order-audit-events';
  }

  /**
   * Logger un événement générique
   * 
   * @param params Paramètres de l'événement
   * @returns Promise<void>
   */
  async logEvent(params: {
    entityType: string;
    entityId: string;
    eventType: string;
    timestamp: string;
    data: Record<string, any>;
    ttlDays?: number;
  }): Promise<void> {
    const { entityType, entityId, eventType, timestamp, data, ttlDays = 90 } = params;

    try {
      await this.dynamodb
        .put({
          TableName: this.tableName,
          Item: {
            PK: `${entityType}#${entityId}`,
            SK: `EVENT#${eventType}#${timestamp}`,
            entityType,
            entityId,
            eventType,
            timestamp,
            ...data,
            // TTL: nettoyage automatique après N jours
            ttl: Math.floor(Date.now() / 1000) + ttlDays * 24 * 60 * 60,
          },
        })
        .promise();

      this.logger.log(`[AUDIT] ${eventType} - ${entityType}:${entityId}`);
    } catch (error) {
      this.logger.error(
        `Échec du logging audit: ${error.message}`,
        error.stack,
      );
      // Ne pas propager l'erreur pour ne pas bloquer le flux principal
    }
  }

  /**
   * Récupérer l'historique des événements d'une entité
   * 
   * @param entityType Type d'entité (ex: ORDER)
   * @param entityId ID de l'entité
   * @returns Liste des événements
   */
  async getEntityHistory(
    entityType: string,
    entityId: string,
  ): Promise<AWS.DynamoDB.DocumentClient.AttributeMap[]> {
    try {
      const result = await this.dynamodb
        .query({
          TableName: this.tableName,
          KeyConditionExpression: 'PK = :pk',
          ExpressionAttributeValues: {
            ':pk': `${entityType}#${entityId}`,
          },
          ScanIndexForward: false, // Plus récent d'abord
        })
        .promise();

      return result.Items || [];
    } catch (error) {
      this.logger.error(
        `Erreur récupération historique: ${error.message}`,
        error.stack,
      );
      return [];
    }
  }

  /**
   * Rechercher par orderId via le GSI
   * 
   * @param orderId ID de la commande
   * @returns Événements associés à cette commande
   */
  async getEventsByOrderId(
    orderId: string,
  ): Promise<AWS.DynamoDB.DocumentClient.AttributeMap[]> {
    try {
      const result = await this.dynamodb
        .query({
          TableName: this.tableName,
          IndexName: 'OrderIdIndex',
          KeyConditionExpression: 'orderId = :orderId',
          ExpressionAttributeValues: {
            ':orderId': orderId,
          },
          ScanIndexForward: false,
        })
        .promise();

      return result.Items || [];
    } catch (error) {
      this.logger.error(
        `Erreur récupération par orderId: ${error.message}`,
        error.stack,
      );
      return [];
    }
  }
}
