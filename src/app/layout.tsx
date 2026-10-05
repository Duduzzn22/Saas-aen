import type { Metadata } from 'next'
import './style.css'

export const metadata: Metadata = { title: 'Natação | Gestão', description: 'Gestão de escolas de natação' }
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>
}
