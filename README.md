# Arquiva

Gerenciador privado e responsivo de documentos, imagens, áudios, vídeos e outros arquivos. O Arquiva oferece busca, pastas, favoritos, lixeira, pré-visualização, modo claro/escuro e configurações por dispositivo.

## Arquitetura

- Supabase Auth controla o acesso e as sessões.
- Google Drive guarda o conteúdo dos arquivos.
- Cloudflare D1 guarda apenas a organização: nomes, pastas, favoritos e referências internas.
- OpenAI Sites/Cloudflare executa a aplicação.
- GitHub privado mantém o código e executa as verificações automáticas.

Cada consulta de arquivo e pasta é limitada ao identificador do usuário autenticado. O navegador nunca recebe a credencial da conta de serviço do Google.

## Configuração local

1. Copie `.dev.vars.example` para `.dev.vars`.
2. Preencha a URL e uma chave **publicável** do Supabase.
3. Escolha uma forma de acesso ao Google Drive:
   - **Drive pessoal (gratuito):** preencha `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` e `GOOGLE_OAUTH_REFRESH_TOKEN` de um consentimento OAuth da conta proprietária.
   - **Google Workspace:** preencha os dados de uma nova conta de serviço e conceda a ela acesso a uma pasta em um Shared Drive.
4. Defina `GOOGLE_DRIVE_ROOT_FOLDER_ID` com o ID da pasta dedicada ao Arquiva.
5. Ajuste `ARQUIVA_USER_STORAGE_QUOTA_BYTES` se quiser alterar a cota padrão de 10 GB por usuário.
6. Instale as dependências com `pnpm install` e execute `pnpm dev`.

Configure apenas uma das formas de acesso ao Drive. Se as duas estiverem completas, o OAuth do Drive pessoal tem prioridade. O identificador da pasta aparece na URL do Drive ao abri-la.

Para uma visualização local sem login, `ARQUIVA_DEV_BYPASS_AUTH=true` funciona somente fora de produção.

## Segurança

- Nunca salve chaves secretas no Git, em issues ou em mensagens.
- Arquivos `.env*`, `.dev.vars*`, chaves privadas e JSONs de contas de serviço são ignorados.
- Use apenas `SUPABASE_PUBLISHABLE_KEY`; o Arquiva não precisa de `sb_secret`.
- Segredos de produção devem ficar nas variáveis criptografadas do serviço de hospedagem.
- Tokens OAuth e chaves privadas permanecem no servidor e nunca são enviados ao navegador.
- Contas de serviço não possuem armazenamento pessoal gratuito; use OAuth para uma conta pessoal ou uma pasta em Shared Drive.
- Use uma pasta exclusiva do Arquiva e conceda acesso somente a quem realmente precisa dela.
- O envio aplica uma cota cumulativa por usuário; arquivos na lixeira ainda ocupam espaço até serem excluídos permanentemente.

## Verificações

```sh
pnpm typecheck
pnpm lint
pnpm build
```

O fluxo em `.github/workflows/ci.yml` executa essas verificações em cada atualização e pull request.

