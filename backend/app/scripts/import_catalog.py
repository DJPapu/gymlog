"""
Importa catalog/exercises.json a la base de datos.
Uso: uv run python -m app.scripts.import_catalog
"""

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

from app.config import settings
from app.db import get_db
from app.models.exercise import Exercise


def main() -> None:
    catalog_path = Path(__file__).parents[3] / "catalog" / "exercises.json"
    if not catalog_path.exists():
        print(f"No se encuentra {catalog_path}", file=sys.stderr)
        sys.exit(1)

    exercises = json.loads(catalog_path.read_text(encoding="utf-8"))
    if not exercises:
        print("catalog/exercises.json está vacío, nada que importar.")
        return

    # Always bump updated_at so sync pull picks up every change on next client pull
    now = datetime.now(timezone.utc)

    # Pick the right dialect-specific upsert helper
    is_sqlite = settings.database_url.startswith("sqlite")
    if is_sqlite:
        from sqlalchemy.dialects.sqlite import insert as _insert
    else:
        from sqlalchemy.dialects.postgresql import insert as _insert  # type: ignore[no-redef]

    db = next(get_db())
    try:
        for ex in exercises:
            values = {**ex, "updated_at": now}
            stmt = (
                _insert(Exercise)
                .values(**values)
                .on_conflict_do_update(
                    index_elements=["id"],
                    set_={k: v for k, v in values.items() if k != "id"},
                )
            )
            db.execute(stmt)
        db.commit()
        print(f"Importados/actualizados {len(exercises)} ejercicios.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
