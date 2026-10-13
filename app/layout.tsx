import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { Casca } from '@/components/Casca'
import { ProvedorConsultas } from '@/components/ProvedorConsultas'
import { ProvedorUsuario } from '@/components/ProvedorUsuario'
import { obterSessao } from '@/lib/server/sessao'
import './globals.css'

export const metadata: Metadata = {
  title: 'Contratos Jurídicos',
  description: 'Gestão de contratos jurídicos - Princesa dos Campos',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const usuario = await obterSessao()
  // Nonce da CSP (proxy.ts): sem ele o navegador bloqueia o script do tema.
  const nonce = (await headers()).get('content-security-policy')?.match(/'nonce-([^']+)'/)?.[1]

  return (
    <html lang="pt-BR">
      <head>
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html:
              "try{if(localStorage.getItem('tema')==='claro')document.documentElement.dataset.tema='claro'}catch(e){}",
          }}
        />
      </head>
      <body>
        <ProvedorUsuario usuario={usuario}>
          <ProvedorConsultas>
            <Casca>{children}</Casca>
          </ProvedorConsultas>
        </ProvedorUsuario>
      </body>
    </html>
  )
}
