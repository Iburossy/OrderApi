import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrdersModule } from './orders/orders.module';
import { AuditModule } from './audit/audit.module';
import { databaseConfig } from './config/database.config';

/**
 * Module principal de l'application
 * 
 * Configuration:
 * - ConfigModule: Chargement des variables d'environnement
 * - TypeOrmModule: Connexion à PostgreSQL RDS
 * - OrdersModule: Gestion des commandes
 * - AuditModule: Logging des événements
 */
@Module({
  imports: [
    // Configuration globale
    ConfigModule.forRoot({
      isGlobal: true, // Rend ConfigService disponible partout
      cache: true, // Cache les valeurs pour les performances
    }),
    
    // Base de données PostgreSQL
    TypeOrmModule.forRootAsync({
      useFactory: databaseConfig,
    }),
    
    // Modules métier
    OrdersModule,
    AuditModule,
  ],
})
export class AppModule {}
