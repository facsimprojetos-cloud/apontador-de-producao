# GUT Apontador de Produção

Protótipo demonstrativo de controle de produção para confecção, com dashboard, apontamentos por hora/período parcial, funcionários, produtos, processos e níveis/tempos individuais.

## Ambiente

- GitHub: facsimprojetos-cloud/apontador-de-producao
- Netlify (projeto separado): gut-apontador-producao
- Publicação: branch `main`; diretório publicado `.`; sem comando de build.
- Backend de destino (ainda não conectado): Supabase projeto `PROJETOS`, schema `APONTADOR DE PRODUÇÃO`.

## Importante

Esta versão usa somente dados fictícios no navegador (`localStorage`). As operações **não são gravadas no Supabase** nem compartilhadas entre dispositivos. Não utilize dados reais ou sensíveis. Não há autenticação neste protótipo.

Para conectar o Supabase real, configurar autenticação, políticas RLS, permissões e acesso seguro ao schema. Nunca incluir chaves secretas/service_role no HTML ou JavaScript público.

## Fluxo de publicação

No projeto Netlify existente `gut-apontador-producao`, use **Link repository / Set up continuous deployment → GitHub → facsimprojetos-cloud/apontador-de-producao → main**. Publish directory `.`; build command vazio. Depois disso, novos commits em `main` atualizam automaticamente o site.

.gitignore já exclui `.netlify/` e arquivos de ambiente.
