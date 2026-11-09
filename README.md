# GUT Apontador de Produção

Frontend publicado via **GitHub Pages** e conectado ao **Supabase** (projeto `PROJETOS`, schema `APONTADOR DE PRODUÇÃO`).

## Acesso e segurança

- Supabase Auth — login por e-mail e senha, sem contas anônimas.
- Funções `public.apontador_carregar()` e `public.apontador_salvar()` no Postgres, com `SECURITY INVOKER` e **RLS**.
- O schema operacional não precisa ser exposto diretamente na Data API; os RPCs estão no schema `public`.
- `public.apontador_acessos` determina os usuários autorizados e seus perfis (admin, editor, leitor).
- No frontend existe **apenas a chave publicável** do Supabase (projetada para uso no navegador). Nunca incluir `service_role`, secret keys ou senhas no repositório.
- O perfil `leitor` pode ler mas não alterar. `admin` e `editor` têm acesso aos formulários de escrita.
- A senha de acesso não é criada no GitHub: deve ser cadastrada pelo administrador no Supabase Auth.

## Primeiro login (uma vez)

Acesse o painel Supabase do projeto PROJETOS, escolha **Authentication → Users → Add user**, informe seu e-mail aprovado em `public.apontador_acessos`, defina uma senha forte e marque a opção de confirmação de e-mail quando disponível. Não publique ou envie essa senha no chat. Depois entre em https://facsimprojetos-cloud.github.io/apontador-de-producao/.

Se o seu e-mail não estiver na lista de acesso, o login será recusado para uso das tabelas mesmo quando o usuário existir no Supabase Auth. Outras contas precisam ser autorizadas explicitamente pelo administrador, via `apontador_acessos`.

## Funcionalidades disponíveis

- Dashboard, apontamentos, eficiência, funcionários/setor/máquinas/funções.
- Produtos, processos e roteiro com tempo padrão em segundos.
- Revisões individuais de tempo e nível com histórico das vigências; apontamentos anteriores preservam tempo/meta do momento.
- Filtros e exportação CSV.
- Dados carregados e gravados pelo Supabase; sem `localStorage` para armazenamento dos cadastros (o Supabase Auth guarda a sessão no navegador).

Os dados iniciais presentes no banco são **fictícios** e identificados com `[SIM]` ou `SIM-`. Não utilizar produção real enquanto não for validado.

## Publicação automática

Repositório: https://github.com/facsimprojetos-cloud/apontador-de-producao
Ambiente de testes (GitHub Pages): https://facsimprojetos-cloud.github.io/apontador-de-producao/
Painel de TV: https://facsimprojetos-cloud.github.io/apontador-de-producao/#tv

Branch `main`, publicada automaticamente pelo GitHub Pages a partir da raiz, sem build.
O Netlify não é mais usado para novas publicações (`netlify.toml` mantido apenas por compatibilidade).

## Banco de dados (migrações)

As alterações de banco ficam versionadas em `supabase/migrations/` (a partir de 2026-11-09). Migrações anteriores
foram aplicadas diretamente no Supabase e constam apenas no histórico do projeto.

Regras importantes:
- Cada apontamento grava `etapa_final_snapshot`: peças prontas não mudam quando a operação final do produto é trocada
  (a menos que a opção "aplicar aos apontamentos já registrados" seja marcada).
- O tempo individual aplicado é o vigente na data/hora do apontamento (`tempo_vigente`), inclusive para lançamentos retroativos.
- `horarios_padrao` define os atalhos de hora em hora da aba Apontar; `apontador_previa` calcula a meta no Supabase.

## Observações

- A biblioteca oficial do Supabase é carregada de CDN com versão fixa (2.117.1).
- Para projetos de grande volume, a função atual que devolve todos os dados em JSON precisará ser substituída por consultas paginadas.
- Revisões de tempo são manuais. Não há política salarial automática.
- Edições de registros existentes, exclusões, configuração de novos níveis e gestão de acessos pela interface ainda não foram implementadas.
