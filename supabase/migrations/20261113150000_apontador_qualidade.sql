-- Qualidade: operações marcadas como ponto de inspeção abrem um formulário (opcional) no apontamento.
-- Catálogo de defeitos por empresa, registro de inspeção por lançamento e quantidades por defeito.

ALTER TABLE "APONTADOR DE PRODUÇÃO".produto_processos
  ADD COLUMN IF NOT EXISTS inspecao_qualidade boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "APONTADOR DE PRODUÇÃO".qualidade_defeitos (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empresa_id bigint NOT NULL DEFAULT public.apontador_empresa_atual() REFERENCES public.empresas(id),
  nome text NOT NULL CHECK (btrim(nome) <> ''),
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS qualidade_defeitos_nome_ci ON "APONTADOR DE PRODUÇÃO".qualidade_defeitos (empresa_id, lower(btrim(nome)));

CREATE TABLE IF NOT EXISTS "APONTADOR DE PRODUÇÃO".qualidade_registros (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empresa_id bigint NOT NULL DEFAULT public.apontador_empresa_atual() REFERENCES public.empresas(id),
  lancamento_id bigint NOT NULL UNIQUE REFERENCES "APONTADOR DE PRODUÇÃO"."Lançamentos"(id) ON DELETE CASCADE,
  inspecionadas integer CHECK (inspecionadas IS NULL OR inspecionadas >= 0),
  defeituosas integer CHECK (defeituosas IS NULL OR defeituosas >= 0),
  retrabalho integer CHECK (retrabalho IS NULL OR retrabalho >= 0),
  refugo integer CHECK (refugo IS NULL OR refugo >= 0),
  observacao text,
  registrado_por text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS qualidade_registros_empresa_idx ON "APONTADOR DE PRODUÇÃO".qualidade_registros (empresa_id);

CREATE TABLE IF NOT EXISTS "APONTADOR DE PRODUÇÃO".qualidade_registro_defeitos (
  registro_id bigint NOT NULL REFERENCES "APONTADOR DE PRODUÇÃO".qualidade_registros(id) ON DELETE CASCADE,
  defeito_id bigint NOT NULL REFERENCES "APONTADOR DE PRODUÇÃO".qualidade_defeitos(id),
  empresa_id bigint NOT NULL DEFAULT public.apontador_empresa_atual() REFERENCES public.empresas(id),
  quantidade integer NOT NULL CHECK (quantidade > 0),
  PRIMARY KEY (registro_id, defeito_id)
);

-- RLS: todos os perfis da empresa leem; admin e editor gravam; isolamento por empresa
DO $mig$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['qualidade_defeitos','qualidade_registros','qualidade_registro_defeitos'] LOOP
    EXECUTE format('ALTER TABLE "APONTADOR DE PRODUÇÃO".%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON "APONTADOR DE PRODUÇÃO".%I FROM anon', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON "APONTADOR DE PRODUÇÃO".%I TO authenticated', t);
    EXECUTE format('DROP POLICY IF EXISTS apontador_ler ON "APONTADOR DE PRODUÇÃO".%I', t);
    EXECUTE format($p$CREATE POLICY apontador_ler ON "APONTADOR DE PRODUÇÃO".%I FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.apontador_acessos a WHERE a.ativo AND a.email = lower((SELECT auth.jwt()->>'email'))))$p$, t);
    EXECUTE format('DROP POLICY IF EXISTS apontador_gravar ON "APONTADOR DE PRODUÇÃO".%I', t);
    EXECUTE format($p$CREATE POLICY apontador_gravar ON "APONTADOR DE PRODUÇÃO".%I FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.apontador_acessos a WHERE a.ativo AND a.email = lower((SELECT auth.jwt()->>'email')) AND a.perfil IN ('admin','editor'))) WITH CHECK (EXISTS (SELECT 1 FROM public.apontador_acessos a WHERE a.ativo AND a.email = lower((SELECT auth.jwt()->>'email')) AND a.perfil IN ('admin','editor')))$p$, t);
    EXECUTE format('DROP POLICY IF EXISTS empresa_isolamento ON "APONTADOR DE PRODUÇÃO".%I', t);
    EXECUTE format('CREATE POLICY empresa_isolamento ON "APONTADOR DE PRODUÇÃO".%I AS RESTRICTIVE FOR ALL TO authenticated USING (empresa_id = (SELECT public.apontador_empresa_atual())) WITH CHECK (empresa_id = (SELECT public.apontador_empresa_atual()))', t);
  END LOOP;
