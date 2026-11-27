"""Nutrition router — calorie estimation via Gemini."""

import json
import re
import time
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import CurrentUser
from app.config import settings
from app.db import get_db

router = APIRouter(prefix="/nutrition", tags=["nutrition"])

DB = Annotated[Session, Depends(get_db)]


class EstimateRequest(BaseModel):
    description: str
    weight_g: float | None = None


class EstimateResponse(BaseModel):
    calories: int
    protein_g: float | None = None
    carbs_g: float | None = None
    fat_g: float | None = None


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

    weight_line = f"\nCantidad indicada por separado: {body.weight_g}g" if body.weight_g else ""
    prompt = (
        f'Analiza este alimento o preparación y estima sus macronutrientes:\n'
        f'"{body.description}"{weight_line}\n\n'
        'Responde ÚNICAMENTE con JSON válido, sin markdown ni texto extra:\n'
        '{"calories": <entero>, "protein_g": <decimal>, "carbs_g": <decimal>, "fat_g": <decimal>}'
    )

    client = genai.Client(api_key=settings.gemini_api_key)
    _MODELS = ["gemini-3.5-flash", "gemini-3.6-flash", "gemini-3.7-flash"]
    last_exc: Exception | None = None
    response = None

    for model in _MODELS:
        for attempt in range(2):
            if attempt:
                time.sleep(2)
            try:
                response = client.models.generate_content(
                    model=model,
                    contents=prompt,
                    config=genai_types.GenerateContentConfig(
                        system_instruction=(
                            "Eres un nutricionista experto."
                            " Responde SOLO con JSON puro, sin markdown."
                        ),
                        max_output_tokens=256,
                    ),
                )
                break
            except Exception as e:
                last_exc = e
                if any(x in str(e) for x in ("503", "UNAVAILABLE", "404", "429")):
                    continue
                raise HTTPException(status_code=502, detail=f"Error Gemini: {e}") from e
        if response is not None:
            break

    if response is None:
        raise HTTPException(status_code=502, detail=f"Gemini no disponible: {last_exc}")

    text = response.text.strip()
    # Strip markdown code fences if present
    text = re.sub(r"^```[a-z]*\n?", "", text)
    text = re.sub(r"\n?```$", "", text)

    try:
        data = json.loads(text)
        return EstimateResponse(
            calories=round(data["calories"]),
            protein_g=round(data.get("protein_g") or 0, 1) or None,
            carbs_g=round(data.get("carbs_g") or 0, 1) or None,
            fat_g=round(data.get("fat_g") or 0, 1) or None,
        )
    except (json.JSONDecodeError, KeyError) as e:
        raise HTTPException(
            status_code=502, detail=f"Respuesta de Gemini no parseable: {text!r}"
        ) from e
