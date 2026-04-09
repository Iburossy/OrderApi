import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

/**
 * DynamoDbConstruct — Table d'audit des événements de commandes
 *
 * Schéma de clés (Single Table Design) :
 *   PK  = "ORDER#<orderId>"         (Partition Key)
 *   SK  = "EVENT#<type>#<timestamp>" (Sort Key)
 *
 * Exemples de données :
 *   PK: ORDER#abc-123  SK: EVENT#CREATED#2024-01-15T10:00:00Z
 *   PK: ORDER#abc-123  SK: EVENT#PROCESSED#2024-01-15T10:01:00Z
 *
 * TTL : attribut "ttl" (epoch Unix) — suppression automatique après 90 jours
 *
 * Billing : PAY_PER_REQUEST (serverless, pas de capacité à provisionner)
 */
export class DynamoDbConstruct extends Construct {
  /** La table DynamoDB d'audit */
  public readonly table: dynamodb.Table;

  /** Nom de la table (utilisé comme variable d'env dans la Lambda) */
  public readonly tableName: string;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    // ─── Table ────────────────────────────────────────────────────────────────
    this.table = new dynamodb.Table(this, 'AuditTable', {
      tableName: 'order-audit-events',

      // Clé primaire composite : PK + SK
      partitionKey: {
        name: 'PK',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'SK',
        type: dynamodb.AttributeType.STRING,
      },

      // Serverless : facturation à la requête (pas de capacité fixe)
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,

      // TTL : DynamoDB supprime automatiquement les items expirés
      timeToLiveAttribute: 'ttl',

      // Point-in-time recovery : permet de restaurer la table à n'importe quel
      // moment des 35 derniers jours (recommandé en prod)
      pointInTimeRecovery: true,

      // En dev : supprime la table avec le stack
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    this.tableName = this.table.tableName;

    // ─── Index GSI (optionnel) ────────────────────────────────────────────────
    // Permet de requêter tous les événements d'un type donné
    // ex: "tous les ORDER_CREATED de la journée"
    this.table.addGlobalSecondaryIndex({
      indexName: 'EventTypeIndex',
      partitionKey: {
        name: 'eventType',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'timestamp',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Output
    new cdk.CfnOutput(this, 'TableName', {
      value: this.table.tableName,
      description: 'Nom de la table DynamoDB d\'audit',
      exportName: 'OrderApi-DynamoTableName',
    });
  }
}
