export const weekdays = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

export function todayInSaoPaulo() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

export function shiftDate(value: string, days: number) {
  const d = new Date(`${value}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export function monday(value: string) {
  const day = new Date(`${value}T12:00:00Z`).getUTCDay()
  return shiftDate(value, -((day + 6) % 7))
}

export function displayDate(value: string) {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(`${value}T12:00:00Z`))
}

export function time(value: string) { return value.slice(0, 5) }
