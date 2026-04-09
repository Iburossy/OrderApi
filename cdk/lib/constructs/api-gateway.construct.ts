import * as cdk from 'aws-cdk-lib';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';

export interface ApiGatewayConstructProps {
  lambdaFunction: lambda.Function;
}

/**
 * ApiGatewayConstruct — HTTP API Gateway (v2)
 *
 * Pourquoi HTTP API et pas REST API ?
 * - 70% moins cher (1$/million vs 3.5$/million de requêtes)
 * - Latence plus faible (pas d'étape de mapping)
 * - Suffisant pour un proxy Lambda sans transformations complexes
 *
 * Routes :
 *   ANY /{proxy+} → Lambda  (toutes les routes délèguent à NestJS)
 *   ANY /         → Lambda  (route racine)
 *
 * CORS :
 *   Configuré au niveau API Gateway (la Lambda n'a pas à s'en occuper).
 *   Ajuster allowOrigins en production pour limiter aux domaines autorisés.
 */
export class ApiGatewayConstruct extends Construct {
  /** L'API HTTP */
  public readonly api: apigatewayv2.HttpApi;

  /** URL publique de l'API */
  public readonly apiUrl: string;

  constructor(scope: Construct, id: string, props: ApiGatewayConstructProps) {
    super(scope, id);

    const { lambdaFunction } = props;

    // ─── Intégration Lambda ───────────────────────────────────────────────────
    // Proxy complet : API Gateway transmet l'intégralité de la requête à la Lambda
    // et retourne sa réponse telle quelle.
    const lambdaIntegration = new integrations.HttpLambdaIntegration(
      'LambdaIntegration',
      lambdaFunction,
    );

    // ─── HTTP API ─────────────────────────────────────────────────────────────
    this.api = new apigatewayv2.HttpApi(this, 'HttpApi', {
      apiName: 'order-api',
      description: 'API HTTP pour la gestion des commandes',

      // CORS global (ajuster allowOrigins en production)
      corsPreflight: {
        allowHeaders: [
          'Content-Type',
          'X-Idempotency-Key',
          'Authorization',
        ],
        allowMethods: [
          apigatewayv2.CorsHttpMethod.GET,
          apigatewayv2.CorsHttpMethod.POST,
          apigatewayv2.CorsHttpMethod.PUT,
          apigatewayv2.CorsHttpMethod.DELETE,
          apigatewayv2.CorsHttpMethod.OPTIONS,
        ],
        allowOrigins: ['*'], // ⚠️ Restreindre en production
        maxAge: cdk.Duration.days(1),
      },

      // Désactive le stage "$default" dans l'URL (URLs plus propres)
      createDefaultStage: true,
    });

    // ─── Routes ───────────────────────────────────────────────────────────────
    // Route générique : toutes les méthodes, tous les chemins → Lambda
    this.api.addRoutes({
      path: '/{proxy+}',
      methods: [apigatewayv2.HttpMethod.ANY],
      integration: lambdaIntegration,
    });

    // Route racine (GET / pour health check ou redirection)
    this.api.addRoutes({
      path: '/',
      methods: [apigatewayv2.HttpMethod.ANY],
      integration: lambdaIntegration,
    });

    this.apiUrl = this.api.apiEndpoint;

    // ─── Output ───────────────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: this.api.apiEndpoint,
      description: 'URL publique de l\'API',
      exportName: 'OrderApi-ApiUrl',
    });

    new cdk.CfnOutput(this, 'HealthCheckUrl', {
      value: `${this.api.apiEndpoint}/health`,
      description: 'URL du health check',
    });
  }
}
