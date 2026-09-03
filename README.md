# Arquiva

Gerenciador privado e responsivo de documentos, imagens, áudios, vídeos e
outros arquivos. A interface roda como site estático no GitHub Pages, o
Supabase cuida do login, das pastas e dos metadados, e o Google Drive guarda os
arquivos.

## Recursos

- Upload de vários tipos de arquivo, até 25 MB por item.
- Pré-visualização autenticada de imagens, PDFs, textos, áudios e vídeos.
- Busca, filtros, favoritos, lixeira e pastas fáceis de criar, renomear e
  excluir.
- Layout adaptado a computador, tablet e celular, inclusive captura pela
  câmera.
- Modos claro, escuro e automático, cores e densidade configuráveis.
- Espaço livre igual ao da conta Google, consultado no Drive a cada 15 segundos
  e após alterações.
- Supabase Auth, políticas RLS por usuário e credenciais do Drive guardadas
  somente na Edge Function.

## Arquitetura

```text
GitHub Pages (React/Vite)
        ↓ JWT do usuário
Supabase Auth + Edge Function + Postgres/RLS
        ↓ OAuth privado
Google Drive
```

O navegador recebe apenas a chave **publicável** do Supabase. Client secret,
refresh token e qualquer credencial do Google ficam nos Secrets da Edge
Function e nunca entram no bundle do site.

## Desenvolvimento

1. Copie `.env.example` para `.env.local`.
2. Preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`.
3. Execute `pnpm install` e `pnpm dev`.

## Verificações

```sh
pnpm typecheck
pnpm lint
pnpm build
```

## Publicação

O passo a passo completo, incluindo rotação de credenciais, OAuth do Drive,
Supabase, GitHub Actions e GitHub Pages, está em
[`docs/GUIA_PUBLICACAO.md`](docs/GUIA_PUBLICACAO.md).
