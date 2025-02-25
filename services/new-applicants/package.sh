#!/bin/bash

# Script para empaquetar la función Lambda con todas sus dependencias

# Asegurarse de que estamos en el directorio correcto
cd "$(dirname "$0")"

# Limpiar directorios temporales
rm -rf dist
rm -f lambda.zip

# Crear directorio de distribución
mkdir -p dist

# Copiar archivos de la función
cp -r index.js routes models dist/

# Copiar package.json
cp package.json dist/

# Instalar dependencias en el directorio de distribución
cd dist
npm install --production

# Crear archivo ZIP
zip -r ../lambda.zip .

# Volver al directorio original
cd ..

echo "Paquete lambda.zip creado exitosamente" 