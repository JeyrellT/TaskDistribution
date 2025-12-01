#!/bin/bash
# ============================================
# Script de Push Automático - Distribution Manager PWA
# Uso: ./deploy.sh "mensaje del commit"
# ============================================

cd "$(dirname "$0")"

echo "========================================"
echo " Distribution Manager PWA - Deploy"
echo " Desarrollado por JC Analytics"
echo "========================================"
echo ""

# Verificar si hay cambios
if ! git status --porcelain > /dev/null 2>&1; then
    echo "[ERROR] No es un repositorio Git"
    exit 1
fi

# Obtener mensaje del commit
if [ -z "$1" ]; then
    read -p "Mensaje del commit: " COMMIT_MSG
else
    COMMIT_MSG="$1"
fi

if [ -z "$COMMIT_MSG" ]; then
    COMMIT_MSG="Update: $(date '+%Y-%m-%d %H:%M:%S')"
fi

echo ""
echo "[1/4] Agregando cambios..."
git add -A

echo "[2/4] Creando commit: \"$COMMIT_MSG\""
git commit -m "$COMMIT_MSG"

echo "[3/4] Sincronizando con GitHub..."
git pull origin main --rebase

echo "[4/4] Subiendo cambios..."
git push origin main

echo ""
echo "========================================"
echo " ✅ Deploy completado exitosamente!"
echo " 📦 Repositorio: https://github.com/JeyrellT/TaskDistribution"
echo "========================================"
