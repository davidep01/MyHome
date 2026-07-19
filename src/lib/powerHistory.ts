export interface PowerPoint {
  at: number
  kw: number
}

/** Unisce due serie step-by-step conservando l'ultimo valore noto di ogni flusso. */
export function sumPowerPoints(domestic: PowerPoint[], car: PowerPoint[]): PowerPoint[] {
  const timestamps = [...new Set([...domestic.map((point) => point.at), ...car.map((point) => point.at)])].sort((a, b) => a - b)
  let domesticIndex = 0
  let carIndex = 0
  let domesticKw: number | null = null
  let carKw: number | null = null
  const summed: PowerPoint[] = []
  for (const at of timestamps) {
    while (domesticIndex < domestic.length && domestic[domesticIndex].at <= at) domesticKw = domestic[domesticIndex++].kw
    while (carIndex < car.length && car[carIndex].at <= at) carKw = car[carIndex++].kw
    if (domesticKw === null && carKw === null) continue
    summed.push({ at, kw: (domesticKw ?? 0) + (carKw ?? 0) })
  }
  if (summed.length <= 120) return summed
  const stride = Math.ceil(summed.length / 120)
  return summed.filter((_, index) => index % stride === 0 || index === summed.length - 1)
}
