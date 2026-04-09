import * as cdk from 'aws-cdk-lib';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';

/**
 * QueueConstruct — File de messages SQS pour le traitement asynchrone
 *
 * Flux :
 *   Lambda API → envoie message "PROCESS_ORDER" → SQS Queue
 *   Lambda Worker (futur) → consomme et traite la commande
 *
 * Dead Letter Queue (DLQ) :
 *   Si un message échoue 3 fois → déplacé en DLQ
 *   Les messages en DLQ sont conservés 14 jours pour diagnostic
 *
 * Visibility Timeout :
 *   Temps pendant lequel un message est "invisible" pendant le traitement.
 *   Doit être > timeout de la Lambda Worker (on met 5 min).
 */
export class QueueConstruct extends Construct {
  /** Queue principale de traitement des commandes */
  public readonly queue: sqs.Queue;

  /** Dead Letter Queue pour les messages en échec */
  public readonly deadLetterQueue: sqs.Queue;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    // ─── Dead Letter Queue ────────────────────────────────────────────────────
    // Reçoit les messages qui ont échoué maxReceiveCount fois
    this.deadLetterQueue = new sqs.Queue(this, 'DeadLetterQueue', {
      queueName: 'order-processing-dlq',

      // Conservation longue pour analyse post-mortem
      retentionPeriod: cdk.Duration.days(14),

      // Chiffrement côté serveur (bonne pratique)
      encryption: sqs.QueueEncryption.SQS_MANAGED,
    });

    // ─── Queue principale ─────────────────────────────────────────────────────
    this.queue = new sqs.Queue(this, 'OrderQueue', {
      queueName: 'order-processing-queue',

      // Visibility timeout : 5 min (doit dépasser le timeout du consumer Lambda)
      visibilityTimeout: cdk.Duration.minutes(5),

      // Conservation des messages non consommés : 4 jours
      retentionPeriod: cdk.Duration.days(4),

      // Délai de livraison : 0 (immédiat)
      deliveryDelay: cdk.Duration.seconds(0),

      // Chiffrement
      encryption: sqs.QueueEncryption.SQS_MANAGED,

      // Redirection vers DLQ après 3 échecs de traitement
      deadLetterQueue: {
        queue: this.deadLetterQueue,
        maxReceiveCount: 3,
      },
    });

    // ─── Outputs ──────────────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'QueueUrl', {
      value: this.queue.queueUrl,
      description: 'URL de la queue SQS principale',
      exportName: 'OrderApi-SqsQueueUrl',
    });

    new cdk.CfnOutput(this, 'DlqUrl', {
      value: this.deadLetterQueue.queueUrl,
      description: 'URL de la Dead Letter Queue',
      exportName: 'OrderApi-SqsDlqUrl',
    });
  }
}
