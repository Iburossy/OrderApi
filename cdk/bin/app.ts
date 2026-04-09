#!/usr/bin/env node
import 'source-map-support/register';
import * as path from 'path';
import * as dotenv from 'dotenv';
import * as cdk from 'aws-cdk-lib';
import { OrderApiStack } from '../lib/order-api-stack';

// Charge le .env depuis la racine du projet (OrderTraitementApi/.env)
dotenv.config({ path: path.join(__dirname, '../../.env') });
const app = new cdk.App();

new OrderApiStack(app, 'OrderApiStack', {
  // Déploiement dans le compte et la région définis dans les variables d'environnement
  env: {
    account: process.env.AWS_ACCOUNT_ID || process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.AWS_REGION || process.env.CDK_DEFAULT_REGION || 'eu-west-1',
  },

  // Tags globaux appliqués à toutes les ressources du stack
  tags: {
    Project: 'OrderApi',
    Environment: process.env.NODE_ENV || 'development',
    ManagedBy: 'CDK',
  },

  description: 'Stack infrastructure pour l\'API de traitement des commandes',
});

app.synth();
