# Guia de configuração e publicação do Arquiva

Este guia deixa o repositório privado, publica a interface no GitHub Pages,
usa o Supabase para login/banco/backend e guarda os arquivos no Google Drive.

## 1. Revogue primeiro as credenciais que foram compartilhadas

As credenciais enviadas anteriormente devem ser consideradas comprometidas,
mesmo que o repositório esteja privado.

1. No Google Cloud Console, abra **IAM e administrador → Contas de serviço →
   arquiva-drive → Chaves** e exclua a chave privada antiga.
2. No Supabase, abra **Project Settings → API Keys**, revogue a secret key
   antiga e gere outra apenas se algum serviço externo realmente precisar.
3. O Arquiva não usa `sb_secret` nem `service_role` no navegador ou na Edge
   Function. Não coloque essas chaves no GitHub.
4. Nunca reutilize em `.env`, GitHub, Supabase ou Google os valores enviados na
   conversa.

## 2. Prepare o OAuth do Google Drive

A conta de serviço não possui o armazenamento pessoal gratuito da sua conta.
Para que o Arquiva mostre exatamente o espaço da sua conta Google, use OAuth de
uma conta humana.

1. Abra o projeto `arquiva-507201` no Google Cloud Console.
2. Em **APIs e serviços → Biblioteca**, habilite **Google Drive API**.
3. Em **Tela de consentimento OAuth**, configure o aplicativo. Enquanto estiver
   em teste, adicione seu próprio e-mail Google como usuário de teste.
4. Em **Credenciais**, crie um **ID do cliente OAuth → Aplicativo da Web**.
5. Adicione esta URI de redirecionamento autorizada:
   `https://developers.google.com/oauthplayground`.
