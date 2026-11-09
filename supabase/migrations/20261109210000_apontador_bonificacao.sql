-- GUT Apontador — 2026-11-09
-- Bonificação progressiva mensal por eficiência.
--  * salário base por funcionário, com vigência (histórico preservado)
--  * faltas por funcionário/data
--  * regras configuráveis pelo empresário: faixas de eficiência → % de bônus e faltas → % de perda do prêmio
--  * níveis 4 e 5 (empresa com 5 níveis profissionais)
--  * RPC apontador_bonificacao(mês): cálculo no Supabase, acessível somente ao perfil admin
-- Dados salariais ficam em tabelas separadas, legíveis apenas por admin (não entram em apontador_carregar nem na TV).

-- Níveis 4 e 5 ---------------------------------------------------------------
INSERT INTO "APONTADOR DE PRODUÇÃO".niveis_operador (nome, ordem, descricao)
SELECT v.nome, v.ordem, v.descricao FROM (VALUES ('Nível 4',4,'A definir'),('Nível 5',5,'A definir')) v(nome,ordem,descricao)
WHERE NOT EXISTS (SELECT 1 FROM "APONTADOR DE PRODUÇÃO".niveis_operador n WHERE n.ordem=v.ordem);

-- Função auxiliar: usuário é admin? -----------------------------------------
CREATE OR REPLACE FUNCTION public.apontador_eh_admin()
RETURNS boolean LANGUAGE sql STABLE SET search_path = ''
AS $$ SELECT EXISTS (SELECT 1 FROM public.apontador_acessos a
                     WHERE a.ativo AND a.perfil='admin' AND a.email = lower((SELECT auth.jwt()->>'email'))) $$;
REVOKE ALL ON FUNCTION public.apontador_eh_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apontador_eh_admin() TO authenticated;

-- Salário base -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "APONTADOR DE PRODUÇÃO".funcionario_salarios (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  funcionario_id bigint NOT NULL REFERENCES "APONTADOR DE PRODUÇÃO".funcionarios(id),
  salario_base numeric(12,2) NOT NULL CHECK (salario_base >= 0),
  vigencia_inicio date NOT NULL,
  registrado_por text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (funcionario_id, vigencia_inicio)
);
COMMENT ON TABLE "APONTADOR DE PRODUÇÃO".funcionario_salarios IS 'Salário base por funcionário com vigência (mês a partir do qual vale). Somente admin.';

-- Faltas -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "APONTADOR DE PRODUÇÃO".faltas (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  funcionario_id bigint NOT NULL REFERENCES "APONTADOR DE PRODUÇÃO".funcionarios(id),
  data date NOT NULL,
  observacao text,
  registrado_por text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (funcionario_id, data)
);
COMMENT ON TABLE "APONTADOR DE PRODUÇÃO".faltas IS 'Faltas por funcionário e dia; usadas no desconto do prêmio mensal. Somente admin.';

-- Regras configuráveis -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS "APONTADOR DE PRODUÇÃO".bonificacao_faixas (
  eficiencia_min integer PRIMARY KEY CHECK (eficiencia_min BETWEEN 0 AND 1000),
  percentual numeric(6,2) NOT NULL CHECK (percentual >= 0)
);
COMMENT ON TABLE "APONTADOR DE PRODUÇÃO".bonificacao_faixas IS 'Eficiência mínima (% inteiro, arredondado para baixo) → % de bônus sobre o salário base.';
CREATE TABLE IF NOT EXISTS "APONTADOR DE PRODUÇÃO".bonificacao_faltas (
  faltas_min integer PRIMARY KEY CHECK (faltas_min >= 1),
  perda_percentual numeric(6,2) NOT NULL CHECK (perda_percentual BETWEEN 0 AND 100)
);
COMMENT ON TABLE "APONTADOR DE PRODUÇÃO".bonificacao_faltas IS 'Quantidade mínima de faltas no mês → % do prêmio perdido.';

-- Regra inicial: 81% → 0,5% ... 99% → 9,5%, 100% ou mais → 10%
INSERT INTO "APONTADOR DE PRODUÇÃO".bonificacao_faixas (eficiencia_min, percentual)
SELECT e, (e-80)*0.5 FROM generate_series(81,100) e ON CONFLICT DO NOTHING;
INSERT INTO "APONTADOR DE PRODUÇÃO".bonificacao_faltas (faltas_min, perda_percentual)
VALUES (1,10),(2,25),(3,50) ON CONFLICT DO NOTHING;

