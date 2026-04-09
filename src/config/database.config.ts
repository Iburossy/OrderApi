import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import * as AWS from 'aws-sdk';

/**
 * Récupère les credentials RDS depuis AWS Secrets Manager
 * Cette fonction est appelée au cold start et met en cache les credentials
 */
let cachedCredentials: { username: string; password: string } | null = null;
let credentialsExpiry: number = 0;

async function getDatabaseCredentials(): Promise<{ username: string; password: string }> {
  // Réutilise les credentials en cache s'ils ne sont pas expirés (TTL: 5 minutes)
  if (cachedCredentials && Date.now() < credentialsExpiry) {
    return cachedCredentials;
  }

  const secretArn = process.env.DB_SECRET_ARN;
  if (!secretArn) {
    // Fallback pour le développement local
    return {
      username: process.env.DB_USERNAME || 'postgres',
      password: process.env.DB_PASSWORD || 'password',
    };
  }

  const secretsManager = new AWS.SecretsManager({
    region: process.env.AWS_REGION || 'us-east-1',
  });

  try {
    const response = await secretsManager
      .getSecretValue({ SecretId: secretArn })
      .promise();

    if (response.SecretString) {
      const secret = JSON.parse(response.SecretString);
      cachedCredentials = {
        username: secret.username,
        password: secret.password,
      };
      credentialsExpiry = Date.now() + 5 * 60 * 1000; // 5 minutes TTL
      return cachedCredentials;
    }

    throw new Error('SecretString is empty');
  } catch (error) {
    console.error('Failed to retrieve database credentials:', error);
    throw new Error('Unable to retrieve database credentials from Secrets Manager');
  }
}

/**
 * Configuration TypeORM pour PostgreSQL RDS
 * 
 * Optimisations pour Lambda:
 * - Connection pooling limité (max 5 connexions)
 * - SSL désactivé (connexion dans VPC privé)
 * - Logging minimal en production
 */
export const databaseConfig = async (): Promise<TypeOrmModuleOptions> => {
  const credentials = await getDatabaseCredentials();

  return {
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: credentials.username,
    password: credentials.password,
    database: process.env.DB_NAME || 'ordersdb',
    
    // Entités - scan automatique du dossier entities
    entities: [__dirname + '/../**/*.entity{.ts,.js}'],
    
    // Synchronisation automatique ACTIVÉE temporairement pour créer la table
    // TODO: Désactiver après premier déploiement et utiliser migrations
    synchronize: true,
    
    // Logging minimal pour les performances
    logging: process.env.NODE_ENV !== 'production' ? ['query', 'error'] : ['error'],
    
    // Pool de connexions optimisé pour Lambda
    extra: {
      max: 5, // Maximum 5 connexions dans le pool
      min: 0, // Pas de connexion persistante (Lambda stateless)
      acquireTimeoutMillis: 5000, // Timeout de connexion 5s
      idleTimeoutMillis: 1000, // Fermeture rapide des connexions idle
      connectionTimeoutMillis: 5000,
    },
    
    // SSL OBLIGATOIRE pour RDS public (connexion Internet)
    // rejectUnauthorized: false car RDS utilise des certificats auto-signés
    ssl: {
      rejectUnauthorized: false,
    },
    
    // Timeout des requêtes
    maxQueryExecutionTime: 10000, // 10 secondes
  };
};
