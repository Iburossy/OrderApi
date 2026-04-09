#!/bin/bash
# Déploiement de la Lambda Layer sur AWS
# =======================================

echo "=== Déploiement de la Lambda Layer ==="

# Vérifier que layer.zip existe
if [ ! -f "layer.zip" ]; then
    echo "ERREUR: layer.zip non trouvé. Lancez d'abord: ./create-layer.sh"
    exit 1
fi

# Publier la Layer
echo "Publication sur AWS..."
aws lambda publish-layer-version \
    --layer-name nestjs-dependencies \
    --description "NestJS dependencies for Order API" \
    --zip-file fileb://layer.zip \
    --compatible-runtimes nodejs20.x \
    --region eu-west-1 \
    --query 'LayerVersionArn' \
    --output text > layer-arn.txt

if [ $? -eq 0 ]; then
    ARN=$(cat layer-arn.txt)
    echo "✓ Layer déployée avec succès!"
    echo "ARN: $ARN"
    echo ""
    echo "Mettez à jour le CDK avec cet ARN:"
    echo "  const nestjsLayer = lambda.LayerVersion.fromLayerVersionArn(this, 'NestJSLayer', '$ARN');"
else
    echo "✗ Échec du déploiement"
    exit 1
fi
