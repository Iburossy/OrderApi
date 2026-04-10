import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import serverlessExpress from '@vendia/serverless-express';
import { Context, Handler } from 'aws-lambda';
import express from 'express';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';


// ==========================================
// Variables globales pour optimiser les cold start s
// ==========================================
let cachedServer: Handler;
let cachedApp: express.Express;

/**
 * Bootstrap de l'application NestJS
 * Cette fonction est appelée une seule fois lors du cold start
 */
async function bootstrap(): Promise<express.Express> {
  if (!cachedApp) {
    const expressApp = express();
    const adapter = new ExpressAdapter(expressApp);
    
    const nestApp = await NestFactory.create(AppModule, adapter);
    
    // Configuration du ValidationPipe global e
    nestApp.useGlobalPipes(
      new ValidationPipe({
        whitelist: true, // Supprime les propriétés non décorées
        forbidNonWhitelisted: true, // Rejette les requêtes avec propriétés non décorées
        transform: true, // Transforme automatiquement les types
        transformOptions: {
          enableImplicitConversion: true,
        },
      })
    );
    
    // Configuration CORS complète
    nestApp.enableCors({
      origin: '*',
      methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
      allowedHeaders: 'Content-Type,Accept,Authorization,x-idempotency-key',
      credentials: true,
    });
    
    await nestApp.init();
    
    cachedApp = expressApp;
  }
  
  return cachedApp;
}

/**
 * Handler AWS Lambda - Point d'entrée
 * 
 * Optimisations pour les cold starts:
 * - Réutilisation du serveur via closure (cachedServer)
 * - Connexion DB persistée via TypeORM connection pooling
 * - Lazy loading des services AWS SDK
 */
export const handler: Handler = async (
  event: any,
  context: Context
): Promise<any> => {
  // Gestion des health checks spéciaux (warm up)
  if (event.source === 'aws.events') {
    // EventBridge scheduled event - warm up invocation
    await bootstrap();
    return {
      statusCode: 200,
      body: JSON.stringify({ status: 'warm', timestamp: new Date().toISOString() }),
    };
  }
  
  if (!cachedServer) {
    // Cold start - initialise l'application
    const expressApp = await bootstrap();
    cachedServer = serverlessExpress({ app: expressApp });
  }
  
  // Warm invocation - réutilise le serveur
  return (cachedServer as any)(event, context);
};

/**
 * Handler pour le développement local
 * Permet de tester l'API avec `npm run start:dev`
 */
async function bootstrapLocal() {
  const app = await NestFactory.create(AppModule);
  
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    })
  );
  
  app.enableCors();
  
  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`Application is running on: http://localhost:${port}`);
}

// Démarrage local si exécuté directement (non-Lambda)
if (process.env.NODE_ENV !== 'production' && !process.env.AWS_LAMBDA_FUNCTION_NAME) {
  bootstrapLocal();
}