-- RLS: somente admin ----------------------------------------------------------------
DO $rls$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['funcionario_salarios','faltas','bonificacao_faixas','bonificacao_faltas'] LOOP
    EXECUTE format('ALTER TABLE "APONTADOR DE PRODUÇÃO".%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('GRANT SELECT, INSERT, DELETE ON "APONTADOR DE PRODUÇÃO".%I TO authenticated', t);
    EXECUTE format('DROP POLICY IF EXISTS apontador_admin ON "APONTADOR DE PRODUÇÃO".%I', t);
    EXECUTE format('CREATE POLICY apontador_admin ON "APONTADOR DE PRODUÇÃO".%I FOR ALL TO authenticated USING ((SELECT public.apontador_eh_admin())) WITH CHECK ((SELECT public.apontador_eh_admin()))', t);
  END LOOP;
END $rls$;
CREATE INDEX IF NOT EXISTS faltas_data_idx ON "APONTADOR DE PRODUÇÃO".faltas(data);
CREATE INDEX IF NOT EXISTS lancamentos_data_func_idx ON "APONTADOR DE PRODUÇÃO"."Lançamentos"(data_apontamento, funcionario_id);

-- Cálculo mensal ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apontador_bonificacao(p_mes date)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = ''
AS $function$
DECLARE
  v_ini date := date_trunc('month', p_mes)::date;
  v_fim date := (date_trunc('month', p_mes) + interval '1 month')::date;
BEGIN
  IF NOT public.apontador_eh_admin() THEN
    RAISE EXCEPTION 'Somente administradores podem ver a bonificação.' USING ERRCODE='42501';
  END IF;
  RETURN jsonb_build_object(
   'mes', to_char(v_ini,'YYYY-MM'),
   'faixas', (SELECT coalesce(jsonb_agg(jsonb_build_object('min',f.eficiencia_min,'pct',f.percentual) ORDER BY f.eficiencia_min),'[]'::jsonb) FROM "APONTADOR DE PRODUÇÃO".bonificacao_faixas f),
   'regrasFaltas', (SELECT coalesce(jsonb_agg(jsonb_build_object('min',r.faltas_min,'perda',r.perda_percentual) ORDER BY r.faltas_min),'[]'::jsonb) FROM "APONTADOR DE PRODUÇÃO".bonificacao_faltas r),
   'faltas', (SELECT coalesce(jsonb_agg(jsonb_build_object('id',x.id::text,'funcionario',x.funcionario_id::text,'data',x.data,'observacao',x.observacao) ORDER BY x.data, x.funcionario_id),'[]'::jsonb)
              FROM "APONTADOR DE PRODUÇÃO".faltas x WHERE x.data >= v_ini AND x.data < v_fim),
   'salarios', (SELECT coalesce(jsonb_agg(jsonb_build_object('funcionario',s.funcionario_id::text,'salario',s.salario_base,'desde',s.vigencia_inicio) ORDER BY s.funcionario_id),'[]'::jsonb)
              FROM (SELECT DISTINCT ON (funcionario_id) * FROM "APONTADOR DE PRODUÇÃO".funcionario_salarios
                    WHERE vigencia_inicio < v_fim ORDER BY funcionario_id, vigencia_inicio DESC, id DESC) s),
   'linhas', (
    WITH meses AS (
      SELECT l.funcionario_id, date_trunc('month', l.data_apontamento)::date mes,
             sum(l.realizado_pecas) realizado, sum(l.meta_pecas) meta
        FROM "APONTADOR DE PRODUÇÃO"."Lançamentos" l
       WHERE l.funcionario_id IS NOT NULL
         AND l.data_apontamento >= (v_ini - interval '2 months') AND l.data_apontamento < v_fim
       GROUP BY 1,2),
    ef AS (SELECT m.*, CASE WHEN m.meta > 0 THEN m.realizado*100.0/m.meta END eficiencia FROM meses m),
    atual AS (SELECT * FROM ef WHERE mes = v_ini),
    base AS (
      SELECT f.id, f.nome, f.matricula, a.realizado, a.meta, a.eficiencia,
        floor(a.eficiencia)::int ef_inteira,
        (SELECT s.salario_base FROM "APONTADOR DE PRODUÇÃO".funcionario_salarios s
          WHERE s.funcionario_id=f.id AND s.vigencia_inicio < v_fim ORDER BY s.vigencia_inicio DESC, s.id DESC LIMIT 1) salario,
        (SELECT count(*) FROM "APONTADOR DE PRODUÇÃO".faltas x WHERE x.funcionario_id=f.id AND x.data >= v_ini AND x.data < v_fim)::int faltas,
        (SELECT count(*) FROM ef e WHERE e.funcionario_id=f.id AND e.eficiencia > 100
           AND e.mes IN (v_ini, (v_ini - interval '1 month')::date, (v_ini - interval '2 months')::date))::int meses_acima
      FROM "APONTADOR DE PRODUÇÃO".funcionarios f
      LEFT JOIN atual a ON a.funcionario_id = f.id
      WHERE f.ativo OR a.funcionario_id IS NOT NULL),
    calc AS (
      SELECT b.*,
        coalesce((SELECT fx.percentual FROM "APONTADOR DE PRODUÇÃO".bonificacao_faixas fx WHERE fx.eficiencia_min <= b.ef_inteira ORDER BY fx.eficiencia_min DESC LIMIT 1),0) pct_bonus,
        coalesce((SELECT r.perda_percentual FROM "APONTADOR DE PRODUÇÃO".bonificacao_faltas r WHERE r.faltas_min <= b.faltas ORDER BY r.faltas_min DESC LIMIT 1),0) perda_pct
      FROM base b)
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'funcionario', c.id::text, 'nome', c.nome, 'matricula', c.matricula,
      'realizado', coalesce(c.realizado,0), 'meta', coalesce(c.meta,0),
      'eficiencia', round(c.eficiencia,2), 'eficienciaFaixa', c.ef_inteira,
      'percentualBonus', c.pct_bonus, 'salario', c.salario,
      'bonusBruto', round(coalesce(c.salario,0)*c.pct_bonus/100.0,2),
      'faltas', c.faltas, 'perdaPercentual', c.perda_pct,
      'desconto', round(coalesce(c.salario,0)*c.pct_bonus/100.0*c.perda_pct/100.0,2),
      'bonus', round(coalesce(c.salario,0)*c.pct_bonus/100.0*(1-c.perda_pct/100.0),2),
      'total', CASE WHEN c.salario IS NULL THEN NULL ELSE round(c.salario + c.salario*c.pct_bonus/100.0*(1-c.perda_pct/100.0),2) END,
      'brinde', coalesce(c.eficiencia > 100, false),
      'mesesAcima100', c.meses_acima,
      'cronoanalise', c.meses_acima = 3
    ) ORDER BY c.eficiencia DESC NULLS LAST, c.nome),'[]'::jsonb) FROM calc c)
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.apontador_bonificacao(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apontador_bonificacao(date) TO authenticated;

-- Gravação (somente admin) -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apontador_bonificacao_salvar(p_tipo text, p_dados jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path = ''
AS $function$
DECLARE v_id bigint; v_email text := lower((SELECT auth.jwt()->>'email')); v_item jsonb;
BEGIN
  IF NOT public.apontador_eh_admin() THEN
    RAISE EXCEPTION 'Somente administradores podem alterar a bonificação.' USING ERRCODE='42501';
  END IF;
  CASE p_tipo
  WHEN 'salario' THEN
    INSERT INTO "APONTADOR DE PRODUÇÃO".funcionario_salarios (funcionario_id, salario_base, vigencia_inicio, registrado_por)
    VALUES ((p_dados->>'funcionario')::bigint, (p_dados->>'salario')::numeric,
            date_trunc('month', (p_dados->>'desde')::date)::date, v_email)
    ON CONFLICT (funcionario_id, vigencia_inicio) DO NOTHING
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN
      -- mesmo mês: substitui o valor daquele mês (correção de digitação)
      DELETE FROM "APONTADOR DE PRODUÇÃO".funcionario_salarios
       WHERE funcionario_id=(p_dados->>'funcionario')::bigint AND vigencia_inicio=date_trunc('month',(p_dados->>'desde')::date)::date;
      INSERT INTO "APONTADOR DE PRODUÇÃO".funcionario_salarios (funcionario_id, salario_base, vigencia_inicio, registrado_por)
      VALUES ((p_dados->>'funcionario')::bigint, (p_dados->>'salario')::numeric, date_trunc('month',(p_dados->>'desde')::date)::date, v_email)
      RETURNING id INTO v_id;
    END IF;
  WHEN 'falta' THEN
    INSERT INTO "APONTADOR DE PRODUÇÃO".faltas (funcionario_id, data, observacao, registrado_por)
    VALUES ((p_dados->>'funcionario')::bigint, (p_dados->>'data')::date, nullif(btrim(p_dados->>'observacao'),''), v_email)
    RETURNING id INTO v_id;
  WHEN 'falta_excluir' THEN
    DELETE FROM "APONTADOR DE PRODUÇÃO".faltas WHERE id=(p_dados->>'id')::bigint RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Falta não encontrada.'; END IF;
  WHEN 'regras' THEN
    IF jsonb_typeof(p_dados->'faixas') <> 'array' OR jsonb_typeof(p_dados->'faltas') <> 'array' THEN
      RAISE EXCEPTION 'Envie as listas de faixas e de faltas.';
    END IF;
    DELETE FROM "APONTADOR DE PRODUÇÃO".bonificacao_faixas WHERE true;
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_dados->'faixas') LOOP
      INSERT INTO "APONTADOR DE PRODUÇÃO".bonificacao_faixas (eficiencia_min, percentual)
      VALUES ((v_item->>'min')::int, (v_item->>'pct')::numeric);
    END LOOP;
    DELETE FROM "APONTADOR DE PRODUÇÃO".bonificacao_faltas WHERE true;
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_dados->'faltas') LOOP
      INSERT INTO "APONTADOR DE PRODUÇÃO".bonificacao_faltas (faltas_min, perda_percentual)
      VALUES ((v_item->>'min')::int, (v_item->>'perda')::numeric);
    END LOOP;
  ELSE
    RAISE EXCEPTION 'Operação não permitida.';
  END CASE;
  RETURN jsonb_build_object('ok', true, 'tipo', p_tipo, 'id', v_id::text);
END;
$function$;
REVOKE ALL ON FUNCTION public.apontador_bonificacao_salvar(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apontador_bonificacao_salvar(text, jsonb) TO authenticated;
