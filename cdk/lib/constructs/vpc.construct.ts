import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

/**
 * VpcConstruct — Réseau privé pour l'application
 *
 * Architecture :
 *   Public subnet  → NAT Gateway (accès Internet sortant)
 *   Private subnet → Lambda, RDS
 *
 * VPC Endpoints (trafic interne AWS, sans NAT) :
 *   - DynamoDB Gateway Endpoint  (gratuit)
 *   - SQS Interface Endpoint     (payant mais moins cher que NAT pour ce volume)
 */
export class VpcConstruct extends Construct {
  /** Le VPC principal partagé par toutes les ressources */
  public readonly vpc: ec2.Vpc;

  /** Security group dédié à la Lambda */
  public readonly lambdaSecurityGroup: ec2.SecurityGroup;

  /** Security group dédié à RDS */
  public readonly dbSecurityGroup: ec2.SecurityGroup;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    // ─── 1. VPC ───────────────────────────────────────────────────────────────
    // 2 AZs pour la haute disponibilité
    // 1 NAT Gateway (économique pour dev/staging — passer à 2 en prod)
    this.vpc = new ec2.Vpc(this, 'Vpc', {
      maxAzs: 2,
      natGateways: 1,
      subnetConfiguration: [
        {
          // Subnet public : héberge le NAT Gateway
          cidrMask: 24,
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          // Subnet privé : Lambda + RDS (pas d'IP publique)
          cidrMask: 24,
          name: 'Private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
      ],
    });

    // ─── 2. VPC Endpoint DynamoDB (Gateway — gratuit) ─────────────────────────
    // Permet à la Lambda d'atteindre DynamoDB sans sortir sur Internet
    this.vpc.addGatewayEndpoint('DynamoDbEndpoint', {
      service: ec2.GatewayVpcEndpointAwsService.DYNAMODB,
    });

    // ─── 3. VPC Endpoint SQS (Interface) ──────────────────────────────────────
    // Permet à la Lambda d'envoyer des messages SQS en restant dans le VPC
    this.vpc.addInterfaceEndpoint('SqsEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.SQS,
      privateDnsEnabled: true, // résolution DNS transparente
    });

    // ─── 4. Security Groups ───────────────────────────────────────────────────

    // Security group Lambda : autoriser tout le trafic sortant
    // (DynamoDB via VPC endpoint, SQS via VPC endpoint, RDS via sg rule ci-dessous)
    this.lambdaSecurityGroup = new ec2.SecurityGroup(this, 'LambdaSg', {
      vpc: this.vpc,
      description: 'Security group - Lambda NestJS',
      allowAllOutbound: true,
    });

    // Security group RDS : n'accepter que le trafic venant de la Lambda
    this.dbSecurityGroup = new ec2.SecurityGroup(this, 'DbSg', {
      vpc: this.vpc,
      description: 'Security group - RDS PostgreSQL',
      allowAllOutbound: false,
    });

    // Règle : Lambda → RDS sur le port 5432 (PostgreSQL)
    this.dbSecurityGroup.addIngressRule(
      this.lambdaSecurityGroup,
      ec2.Port.tcp(5432),
      'Allow Lambda to connect to PostgreSQL',
    );

    // Tags pour faciliter l'identification dans la console AWS
    cdk.Tags.of(this.vpc).add('Project', 'OrderApi');
  }
}
