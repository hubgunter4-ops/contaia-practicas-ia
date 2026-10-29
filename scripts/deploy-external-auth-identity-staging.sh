#!/usr/bin/env bash
# Apply exactly one reviewed migration to the explicitly pinned NoraCFDI1 staging project.
# Default mode is dry-run. This script never targets the production project.
set -Eeuo pipefail
IFS=$'\n\t'

readonly STAGING_PROJECT_REF='bbkuhbsgvfrsfwkzzedy'
readonly PRODUCTION_PROJECT_REF='rjdhfajtttejskhuplzq'
readonly MIGRATION_VERSION='20261028150000'
readonly MIGRATION_FILE='20261028150000_external_identity_app_users.sql'
readonly REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
readonly SOURCE_MIGRATION="$REPO_ROOT/supabase/migrations/$MIGRATION_FILE"

MODE='dry-run'
case "${1:-}" in
  '') ;;
  --dry-run) MODE='dry-run' ;;
  --apply) MODE='apply' ;;
  --help|-h)
    cat <<'HELP'
Uso:
  scripts/deploy-external-auth-identity-staging.sh [--dry-run|--apply]

Por defecto hace solo dry-run. --apply requiere confirmación interactiva
escribiendo exactamente: APPLY bbkuhbsgvfrsfwkzzedy

Destino fijo: NoraCFDI1 (staging), ref bbkuhbsgvfrsfwkzzedy.
La ejecución incluye únicamente 20261028150000_external_identity_app_users.sql.
No se aceptan URL, project ref ni contraseñas como argumentos.

Requisitos: Supabase CLI instalado y autenticado; conectividad a Supabase.
SUPABASE_DB_PASSWORD puede proporcionarse por el entorno, sin incluirla en el comando.
HELP
    exit 0
    ;;
  *)
    echo "Argumento no reconocido: $1" >&2
    echo 'Use --help.' >&2
    exit 2
    ;;
esac

if [[ "$STAGING_PROJECT_REF" == "$PRODUCTION_PROJECT_REF" ]]; then
  echo 'ERROR: staging y producción no pueden compartir el project ref.' >&2
  exit 70
fi
if [[ ! -s "$SOURCE_MIGRATION" ]]; then
  echo "ERROR: no existe la migración objetivo: $SOURCE_MIGRATION" >&2
  exit 66
fi
if ! command -v supabase >/dev/null 2>&1; then
  echo 'ERROR: Supabase CLI no está instalado. Instálalo desde la documentación oficial y vuelve a ejecutar.' >&2
  exit 69
fi

WORKDIR=$(mktemp -d "${TMPDIR:-/tmp}/contaia-staging-migration.XXXXXX")
cleanup() {
  if [[ -n "${WORKDIR:-}" && -d "$WORKDIR" ]]; then
    rm -rf -- "$WORKDIR"
  fi
}
trap cleanup EXIT INT TERM

# Create a separate CLI project with exactly the target migration. This prevents
# db push from seeing or applying the repository's other pending migrations.
mkdir -p "$WORKDIR/supabase/migrations"
supabase --workdir "$WORKDIR" init --force >/dev/null
cp -- "$SOURCE_MIGRATION" "$WORKDIR/supabase/migrations/$MIGRATION_FILE"

cli() {
  supabase --workdir "$WORKDIR" "$@"
}

echo "Destino fijado: NoraCFDI1 (staging), project ref $STAGING_PROJECT_REF"
echo "Migración única: $MIGRATION_FILE"
if [[ "$MODE" == 'dry-run' ]]; then
  echo 'Modo: dry-run; no se aplicará SQL.'
else
  echo 'Modo: apply; se solicitará confirmación explícita antes de aplicar.'
fi

# Link only the disposable CLI workdir. A database password is accepted only
# through Supabase CLI's prompt or SUPABASE_DB_PASSWORD, never as a CLI argument.
cli link --project-ref "$STAGING_PROJECT_REF"

PROJECT_REF_FILE="$WORKDIR/supabase/.temp/project-ref"
if [[ ! -f "$PROJECT_REF_FILE" ]]; then
  echo 'ERROR: Supabase CLI no creó el project-ref enlazado; se cancela.' >&2
  exit 70
fi
LINKED_PROJECT_REF=$(tr -d '\r\n' < "$PROJECT_REF_FILE")
if [[ "$LINKED_PROJECT_REF" != "$STAGING_PROJECT_REF" || "$LINKED_PROJECT_REF" == "$PRODUCTION_PROJECT_REF" ]]; then
  echo 'ERROR: el project ref enlazado no coincide exactamente con staging; se cancela.' >&2
  exit 70
fi

DRY_RUN_LOG="$WORKDIR/db-push-dry-run.log"
if ! cli db push --linked --dry-run 2>&1 | tee "$DRY_RUN_LOG"; then
  echo 'ERROR: Supabase db push --dry-run falló; no se aplicó SQL.' >&2
  exit 1
fi

# Fail closed unless the CLI explicitly reports exactly the intended version
# and no other migration version. This is a textual check of the documented
# dry-run plan, not a schema-drift or SQL semantic validation.
mapfile -t PLANNED_VERSIONS < <(grep -Eo '[0-9]{14}' "$DRY_RUN_LOG" | sort -u || true)
if [[ "${#PLANNED_VERSIONS[@]}" -eq 0 ]]; then
  echo "ERROR: el dry-run no mostró una versión pendiente. Revisa `supabase migration list` manualmente; no se aplicó SQL." >&2
  exit 3
fi
if [[ "${#PLANNED_VERSIONS[@]}" -ne 1 || "${PLANNED_VERSIONS[0]}" != "$MIGRATION_VERSION" ]]; then
  printf 'ERROR: el plan contiene versiones distintas o adicionales (%s); no se aplicó SQL.\n' "${PLANNED_VERSIONS[*]}" >&2
  exit 4
fi
if ! grep -Fq "$MIGRATION_VERSION" "$DRY_RUN_LOG"; then
  echo 'ERROR: no se pudo confirmar la migración objetivo en la salida del dry-run.' >&2
  exit 4
fi

echo "Preflight del plan: solo $MIGRATION_VERSION está pendiente."
if [[ "$MODE" == 'dry-run' ]]; then
  echo 'Simulación terminada; no se aplicó SQL.'
  exit 0
fi

if [[ ! -t 0 ]]; then
  echo 'ERROR: --apply requiere una terminal interactiva para la confirmación final.' >&2
  exit 5
fi
printf 'Para aplicar SOLO esta migración en staging, escribe exactamente "APPLY %s": ' "$STAGING_PROJECT_REF"
IFS= read -r CONFIRMATION
if [[ "$CONFIRMATION" != "APPLY $STAGING_PROJECT_REF" ]]; then
  echo 'Confirmación incorrecta; se cancela sin aplicar SQL.' >&2
  exit 6
fi

# Do not pass --yes: retain the Supabase CLI's own final confirmation prompt.
cli db push --linked

echo 'Aplicación terminada. Verifica la versión remota con `supabase migration list` desde el directorio temporal o consulta la vista de migraciones de staging.'
