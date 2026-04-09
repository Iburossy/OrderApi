#!/bin/bash
# Création d'une Lambda Layer avec les dépendances NestJS
# Bonne pratique AWS : séparer le code des dépendances
# =====================================================

echo "=== Création de la Lambda Layer NestJS ==="

# Nettoyer
rm -rf layer layer.zip

# Créer la structure AWS Lambda Layer (nodejs/ à la racine)
mkdir -p layer/nodejs

# Copier package.json
cp package.json layer/nodejs/

# Installer UNIQUEMENT les dépendances de production
echo "Installation des dépendances..."
cd layer/nodejs
npm install --production --silent

# Vérifier que NestJS est installé
if [ ! -d "node_modules/@nestjs/core" ]; then
    echo "ERREUR: @nestjs/core non trouvé"
    exit 1
fi

echo "✓ Dépendances installées: $(ls node_modules | wc -l) packages"

# Retourner à la racine et zipper
cd ../..

# Créer le zip (structure: layer/ contient nodejs/)
echo "Création du layer.zip..."
zip -rq layer.zip layer

# Vérifier taille
SIZE=$(du -h layer.zip | cut -f1)
echo "✓ Layer créée: layer.zip ($SIZE)"
echo ""
echo "Structure:"
echo "  layer.zip"
echo "  └── nodejs/"
echo "      ├── node_modules/@nestjs/core/..."
echo "      └── package.json"
