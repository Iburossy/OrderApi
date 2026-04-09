import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import { Construct } from 'constructs';

export interface DatabaseConstructProps {
  vpc: ec2.Vpc;
  securityGroup: ec2.SecurityGroup;
}

/**
 * DatabaseConstruct — Base de données PostgreSQL sur RDS
 *
 * Choix techniques :
 * - PostgreSQL 15 (compatible avec TypeORM et les types jsonb utilisés dans l'entité Order)
 * - Instance t3.micro (Free Tier éligible en dev)
 * - Subnet privé uniquement (pas d'accès public)
 * - Mot de passe auto-généré dans AWS Secrets Manager
 * - Backup automatique 7 jours
 *
 * En production, envisager :
 * - Multi-AZ pour la haute dispo
 * - Instance plus puissante (t3.small ou plus)
 * - Deletion protection activée
 */
export class DatabaseConstruct extends Construct {
  /** L'instance RDS PostgreSQL */
  public readonly instance: rds.DatabaseInstance;

  /** Les credentials (secret Secrets Manager contenant host, port, user, password) */
  public readonly credentials: rds.Credentials;

  /** Nom de la base de données */
  public readonly databaseName = 'ordersdb';

  constructor(scope: Construct, id: string, props: DatabaseConstructProps) {
    super(scope, id);

    const { vpc, securityGroup } = props;

    // ─── Credentials ──────────────────────────────────────────────────────────
    // CDK génère automatiquement un secret dans Secrets Manager :
    //   { username, password, host, port, dbname, engine }
    this.credentials = rds.Credentials.fromGeneratedSecret('postgres', {
      secretName: 'order-api/rds-credentials',
    });

    // ─── Instance RDS ─────────────────────────────────────────────────────────
    this.instance = new rds.DatabaseInstance(this, 'Database', {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_15,
      }),

      // Type d'instance (t3.micro = Free Tier)
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.MICRO,
      ),

      credentials: this.credentials,
      databaseName: this.databaseName,

      // Réseau
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      securityGroups: [securityGroup],

      // Pas d'accès public (RDS seulement accessible depuis le VPC)
      publiclyAccessible: false,

      // Stockage : 20 Go gp2, auto-scaling jusqu'à 100 Go
      allocatedStorage: 20,
      maxAllocatedStorage: 100,
      storageType: rds.StorageType.GP2,

      // Free Tier : pas de backup (0 = désactivé)
      // Passer à 7 jours en production sur un compte payant
      backupRetention: cdk.Duration.days(0),

      // Maintenance window (mises à jour mineures automatiques)
      autoMinorVersionUpgrade: true,
      preferredMaintenanceWindow: 'Mon:04:00-Mon:05:00',

      // En dev : supprime la DB avec le stack (mettre RETAIN en prod !)
      removalPolicy: cdk.RemovalPolicy.DESTROY,

      // Désactive la protection contre la suppression accidentelle (dev seulement)
      deletionProtection: false,

      // Logs PostgreSQL vers CloudWatch
      cloudwatchLogsExports: ['postgresql', 'upgrade'],
      cloudwatchLogsRetention: cdk.aws_logs.RetentionDays.ONE_WEEK,
    });

    // Output utile pour debug : l'endpoint de la DB
    new cdk.CfnOutput(this, 'DbEndpoint', {
      value: this.instance.dbInstanceEndpointAddress,
      description: 'Endpoint RDS PostgreSQL',
      exportName: 'OrderApi-DbEndpoint',
    });
  }
}