END
$mig$;
GRANT USAGE ON SCHEMA "APONTADOR DE PRODUÇÃO" TO authenticated;

-- Defeitos mais comuns em confecção, para todas as empresas já cadastradas (editáveis depois)
INSERT INTO "APONTADOR DE PRODUÇÃO".qualidade_defeitos (empresa_id, nome)
SELECT e.id, d.nome FROM public.empresas e
CROSS JOIN (VALUES ('Costura solta'),('Ponto falhado'),('Costura torta'),('Furo / rasgo'),('Mancha / sujeira'),('Medida fora'),('Etiqueta errada'),('Fio puxado')) d(nome)
ON CONFLICT DO NOTHING;

-- Empresa nova também recebe a lista padrão de defeitos
DO $mig$
DECLARE d text; n text;
BEGIN
  d := pg_get_functiondef('public.apontador_empresa_semear(bigint)'::regprocedure);
  n := replace(d, $a$  IF p_empresa = v_mod THEN RETURN; END IF;$a$, $b$  IF p_empresa = v_mod THEN RETURN; END IF;
  INSERT INTO "APONTADOR DE PRODUÇÃO".qualidade_defeitos (empresa_id, nome)
    SELECT p_empresa, nome FROM "APONTADOR DE PRODUÇÃO".qualidade_defeitos WHERE empresa_id=v_mod AND ativo ON CONFLICT DO NOTHING;$b$);
  IF n = d THEN RAISE EXCEPTION 'apontador_empresa_semear: trecho não encontrado'; END IF;
  EXECUTE n;

  -- carregar: roteiro com a marca de inspeção, catálogo de defeitos e registros de qualidade
  d := pg_get_functiondef('public.apontador_carregar()'::regprocedure);
  n := replace(d, $a$'final',pp.etapa_final)$a$, $b$'final',pp.etapa_final,'qualidade',pp.inspecao_qualidade)$b$);
  n := replace(n, $a$    'empresa', (SELECT jsonb_build_object('id',e.id::text,'nome',e.nome) FROM public.empresas e WHERE e.id = public.apontador_empresa_atual()),$a$,
   $b$    'empresa', (SELECT jsonb_build_object('id',e.id::text,'nome',e.nome) FROM public.empresas e WHERE e.id = public.apontador_empresa_atual()),
    'defeitos', (SELECT coalesce(jsonb_agg(jsonb_build_object('id',q.id::text,'nome',q.nome,'ativo',q.ativo) ORDER BY q.nome),'[]'::jsonb) FROM "APONTADOR DE PRODUÇÃO".qualidade_defeitos q),
    'qualidade', (SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.id::text,'lancamento',r.lancamento_id::text,'inspecionadas',r.inspecionadas,'defeituosas',r.defeituosas,
                   'retrabalho',r.retrabalho,'refugo',r.refugo,'observacao',r.observacao,
                   'defeitos',(SELECT coalesce(jsonb_agg(jsonb_build_object('defeito',x.defeito_id::text,'quantidade',x.quantidade)),'[]'::jsonb) FROM "APONTADOR DE PRODUÇÃO".qualidade_registro_defeitos x WHERE x.registro_id=r.id))),'[]'::jsonb)
                  FROM "APONTADOR DE PRODUÇÃO".qualidade_registros r),$b$);
  IF n NOT LIKE '%''qualidade'',pp.inspecao_qualidade%' OR n NOT LIKE '%''defeitos'', (SELECT%' THEN
    RAISE EXCEPTION 'apontador_carregar: ajuste de qualidade não aplicado';
  END IF;
  EXECUTE n;
END
$mig$;

