import type { BodyMetric, Profile } from '../db/schema'

export interface NutritionTargets {
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
}

function ageFromBirthDate(birthDate: string): number {
  const today = new Date()
  const dob = new Date(birthDate)
  let age = today.getFullYear() - dob.getFullYear()
  const m = today.getMonth() - dob.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--
  return age
}

export function computeTargets(
  profile: Profile,
  latestMetric: BodyMetric | undefined,
): NutritionTargets | null {
  const weightKg = latestMetric?.weight_kg
  const heightCm = profile.height_cm
  const birthDate = profile.birth_date
  const sex = profile.sex
  const goal = profile.goal

  if (!weightKg || !heightCm || !birthDate || !sex || sex === 'other') return null

  const age = ageFromBirthDate(birthDate)
  const bmr =
    10 * weightKg + 6.25 * heightCm - 5 * age + (sex === 'male' ? 5 : -161)

  const tdee = Math.round(bmr * 1.55)

  const targetCals =
    goal === 'gain_muscle'
      ? tdee + 300
      : goal === 'lose_fat'
        ? Math.max(tdee - 400, 1200)
        : tdee

  const proteinG = Math.round(2 * weightKg)
  const fatG = Math.round((targetCals * 0.25) / 9)
  const carbsG = Math.round((targetCals - proteinG * 4 - fatG * 9) / 4)

  return {
    calories: targetCals,
    protein_g: proteinG,
    carbs_g: Math.max(carbsG, 0),
    fat_g: fatG,
  }
}
