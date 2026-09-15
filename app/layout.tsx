import type { Metadata } from 'next'
import { Casca } from '@/components/Casca'
import './globals.css'

export const metadata: Metadata = {
  title: 'Contratos Jurídicos',
  description: 'Gestão de contratos jurídicos - Princesa dos Campos',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{if(localStorage.getItem('tema')==='claro')document.documentElement.dataset.tema='claro'}catch(e){}",
          }}
        />
      </head>
      <body>
        <Casca>{children}</Casca>
      </body>
    </html>
  )
}