-- Gravação de qualidade (SECURITY INVOKER: as políticas acima valem). Nenhum campo é obrigatório.
CREATE OR REPLACE FUNCTION public.apontador_qualidade_salvar(p_tipo text, p_dados jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path TO '' AS $$
DECLARE v_id bigint; v_lanc bigint; v_email text := lower((SELECT auth.jwt()->>'email')); x jsonb;
BEGIN
  IF public.apontador_empresa_atual() IS NULL THEN RAISE EXCEPTION 'Acesso não autorizado.' USING ERRCODE='42501'; END IF;
  CASE p_tipo
  WHEN 'registro' THEN
    v_lanc := (p_dados->>'lancamento')::bigint;
    IF NOT EXISTS (SELECT 1 FROM "APONTADOR DE PRODUÇÃO"."Lançamentos" WHERE id = v_lanc) THEN RAISE EXCEPTION 'Apontamento não encontrado.'; END IF;
    INSERT INTO "APONTADOR DE PRODUÇÃO".qualidade_registros (lancamento_id, inspecionadas, defeituosas, retrabalho, refugo, observacao, registrado_por)
    VALUES (v_lanc, nullif(p_dados->>'inspecionadas','')::numeric::int, nullif(p_dados->>'defeituosas','')::numeric::int,
            nullif(p_dados->>'retrabalho','')::numeric::int, nullif(p_dados->>'refugo','')::numeric::int,
            nullif(btrim(p_dados->>'observacao'),''), v_email)
    ON CONFLICT (lancamento_id) DO UPDATE SET inspecionadas=EXCLUDED.inspecionadas, defeituosas=EXCLUDED.defeituosas,
      retrabalho=EXCLUDED.retrabalho, refugo=EXCLUDED.refugo, observacao=EXCLUDED.observacao, registrado_por=EXCLUDED.registrado_por, updated_at=now()
    RETURNING id INTO v_id;
    DELETE FROM "APONTADOR DE PRODUÇÃO".qualidade_registro_defeitos WHERE registro_id = v_id;
    FOR x IN SELECT * FROM jsonb_array_elements(coalesce(p_dados->'defeitos','[]')) LOOP
      IF coalesce(nullif(x->>'quantidade','')::numeric,0) > 0 THEN
        INSERT INTO "APONTADOR DE PRODUÇÃO".qualidade_registro_defeitos (registro_id, defeito_id, quantidade)
        VALUES (v_id, (x->>'defeito')::bigint, (x->>'quantidade')::numeric::int);
      END IF;
    END LOOP;
  WHEN 'registro_excluir' THEN
    DELETE FROM "APONTADOR DE PRODUÇÃO".qualidade_registros WHERE lancamento_id = (p_dados->>'lancamento')::bigint RETURNING id INTO v_id;
  WHEN 'defeito' THEN
    IF nullif(p_dados->>'id','') IS NULL THEN
      INSERT INTO "APONTADOR DE PRODUÇÃO".qualidade_defeitos (nome) VALUES (btrim(p_dados->>'nome')) RETURNING id INTO v_id;
    ELSE
      UPDATE "APONTADOR DE PRODUÇÃO".qualidade_defeitos SET nome = coalesce(nullif(btrim(p_dados->>'nome'),''), nome),
             ativo = coalesce((p_dados->>'ativo')::boolean, ativo)
       WHERE id = (p_dados->>'id')::bigint RETURNING id INTO v_id;
      IF v_id IS NULL THEN RAISE EXCEPTION 'Defeito não encontrado.'; END IF;
    END IF;
  WHEN 'inspecao' THEN
    UPDATE "APONTADOR DE PRODUÇÃO".produto_processos SET inspecao_qualidade = coalesce((p_dados->>'ativo')::boolean, NOT inspecao_qualidade)
     WHERE id = (p_dados->>'roteiro')::bigint RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Operação do roteiro não encontrada.'; END IF;
  ELSE
    RAISE EXCEPTION 'Operação não permitida.';
  END CASE;
  RETURN jsonb_build_object('ok', true, 'tipo', p_tipo, 'id', v_id::text);
END $$;
REVOKE ALL ON FUNCTION public.apontador_qualidade_salvar(text, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.apontador_qualidade_salvar(text, jsonb) TO authenticated;
