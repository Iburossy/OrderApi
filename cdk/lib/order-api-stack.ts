import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { VpcConstruct } from './constructs/vpc.construct';
import { DatabaseConstruct } from './constructs/database.construct';
import { DynamoDbConstruct } from './constructs/dynamodb.construct';
import { QueueConstruct } from './constructs/queue.construct';
import { LambdaConstruct } from './constructs/lambda.construct';
import { ApiGatewayConstruct } from './constructs/api-gateway.construct';

/**
 * OrderApiStack — Stack CDK principal
 *
 * Assemble tous les constructs dans le bon ordre :
 *   1. VPC           (dépendances : aucune)
 *   2. RDS           (dépend du VPC)
 *   3. DynamoDB      (dépendances : aucune)
 *   4. SQS           (dépendances : aucune)
 *   5. Lambda        (dépend de VPC, RDS, DynamoDB, SQS)
 *   6. API Gateway   (dépend de Lambda)
 *
 * Pour déployer :
 *   cd cdk && npm install && cdk deploy
 */
export class OrderApiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ─── 1. Réseau ────────────────────────────────────────────────────────────
    const network = new VpcConstruct(this, 'Network');

    // ─── 2. Base de données RDS ───────────────────────────────────────────────
    const database = new DatabaseConstruct(this, 'Database', {
      vpc: network.vpc,
      securityGroup: network.dbSecurityGroup,
    });

    // ─── 3. DynamoDB (audit events) ───────────────────────────────────────────
    const dynamo = new DynamoDbConstruct(this, 'Dynamo');

    // ─── 4. SQS (traitement asynchrone) ───────────────────────────────────────
    const queue = new QueueConstruct(this, 'Queue');

    // ─── 5. Lambda NestJS ─────────────────────────────────────────────────────
    const lambdaFunction = new LambdaConstruct(this, 'Lambda', {
      vpc: network.vpc,
      securityGroup: network.lambdaSecurityGroup,
      dbInstance: database.instance,
      dbName: database.databaseName,
      sqsQueue: queue.queue,
      dynamoTable: dynamo.table,
    });

    // ─── 6. API Gateway ───────────────────────────────────────────────────────
    new ApiGatewayConstruct(this, 'Api', {
      lambdaFunction: lambdaFunction.function,
    });
  }
}
