"""Nutrition router — calorie estimation via Gemini (backend proxy)."""

import base64
import re
import time
from typing import Annotated, Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.auth import CurrentUser
from app.config import settings

router = APIRouter(prefix="/nutrition", tags=["nutrition"])


class EstimateRequest(BaseModel):
    description: str
    weight_g: float | None = None
    photos: list[str] = []  # base64 data URLs: "data:image/jpeg;base64,..."


class EstimateResponse(BaseModel):
    calories: int
    protein_g: float | None = None
    carbs_g: float | None = None
    fat_g: float | None = None


_MODELS = [
    "gemini-3.5-flash-lite",   # lite tiene más capacidad disponible
    "gemini-3.1-flash-lite",
    "gemini-3.5-flash",
    "gemini-3.6-flash",
    "gemini-3.7-flash",
    "gemini-3.8-flash",
]


@router.post("/estimate", response_model=EstimateResponse)
def estimate_calories(
    body: EstimateRequest,
    user_id: CurrentUser = "",
) -> Any:
    if not settings.gemini_api_key:
        raise HTTPException(status_code=503, detail="GEMINI_API_KEY no configurada.")

    try:
        from google import genai
        from google.genai import types as genai_types
    except ImportError as e:
        raise HTTPException(status_code=503, detail=f"google-genai no instalada: {e}") from e

    weight_hint = f" ({body.weight_g}g)" if body.weight_g else ""
    has_photos = bool(body.photos)

    if has_photos:
        prompt = (
            f'Analiza las imágenes de comida. '
            f'{"Descripción: " + repr(body.description) + weight_hint + "." if body.description else ""}\n'
            'Si hay etiqueta nutricional, usa esos valores (ajustando al peso si aplica).\n'
            'Si es foto de comida, estima según las porciones visibles.'
        )
    else:
        prompt = f'Estima los macronutrientes de: "{body.description}"{weight_hint}'

    # Build multimodal contents: images first, then text
    # When no photos, pass plain string (simpler and always supported)
    if body.photos:
        parts: list[Any] = []
        for data_url in body.photos:
            m = re.match(r'data:([^;]+);base64,(.+)', data_url, re.DOTALL)
            if m:
                mime_type, b64 = m.groups()
                parts.append(genai_types.Part.from_bytes(
                    data=base64.b64decode(b64),
                    mime_type=mime_type,
                ))
        parts.append({"text": prompt})
        contents: Any = parts
    else:
        contents = prompt

    client = genai.Client(api_key=settings.gemini_api_key)
    last_exc: Exception | None = None

    for model in _MODELS:
        for attempt in range(2):
            if attempt:
                time.sleep(3)
            try:
                response = client.models.generate_content(
                    model=model,
                    contents=contents,
                    config=genai_types.GenerateContentConfig(
                        system_instruction="Eres un nutricionista experto.",
                        max_output_tokens=128,
                        temperature=0,
                        response_mime_type="application/json",
                        response_schema={
                            "type": "object",
                            "properties": {
                                "calories": {"type": "integer"},
                                "protein_g": {"type": "number"},
                                "carbs_g": {"type": "number"},
                                "fat_g": {"type": "number"},
                            },
                            "required": ["calories", "protein_g", "carbs_g", "fat_g"],
                        },
                    ),
                )
                import json
                data = json.loads(response.text)
                return EstimateResponse(
                    calories=round(data["calories"]),
                    protein_g=round(float(data.get("protein_g") or 0), 1) or None,
                    carbs_g=round(float(data.get("carbs_g") or 0), 1) or None,
                    fat_g=round(float(data.get("fat_g") or 0), 1) or None,
                )
            except Exception as e:
                last_exc = e
                msg = str(e)
                if any(x in msg for x in ("503", "UNAVAILABLE", "429")):
                    continue  # reintento
                if any(x in msg for x in ("404", "not found")):
                    break  # modelo no disponible → siguiente
                raise HTTPException(status_code=502, detail=f"Error Gemini ({model}): {e}") from e

    raise HTTPException(status_code=502, detail=f"Gemini no disponible: {last_exc}")
