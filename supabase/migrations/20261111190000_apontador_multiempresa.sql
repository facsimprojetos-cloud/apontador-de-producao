-- Multiempresa: cada acesso pertence a uma empresa e cada tabela do apontador ganha empresa_id.
-- O isolamento é feito por uma política RESTRITIVA por tabela (somada às políticas que já existem).
-- Os dados que já existem passam para a empresa FACSIM (id criado aqui). Nada é apagado.

CREATE TABLE IF NOT EXISTS public.empresas (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome text NOT NULL CHECK (btrim(nome) <> ''),
  documento text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS empresas_nome_ci ON public.empresas (lower(btrim(nome)));
ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.empresas FROM anon, authenticated;
GRANT SELECT ON public.empresas TO authenticated;

INSERT INTO public.empresas (nome) SELECT 'FACSIM'
WHERE NOT EXISTS (SELECT 1 FROM public.empresas WHERE lower(nome)='facsim');

ALTER TABLE public.apontador_acessos
  ADD COLUMN IF NOT EXISTS empresa_id bigint REFERENCES public.empresas(id),
  ADD COLUMN IF NOT EXISTS nome text,
  ADD COLUMN IF NOT EXISTS dono_plataforma boolean NOT NULL DEFAULT false;
UPDATE public.apontador_acessos SET empresa_id=(SELECT id FROM public.empresas WHERE lower(nome)='facsim') WHERE empresa_id IS NULL;
ALTER TABLE public.apontador_acessos ALTER COLUMN empresa_id SET NOT NULL;
UPDATE public.apontador_acessos SET dono_plataforma=true WHERE email='facsimprojetos@gmail.com';
CREATE INDEX IF NOT EXISTS apontador_acessos_empresa_idx ON public.apontador_acessos(empresa_id);

-- Empresa do usuário logado (nula se o acesso ou a empresa estiverem inativos).
CREATE OR REPLACE FUNCTION public.apontador_empresa_atual()
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
  SELECT a.empresa_id FROM public.apontador_acessos a JOIN public.empresas e ON e.id=a.empresa_id AND e.ativo
   WHERE a.ativo AND a.email = lower((SELECT auth.jwt()->>'email'))
     AND (SELECT auth.uid()) IS NOT NULL AND coalesce((SELECT auth.jwt()->>'is_anonymous'),'false') <> 'true'
   LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.apontador_empresa_atual() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.apontador_empresa_atual() TO authenticated;

DROP POLICY IF EXISTS empresa_ler ON public.empresas;
CREATE POLICY empresa_ler ON public.empresas FOR SELECT TO authenticated USING (id = (SELECT public.apontador_empresa_atual()));

-- empresa_id + política restritiva em todas as tabelas do apontador
DO $mig$
DECLARE t text; v_fac bigint := (SELECT id FROM public.empresas WHERE lower(nome)='facsim');
BEGIN
  FOR t IN SELECT c.relname FROM pg_class c WHERE c.relnamespace='"APONTADOR DE PRODUÇÃO"'::regnamespace AND c.relkind='r' LOOP
    EXECUTE format('ALTER TABLE "APONTADOR DE PRODUÇÃO".%I ADD COLUMN IF NOT EXISTS empresa_id bigint REFERENCES public.empresas(id)', t);
    -- gatilhos desligados só durante o preenchimento, para não recalcular histórico
    EXECUTE format('ALTER TABLE "APONTADOR DE PRODUÇÃO".%I DISABLE TRIGGER USER', t);
    EXECUTE format('UPDATE "APONTADOR DE PRODUÇÃO".%I SET empresa_id=%s WHERE empresa_id IS NULL', t, v_fac);
    EXECUTE format('ALTER TABLE "APONTADOR DE PRODUÇÃO".%I ENABLE TRIGGER USER', t);
    EXECUTE format('ALTER TABLE "APONTADOR DE PRODUÇÃO".%I ALTER COLUMN empresa_id SET DEFAULT public.apontador_empresa_atual(), ALTER COLUMN empresa_id SET NOT NULL', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON "APONTADOR DE PRODUÇÃO".%I (empresa_id)', left(t,40)||'_empresa_idx', t);
    EXECUTE format('DROP POLICY IF EXISTS empresa_isolamento ON "APONTADOR DE PRODUÇÃO".%I', t);
    EXECUTE format('CREATE POLICY empresa_isolamento ON "APONTADOR DE PRODUÇÃO".%I AS RESTRICTIVE FOR ALL TO authenticated USING (empresa_id = (SELECT public.apontador_empresa_atual())) WITH CHECK (empresa_id = (SELECT public.apontador_empresa_atual()))', t);
  END LOOP;
END
$mig$;

-- Unicidades passam a valer por empresa
ALTER TABLE "APONTADOR DE PRODUÇÃO".bonificacao_faixas DROP CONSTRAINT bonificacao_faixas_pkey, ADD PRIMARY KEY (empresa_id, eficiencia_min);
ALTER TABLE "APONTADOR DE PRODUÇÃO".bonificacao_faixas_coletiva DROP CONSTRAINT bonificacao_faixas_coletiva_pkey, ADD PRIMARY KEY (empresa_id, eficiencia_min);
ALTER TABLE "APONTADOR DE PRODUÇÃO".bonificacao_faltas DROP CONSTRAINT bonificacao_faltas_pkey, ADD PRIMARY KEY (empresa_id, faltas_min);
ALTER TABLE "APONTADOR DE PRODUÇÃO".bonificacao_config DROP CONSTRAINT bonificacao_config_pkey, ADD PRIMARY KEY (empresa_id), ALTER COLUMN id SET DEFAULT true;
ALTER TABLE "APONTADOR DE PRODUÇÃO".jornada_semana DROP CONSTRAINT jornada_semana_pkey, ADD PRIMARY KEY (empresa_id, dia_semana);
ALTER TABLE "APONTADOR DE PRODUÇÃO".horarios_padrao DROP CONSTRAINT horarios_padrao_unico, ADD CONSTRAINT horarios_padrao_unico UNIQUE (empresa_id, inicio, fim);
ALTER TABLE "APONTADOR DE PRODUÇÃO".niveis_operador DROP CONSTRAINT niveis_operador_ordem_key, ADD CONSTRAINT niveis_operador_ordem_key UNIQUE (empresa_id, ordem);
DROP INDEX "APONTADOR DE PRODUÇÃO".niveis_operador_nome_ci;   CREATE UNIQUE INDEX niveis_operador_nome_ci ON "APONTADOR DE PRODUÇÃO".niveis_operador (empresa_id, lower(btrim(nome)));
DROP INDEX "APONTADOR DE PRODUÇÃO".funcionarios_matricula_unica_ci; CREATE UNIQUE INDEX funcionarios_matricula_unica_ci ON "APONTADOR DE PRODUÇÃO".funcionarios (empresa_id, lower(btrim(matricula))) WHERE matricula IS NOT NULL;
DROP INDEX "APONTADOR DE PRODUÇÃO".funcoes_nome_unico_ci;     CREATE UNIQUE INDEX funcoes_nome_unico_ci ON "APONTADOR DE PRODUÇÃO".funcoes (empresa_id, lower(btrim(nome)));
DROP INDEX "APONTADOR DE PRODUÇÃO".grupos_codigo_ci;          CREATE UNIQUE INDEX grupos_codigo_ci ON "APONTADOR DE PRODUÇÃO".grupos (empresa_id, lower(btrim(codigo))) WHERE codigo IS NOT NULL;
DROP INDEX "APONTADOR DE PRODUÇÃO".maquinas_codigo_unico_ci;  CREATE UNIQUE INDEX maquinas_codigo_unico_ci ON "APONTADOR DE PRODUÇÃO".maquinas (empresa_id, lower(btrim(codigo))) WHERE codigo IS NOT NULL;
DROP INDEX "APONTADOR DE PRODUÇÃO".maquinas_nome_unico_ci;    CREATE UNIQUE INDEX maquinas_nome_unico_ci ON "APONTADOR DE PRODUÇÃO".maquinas (empresa_id, lower(btrim(nome)));
DROP INDEX "APONTADOR DE PRODUÇÃO".processos_codigo_ci;       CREATE UNIQUE INDEX processos_codigo_ci ON "APONTADOR DE PRODUÇÃO".processos (empresa_id, lower(btrim(codigo))) WHERE codigo IS NOT NULL;
DROP INDEX "APONTADOR DE PRODUÇÃO".processos_nome_ci;         CREATE UNIQUE INDEX processos_nome_ci ON "APONTADOR DE PRODUÇÃO".processos (empresa_id, lower(btrim(nome)));
DROP INDEX "APONTADOR DE PRODUÇÃO".produtos_codigo_ci;        CREATE UNIQUE INDEX produtos_codigo_ci ON "APONTADOR DE PRODUÇÃO".produtos (empresa_id, lower(btrim(codigo))) WHERE codigo IS NOT NULL;
DROP INDEX "APONTADOR DE PRODUÇÃO".setores_nome_unico_ci;     CREATE UNIQUE INDEX setores_nome_unico_ci ON "APONTADOR DE PRODUÇÃO".setores (empresa_id, lower(btrim(nome)));

-- Ajustes pontuais nas funções que usam as unicidades alteradas
DO $mig$
DECLARE d text; n text;
BEGIN
  d := pg_get_functiondef('public.apontador_salvar(text,jsonb)'::regprocedure);
  n := replace(d, 'ON CONFLICT (inicio,fim)', 'ON CONFLICT (empresa_id,inicio,fim)');
  IF n = d THEN RAISE EXCEPTION 'apontador_salvar: ON CONFLICT de horários não encontrado'; END IF;
  EXECUTE n;

  d := pg_get_functiondef('public.apontador_ausencia_salvar(text,jsonb)'::regprocedure);
  n := replace(d, 'ON CONFLICT (dia_semana)', 'ON CONFLICT (empresa_id,dia_semana)');
  IF n = d THEN RAISE EXCEPTION 'apontador_ausencia_salvar: ON CONFLICT da jornada não encontrado'; END IF;
  EXECUTE n;

  d := pg_get_functiondef('public.apontador_bonificacao_salvar(text,jsonb)'::regprocedure);
  n := replace(d, 'INSERT INTO "APONTADOR DE PRODUÇÃO".bonificacao_config (id, coletiva_ativa', 'INSERT INTO "APONTADOR DE PRODUÇÃO".bonificacao_config (coletiva_ativa');
  n := replace(n, 'VALUES (true, coalesce((p_dados->''config''->>''coletivaAtiva'')', 'VALUES (coalesce((p_dados->''config''->>''coletivaAtiva'')');
  n := replace(n, 'ON CONFLICT (id) DO UPDATE', 'ON CONFLICT (empresa_id) DO UPDATE');
  IF n NOT LIKE '%ON CONFLICT (empresa_id) DO UPDATE%' OR n LIKE '%bonificacao_config (id,%' THEN
    RAISE EXCEPTION 'apontador_bonificacao_salvar: ajuste da configuração não aplicado';
  END IF;
  EXECUTE n;

  -- gatilho SECURITY DEFINER: a falta herda a empresa da ausência
  d := pg_get_functiondef('"APONTADOR DE PRODUÇÃO".ausencia_vincular_falta()'::regprocedure);
  n := replace(d, 'INSERT INTO "APONTADOR DE PRODUÇÃO".faltas (funcionario_id, data, observacao, registrado_por)
    VALUES (NEW.funcionario_id, NEW.data,', 'INSERT INTO "APONTADOR DE PRODUÇÃO".faltas (empresa_id, funcionario_id, data, observacao, registrado_por)
    VALUES (NEW.empresa_id, NEW.funcionario_id, NEW.data,');
  IF n = d THEN RAISE EXCEPTION 'ausencia_vincular_falta: insert de faltas não encontrado'; END IF;
  EXECUTE n;

  d := pg_get_functiondef('public.apontador_carregar()'::regprocedure);
  n := replace(d, $a$    'perfil', (SELECT a.perfil FROM public.apontador_acessos a WHERE a.email = lower((select auth.jwt()->>'email')) AND a.ativo LIMIT 1),$a$,
    $b$    'perfil', (SELECT a.perfil FROM public.apontador_acessos a WHERE a.email = lower((select auth.jwt()->>'email')) AND a.ativo LIMIT 1),
    'empresa', (SELECT jsonb_build_object('id',e.id::text,'nome',e.nome) FROM public.empresas e WHERE e.id = public.apontador_empresa_atual()),
    'donoPlataforma', coalesce((SELECT a.dono_plataforma FROM public.apontador_acessos a WHERE a.email = lower((select auth.jwt()->>'email')) AND a.ativo LIMIT 1), false),$b$);
  n := replace(n, $a$  IF NOT EXISTS(SELECT 1 FROM public.apontador_acessos a WHERE a.email = lower((select auth.jwt()->>'email')) AND a.ativo) THEN$a$,
    $b$  IF public.apontador_empresa_atual() IS NULL THEN$b$);
  IF n NOT LIKE '%''donoPlataforma''%' OR n NOT LIKE '%IF public.apontador_empresa_atual() IS NULL THEN%' THEN
    RAISE EXCEPTION 'apontador_carregar: ajuste não aplicado';
  END IF;
  EXECUTE n;

  -- admin = admin da própria empresa ativa
  CREATE OR REPLACE FUNCTION public.apontador_eh_admin() RETURNS boolean LANGUAGE sql STABLE SET search_path TO '' AS
  $f$ SELECT EXISTS (SELECT 1 FROM public.apontador_acessos a JOIN public.empresas e ON e.id=a.empresa_id AND e.ativo
                     WHERE a.ativo AND a.perfil='admin' AND a.email = lower((SELECT auth.jwt()->>'email'))) $f$;
END
$mig$;

-- ===== Gestão de acessos (somente leitura/ajuste de cadastro; criação de login fica na Edge Function) =====
CREATE OR REPLACE FUNCTION public.apontador_dono_plataforma() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.apontador_acessos a WHERE a.ativo AND a.dono_plataforma
                  AND a.email = lower((SELECT auth.jwt()->>'email')) AND (SELECT auth.uid()) IS NOT NULL)
$$;

-- Configurações iniciais de uma empresa nova, copiadas da empresa modelo (FACSIM): faixas, regras de faltas, níveis, horários e jornada.
CREATE OR REPLACE FUNCTION public.apontador_empresa_semear(p_empresa bigint) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE v_mod bigint := (SELECT id FROM public.empresas WHERE lower(nome)='facsim');
BEGIN
  IF p_empresa = v_mod THEN RETURN; END IF;
  INSERT INTO "APONTADOR DE PRODUÇÃO".bonificacao_faixas (empresa_id, eficiencia_min, percentual)
    SELECT p_empresa, eficiencia_min, percentual FROM "APONTADOR DE PRODUÇÃO".bonificacao_faixas WHERE empresa_id=v_mod ON CONFLICT DO NOTHING;
  INSERT INTO "APONTADOR DE PRODUÇÃO".bonificacao_faixas_coletiva (empresa_id, eficiencia_min, percentual)
    SELECT p_empresa, eficiencia_min, percentual FROM "APONTADOR DE PRODUÇÃO".bonificacao_faixas_coletiva WHERE empresa_id=v_mod ON CONFLICT DO NOTHING;
  INSERT INTO "APONTADOR DE PRODUÇÃO".bonificacao_faltas (empresa_id, faltas_min, perda_percentual)
    SELECT p_empresa, faltas_min, perda_percentual FROM "APONTADOR DE PRODUÇÃO".bonificacao_faltas WHERE empresa_id=v_mod ON CONFLICT DO NOTHING;
  INSERT INTO "APONTADOR DE PRODUÇÃO".bonificacao_config (empresa_id, coletiva_ativa, coletiva_base, coletiva_desconta_faltas)
    VALUES (p_empresa, true, 'fabrica', true) ON CONFLICT DO NOTHING;
  INSERT INTO "APONTADOR DE PRODUÇÃO".niveis_operador (empresa_id, nome, ordem, descricao, ativo)
    SELECT p_empresa, nome, ordem, descricao, ativo FROM "APONTADOR DE PRODUÇÃO".niveis_operador WHERE empresa_id=v_mod ON CONFLICT DO NOTHING;
  INSERT INTO "APONTADOR DE PRODUÇÃO".horarios_padrao (empresa_id, inicio, fim, ativo)
    SELECT p_empresa, inicio, fim, ativo FROM "APONTADOR DE PRODUÇÃO".horarios_padrao WHERE empresa_id=v_mod AND ativo ON CONFLICT DO NOTHING;
  INSERT INTO "APONTADOR DE PRODUÇÃO".jornada_semana (empresa_id, dia_semana, ativo, entrada, saida, intervalo_inicio, intervalo_fim)
    SELECT p_empresa, dia_semana, ativo, entrada, saida, intervalo_inicio, intervalo_fim FROM "APONTADOR DE PRODUÇÃO".jornada_semana WHERE empresa_id=v_mod ON CONFLICT DO NOTHING;
END $$;
REVOKE ALL ON FUNCTION public.apontador_empresa_semear(bigint) FROM public, anon, authenticated;

-- Lista empresas e usuários: dono vê todas; admin de empresa vê só a dele.
CREATE OR REPLACE FUNCTION public.apontador_acessos_listar() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $$
DECLARE v_dono boolean := public.apontador_dono_plataforma(); v_emp bigint := public.apontador_empresa_atual();
BEGIN
  IF NOT v_dono AND NOT public.apontador_eh_admin() THEN
    RAISE EXCEPTION 'Somente administradores podem gerenciar acessos.' USING ERRCODE='42501';
  END IF;
  RETURN jsonb_build_object('dono', v_dono, 'minhaEmpresa', v_emp::text, 'empresas', (
    SELECT coalesce(jsonb_agg(jsonb_build_object('id',e.id::text,'nome',e.nome,'documento',e.documento,'ativo',e.ativo,'criadaEm',e.created_at,
      'funcionarios',(SELECT count(*) FROM "APONTADOR DE PRODUÇÃO".funcionarios f WHERE f.empresa_id=e.id),
      'lancamentos',(SELECT count(*) FROM "APONTADOR DE PRODUÇÃO"."Lançamentos" l WHERE l.empresa_id=e.id),
      'usuarios',(SELECT coalesce(jsonb_agg(jsonb_build_object('email',a.email,'nome',a.nome,'perfil',a.perfil,'ativo',a.ativo,'dono',a.dono_plataforma) ORDER BY a.perfil, a.email),'[]'::jsonb)
                  FROM public.apontador_acessos a WHERE a.empresa_id=e.id)) ORDER BY e.id),'[]'::jsonb)
      FROM public.empresas e WHERE v_dono OR e.id = v_emp));
END $$;

-- Empresa: criar, renomear, ativar/bloquear (somente dono).
CREATE OR REPLACE FUNCTION public.apontador_empresa_salvar(p_dados jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE v_id bigint := nullif(p_dados->>'id','')::bigint;
BEGIN
  IF NOT public.apontador_dono_plataforma() THEN RAISE EXCEPTION 'Somente o dono da plataforma gerencia empresas.' USING ERRCODE='42501'; END IF;
  IF v_id IS NULL THEN
    INSERT INTO public.empresas (nome, documento) VALUES (btrim(p_dados->>'nome'), nullif(btrim(p_dados->>'documento'),'')) RETURNING id INTO v_id;
    PERFORM public.apontador_empresa_semear(v_id);
  ELSE
    IF v_id = public.apontador_empresa_atual() AND (p_dados->>'ativo')::boolean IS FALSE THEN
      RAISE EXCEPTION 'Você não pode bloquear a sua própria empresa.';
    END IF;
    UPDATE public.empresas SET nome=coalesce(nullif(btrim(p_dados->>'nome'),''),nome),
           documento=CASE WHEN p_dados ? 'documento' THEN nullif(btrim(p_dados->>'documento'),'') ELSE documento END,
           ativo=coalesce((p_dados->>'ativo')::boolean, ativo)
     WHERE id=v_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Empresa não encontrada.'; END IF;
  END IF;
  RETURN jsonb_build_object('ok',true,'id',v_id::text);
END $$;

-- Usuário já existente: perfil, nome, ativo. (Criar login e senha: Edge Function apontador-acessos.)
CREATE OR REPLACE FUNCTION public.apontador_acesso_salvar(p_dados jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE v_email text := lower(btrim(p_dados->>'email')); v_eu text := lower((SELECT auth.jwt()->>'email')); v_alvo public.apontador_acessos;
BEGIN
  SELECT * INTO v_alvo FROM public.apontador_acessos WHERE email=v_email;
  IF NOT FOUND THEN RAISE EXCEPTION 'Usuário não encontrado.'; END IF;
  IF NOT (public.apontador_dono_plataforma() OR (public.apontador_eh_admin() AND v_alvo.empresa_id = public.apontador_empresa_atual())) THEN
    RAISE EXCEPTION 'Sem permissão para alterar este usuário.' USING ERRCODE='42501';
  END IF;
  IF v_email = v_eu AND (coalesce(p_dados->>'perfil','admin') <> 'admin' OR (p_dados->>'ativo')::boolean IS FALSE) THEN
    RAISE EXCEPTION 'Você não pode tirar o seu próprio acesso de administrador.';
  END IF;
  IF v_alvo.dono_plataforma AND v_email <> v_eu THEN RAISE EXCEPTION 'O dono da plataforma só pode ser alterado por ele mesmo.'; END IF;
  UPDATE public.apontador_acessos SET
     perfil = CASE WHEN p_dados->>'perfil' IN ('admin','editor','leitor') THEN p_dados->>'perfil' ELSE perfil END,
     nome = CASE WHEN p_dados ? 'nome' THEN nullif(btrim(p_dados->>'nome'),'') ELSE nome END,
     ativo = coalesce((p_dados->>'ativo')::boolean, ativo)
   WHERE email=v_email;
  RETURN jsonb_build_object('ok',true,'email',v_email);
END $$;

REVOKE ALL ON FUNCTION public.apontador_dono_plataforma(), public.apontador_acessos_listar(), public.apontador_empresa_salvar(jsonb), public.apontador_acesso_salvar(jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.apontador_dono_plataforma(), public.apontador_acessos_listar(), public.apontador_empresa_salvar(jsonb), public.apontador_acesso_salvar(jsonb) TO authenticated;
