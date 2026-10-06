#!/usr/bin/env bash
# Publica la app en GitHub Pages (repositorio público, gratis).
# Requisitos: git, GitHub CLI con sesión iniciada (`gh auth login`).
# Uso: bash scripts/publish.sh [nombre-repo]
set -euo pipefail
cd "$(dirname "$0")/.."

REPO="${1:-octopus-verticales}"
GH="${GH_BIN:-gh}"
command -v "$GH" >/dev/null 2>&1 || { echo "No encuentro GitHub CLI (gh). Instálalo o define GH_BIN=ruta/a/gh.exe"; exit 1; }
"$GH" auth status >/dev/null 2>&1 || { echo "Inicia sesión primero: $GH auth login"; exit 1; }

USER="$("$GH" api user -q .login)"
URL="https://${USER}.github.io/${REPO}/"
echo "Usuario GitHub: $USER"

# Sustituye el marcador del enlace al repositorio dentro de la app.
sed -i "s#https://github.com/__GITHUB_USER__/octopus-verticales#https://github.com/${USER}/${REPO}#g" js/views/settings.js README.md || true
if ! git diff --quiet; then
  git add -A
  git -c user.name="${GIT_AUTHOR_NAME:-$USER}" -c user.email="${GIT_AUTHOR_EMAIL:-${USER}@users.noreply.github.com}" commit -q -m "chore: enlace al repositorio ${USER}/${REPO}"
fi

if ! git remote get-url origin >/dev/null 2>&1; then
  "$GH" repo create "$REPO" --public --source=. --remote=origin --description "App interna Octopus Verticales (PWA)" --push
else
  git push -u origin main
fi

# Activa GitHub Pages desde la rama main (raíz). Si ya existe, actualiza la fuente.
if ! "$GH" api -X POST "repos/${USER}/${REPO}/pages" -f build_type=legacy -f "source[branch]=main" -f "source[path]=/" >/dev/null 2>&1; then
  "$GH" api -X PUT "repos/${USER}/${REPO}/pages" -f build_type=legacy -f "source[branch]=main" -f "source[path]=/" >/dev/null 2>&1 || true
fi

echo
echo "✅ Publicado. En 1-2 minutos la app estará en: $URL"
echo "   Repositorio: https://github.com/${USER}/${REPO}"
