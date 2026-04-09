import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export interface LambdaConstructProps {
  vpc: ec2.Vpc;
  securityGroup: ec2.SecurityGroup;
  dbInstance: rds.DatabaseInstance;
  dbName: string;
  sqsQueue: sqs.Queue;
  dynamoTable: dynamodb.Table;
}

/**
 * LambdaConstruct — Fonction Lambda NestJS (handler API)
 *
 * Code source : ../dist-lambda/
 *   (généré par `npm run build` + build-lambda.sh dans le projet NestJS)
 *
 * Layer :
 *   Les node_modules sont dans un Layer séparé pour optimiser les déploiements.
 *   Le Layer est référencé depuis ../layer/
 *
 * Variables d'environnement injectées :
 *   - DB_HOST, DB_PORT, DB_NAME, DB_USERNAME, DB_PASSWORD (depuis Secrets Manager)
 *   - SQS_QUEUE_URL
 *   - DYNAMODB_TABLE
 *   - AWS_REGION (automatiquement présent dans Lambda)
 *   - NODE_ENV=production
 */
export class LambdaConstruct extends Construct {
  /** La fonction Lambda principale */
  public readonly function: lambda.Function;

  constructor(scope: Construct, id: string, props: LambdaConstructProps) {
    super(scope, id);

    const {
      vpc,
      securityGroup,
      dbInstance,
      dbName,
      sqsQueue,
      dynamoTable,
    } = props;

    // ─── Layer node_modules ───────────────────────────────────────────────────
    // Séparer les dépendances dans un Layer permet :
    // - Des déploiements plus rapides (le layer est mis en cache)
    // - Un package de code plus petit (< 50 Mo)
    // Le layer doit avoir été construit via create-layer.sh avant le déploiement
    const dependenciesLayer = new lambda.LayerVersion(this, 'DependenciesLayer', {
      layerVersionName: 'order-api-dependencies',
      code: lambda.Code.fromAsset(
        path.join(__dirname, '../../../layer'),
      ),
      compatibleRuntimes: [lambda.Runtime.NODEJS_20_X],
      description: 'node_modules pour l\'API de commandes NestJS',
    });

    // ─── Fonction Lambda ──────────────────────────────────────────────────────
    this.function = new lambda.Function(this, 'ApiHandler', {
      functionName: 'order-api-handler',
      runtime: lambda.Runtime.NODEJS_20_X,

      // Point d'entrée : dist/main.handler (compilé depuis src/main.ts)
      handler: 'main.handler',

      // Code compilé du projet NestJS (npm run build génère dist/)
      code: lambda.Code.fromAsset(
        path.join(__dirname, '../../../dist-lambda'),
        {
          // Exclure node_modules du code : ils sont dans le Layer
          exclude: ['node_modules'],
        },
      ),

      layers: [dependenciesLayer],

      // Réseau : dans le VPC pour accéder à RDS
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      securityGroups: [securityGroup],

      // Timeout et mémoire
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,

      // Variables d'environnement
      // Les valeurs sensibles (DB password) sont récupérées depuis Secrets Manager
      environment: {
        NODE_ENV: 'production',
        AWS_NODEJS_CONNECTION_REUSE_ENABLED: '1', // Réutilise les connexions HTTP (perf)

        // SQS
        SQS_QUEUE_URL: sqsQueue.queueUrl,

        // DynamoDB
        DYNAMODB_TABLE: dynamoTable.tableName,

        // DB — récupération dynamique depuis Secrets Manager au démarrage
        DB_NAME: dbName,
        DB_PORT: '5432',
        // DB_HOST, DB_USERNAME, DB_PASSWORD sont injectés depuis le secret ci-dessous
      },

      // Logs CloudWatch : 1 semaine de rétention
      logRetention: cdk.aws_logs.RetentionDays.ONE_WEEK,
    });

    // ─── Injection des variables DB ──────────────────────────────────────────
    // DB_HOST : endpoint RDS injecté directement
    // DB_SECRET_ARN : ARN du secret Secrets Manager lu par database.config.ts
    this.function.addEnvironment('DB_HOST', dbInstance.dbInstanceEndpointAddress);

    if (dbInstance.secret) {
      // Autorise la Lambda à lire le secret
      dbInstance.secret.grantRead(this.function);
      // database.config.ts utilise DB_SECRET_ARN pour récupérer username/password
      this.function.addEnvironment('DB_SECRET_ARN', dbInstance.secret.secretArn);
    }

    // ─── Permissions IAM (principe du moindre privilège) ─────────────────────

    // SQS : autoriser uniquement l'envoi de messages (pas de lecture)
    sqsQueue.grantSendMessages(this.function);

    // DynamoDB : autoriser lecture + écriture sur la table d'audit
    dynamoTable.grantReadWriteData(this.function);

    // ─── Warm-up EventBridge (optionnel) ──────────────────────────────────────
    // Évite les cold starts en maintenant la Lambda "chaude"
    // Décommentez et ajustez selon les besoins en production
    /*
    new events.Rule(this, 'WarmUpRule', {
      schedule: events.Schedule.rate(cdk.Duration.minutes(5)),
      targets: [new targets.LambdaFunction(this.function, {
        event: events.RuleTargetInput.fromObject({ source: 'aws.events' }),
      })],
    });
    */

    // ─── Outputs ──────────────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'LambdaArn', {
      value: this.function.functionArn,
      description: 'ARN de la Lambda API',
      exportName: 'OrderApi-LambdaArn',
    });
  }
}
