import type { Metadata } from 'next'
import { Casca } from '@/components/Casca'
import { ProvedorUsuario } from '@/components/ProvedorUsuario'
import { obterSessao } from '@/lib/server/sessao'
import './globals.css'

export const metadata: Metadata = {
  title: 'Contratos Jurídicos',
  description: 'Gestão de contratos jurídicos - Princesa dos Campos',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const usuario = await obterSessao()

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
        <ProvedorUsuario usuario={usuario}>
          <Casca>{children}</Casca>
        </ProvedorUsuario>
      </body>
    </html>
  )
}
