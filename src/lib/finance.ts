export function parseBRL(value: unknown): number | null {
  if (typeof value !== 'string') return null
  const cleaned = value.trim()
  if (!/^\d{1,8}(?:[,.]\d{1,2})?$/.test(cleaned)) return null
  const [whole, fraction = ''] = cleaned.replace(',', '.').split('.')
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  return Number.isSafeInteger(cents) && cents > 0 && cents <= 1000000000 ? cents : null
}

export function brl(cents: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100)
}

export function brlInput(cents: number) {
  return `${Math.floor(cents / 100)},${String(cents % 100).padStart(2, '0')}`
}

export function monthStart(value: string | undefined) {
  if (!value || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return null
  return `${value}-01`
}

export function monthLabel(value: string) {
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${value.slice(0, 7)}-15T12:00:00Z`))
}

export function shiftMonth(value: string, delta: number) {
  const date = new Date(`${value.slice(0, 7)}-15T12:00:00Z`)
  date.setUTCMonth(date.getUTCMonth() + delta)
  return date.toISOString().slice(0, 7)
}

export function invoiceLabel(status: string, paid: number, amount: number, due: string, today: string) {
  if (status === 'void') return 'Cancelada'
  if (paid >= amount) return 'Paga'
  if (due < today) return 'Atrasada'
  if (paid > 0) return 'Parcial'
  return 'Em aberto'
}