6. Abra o [OAuth 2.0 Playground](https://developers.google.com/oauthplayground/),
   clique na engrenagem, marque **Use your own OAuth credentials** e informe o
   client ID e client secret recém-criados.
7. Autorize somente o escopo
   `https://www.googleapis.com/auth/drive.file`.
8. Troque o código por tokens e copie o **refresh token**.

O escopo `drive.file` limita o aplicativo aos arquivos criados/abertos por ele.
Deixe `GOOGLE_DRIVE_ROOT_FOLDER_ID` vazio: no primeiro uso o Arquiva criará a
pasta `ARQUIVA_DOCUMENTOS` por conta própria. Isso é mais seguro do que dar
acesso amplo a todo o Drive.

## 3. Cadastre os Secrets da Edge Function no Supabase

No projeto Supabase `arquiva` (`inprcbiijjtflggikvan`), abra **Edge Functions →
Secrets** e adicione:

| Nome | Valor |
| --- | --- |
| `GOOGLE_OAUTH_CLIENT_ID` | client ID OAuth novo |
| `GOOGLE_OAUTH_CLIENT_SECRET` | client secret OAuth novo |
| `GOOGLE_OAUTH_REFRESH_TOKEN` | refresh token novo |
| `GOOGLE_DRIVE_ROOT_FOLDER_ID` | opcional; não crie para usar a pasta automática |
| `ALLOWED_ORIGINS` | `https://zkx4343.github.io,http://localhost:5173` |

Não crie manualmente `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEYS` ou chaves
secretas do Supabase: a plataforma já fornece essas variáveis à função.

Alternativa por terminal, usando um arquivo local que nunca será enviado ao
Git:

```sh
npx supabase login
npx supabase link --project-ref inprcbiijjtflggikvan
npx supabase secrets set --env-file supabase/functions/.env.local
```

O modelo seguro está em `supabase/functions/.env.example`. Copie-o para
`.env.local`, preencha e apague o arquivo local quando terminar.

## 4. Configure o banco e a Edge Function do Supabase

Esta versão já foi aplicada ao projeto conectado: as tabelas
`arquiva_folders` e `arquiva_files`, as políticas RLS e a função `arquiva-api`
estão ativas. Os arquivos correspondentes permanecem no repositório para
reprodução e futuras mudanças.

Em uma reinstalação, execute:

```sh
npx supabase link --project-ref inprcbiijjtflggikvan
npx supabase db push
npx supabase functions deploy arquiva-api
```

No painel, confirme:

- **Database → Tables**: RLS habilitado nas duas tabelas.
- **Edge Functions → arquiva-api**: JWT verification habilitada.
- Nenhuma chave Google aparece em tabela, variável `VITE_*` ou arquivo do
  repositório.

## 5. Configure o login no Supabase

1. Abra **Authentication → Providers → Email** e habilite e-mail/senha.
2. Em **Authentication → Users**, crie o primeiro usuário administrador com
   e-mail e senha forte. Não existe login do desenvolvedor embutido no site.
3. Em **Authentication → URL Configuration**, use:
   - **Site URL**: `https://zkx4343.github.io/arquiva01/`
   - **Redirect URL de produção**:
     `https://zkx4343.github.io/arquiva01/`
   - **Redirect URL local**: `http://localhost:5173/**`
4. Ative confirmação de e-mail para novos cadastros se futuramente permitir
   autoinscrição. Para um site privado, prefira usuários criados manualmente.
5. Ative MFA/TOTP antes de liberar acesso a outras pessoas.

## 6. Configure as variáveis públicas no GitHub

No repositório privado `zkx4343/arquiva01`, abra **Settings → Secrets and
variables → Actions → Variables** e crie:

| Variável | Valor |
| --- | --- |
| `VITE_SUPABASE_URL` | `https://inprcbiijjtflggikvan.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | chave `sb_publishable_...` ativa do projeto |

Use **Variables**, não **Secrets**, para esses dois valores. A chave
publicável faz parte do JavaScript entregue ao navegador; a segurança real vem
do login e das políticas RLS.

Nunca crie no GitHub variáveis `VITE_*` com client secret, refresh token,
`sb_secret`, service role ou chave privada Google. Tudo que começa com `VITE_`
fica público no bundle.

## 7. Ative e publique no GitHub Pages

1. Em **Settings → Pages → Build and deployment**, escolha **GitHub Actions**.
2. Envie a branch `main`. O workflow `.github/workflows/pages.yml` instalará as
   dependências, gerará `dist/` com base `/arquiva01/` e publicará o site.
3. Em **Actions**, aguarde os workflows **Verificar projeto** e **Publicar no
   GitHub Pages** ficarem verdes.
4. Abra `https://zkx4343.github.io/arquiva01/`.

GitHub Pages em repositório privado exige GitHub Pro, Team ou Enterprise. Mesmo
com o código privado, o site do Pages normalmente continua público; o login do
Supabase e o RLS protegem os dados. Se a conta estiver no plano Free, será
necessário contratar Pro ou tornar o repositório público para usar Pages.

## 8. Teste final

1. Entre com o usuário criado no Supabase.
2. Crie, renomeie e exclua uma pasta.
3. Envie uma imagem, um PDF, um áudio, um vídeo e um arquivo de texto.
4. Confira prévia, busca, download, favoritos, mover e restaurar da lixeira.
5. Abra o Google Drive e confirme a pasta `ARQUIVA_DOCUMENTOS`.
6. Confira o cartão de armazenamento. Ele consulta `storageQuota.limit` e
   `storageQuota.usage`, atualiza a cada 15 segundos, após alterações e ao voltar
   para a aba.
7. Exclua um arquivo definitivamente e aguarde alguns segundos. A lixeira
   interna do Arquiva não libera espaço até a exclusão definitiva.
8. Teste em celular real nos modos claro, escuro e automático.

O total mostrado é o armazenamento global da conta Google e pode incluir Drive,
Gmail e Google Fotos. É esse total que corresponde ao espaço realmente
disponível na conta.

## Próximas melhorias recomendadas

- Miniaturas reduzidas para galerias com centenas de fotos.
- Seleção e ações em lote.
- Arrastar arquivos entre pastas.
- Histórico de atividades e alertas de login.
- MFA obrigatório para administradores.
- PWA instalável e fila de uploads retomáveis.
- Versionamento de documentos e política automática de limpeza da lixeira.
