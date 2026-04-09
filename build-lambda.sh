#!/bin/bash
# Script de build pour Lambda avec toutes les dépendances
# ========================================================

echo "=== Build Lambda pour AWS ==="

# Nettoyer
echo "1. Nettoyage..."
rm -rf dist-lambda

# Compiler TypeScript
echo "2. Compilation TypeScript..."
npm run build

# Créer dossier de déploiement
echo "3. Préparation du package..."
mkdir -p dist-lambda

# Copier le code compilé
cp -r dist/* dist-lambda/

# Copier package.json
cp package.json dist-lambda/

# Installer SEULEMENT les dépendances de production
echo "4. Installation des dépendances (production uniquement)..."
cd dist-lambda
npm install --production --silent

echo "=== Build terminé ==="
echo "Le dossier dist-lambda/ est prêt pour le déploiement"
echo ""
echo "Pour vérifier:"
echo "  ls dist-lambda/node_modules/@nestjs/core/package.json"
