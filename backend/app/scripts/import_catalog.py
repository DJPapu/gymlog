"""
Importa catalog/exercises.json a la base de datos.
Uso: uv run python -m app.scripts.import_catalog
"""

import json
import sys
from pathlib import Path

from sqlalchemy.dialects.postgresql import insert

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

    db = next(get_db())
    try:
        for ex in exercises:
            stmt = (
                insert(Exercise)
                .values(**ex)
                .on_conflict_do_update(
                    index_elements=["id"],
                    set_={k: v for k, v in ex.items() if k != "id"},
                )
            )
            db.execute(stmt)
        db.commit()
        print(f"Importados/actualizados {len(exercises)} ejercicios.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
