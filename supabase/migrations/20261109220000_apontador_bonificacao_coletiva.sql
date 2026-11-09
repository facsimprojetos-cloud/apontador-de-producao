-- GUT Apontador — 2026-11-09
-- Meta coletiva na bonificação: mesma lógica de faixas da individual, com tabela própria,
-- base configurável (fábrica toda, setor ou grupo) e opção de aplicar o desconto por faltas.
-- Requer 20261109210000_apontador_bonificacao.sql.

CREATE TABLE IF NOT EXISTS "APONTADOR DE PRODUÇÃO".bonificacao_faixas_coletiva (
  eficiencia_min integer PRIMARY KEY CHECK (eficiencia_min BETWEEN 0 AND 1000),
  percentual numeric(6,2) NOT NULL CHECK (percentual >= 0)
);
COMMENT ON TABLE "APONTADOR DE PRODUÇÃO".bonificacao_faixas_coletiva IS 'Meta coletiva: eficiência coletiva mínima (% inteiro) → % de bônus sobre o salário base.';
CREATE TABLE IF NOT EXISTS "APONTADOR DE PRODUÇÃO".bonificacao_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  coletiva_ativa boolean NOT NULL DEFAULT true,
  coletiva_base text NOT NULL DEFAULT 'fabrica' CHECK (coletiva_base IN ('fabrica','setor','grupo')),
  coletiva_desconta_faltas boolean NOT NULL DEFAULT true
);
COMMENT ON TABLE "APONTADOR DE PRODUÇÃO".bonificacao_config IS 'Configuração única da bonificação (meta coletiva).';
INSERT INTO "APONTADOR DE PRODUÇÃO".bonificacao_faixas_coletiva (eficiencia_min, percentual)
SELECT e, (e-80)*0.5 FROM generate_series(81,100) e ON CONFLICT DO NOTHING;
INSERT INTO "APONTADOR DE PRODUÇÃO".bonificacao_config (id) VALUES (true) ON CONFLICT DO NOTHING;

DO $rls$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['bonificacao_faixas_coletiva','bonificacao_config'] LOOP
    EXECUTE format('ALTER TABLE "APONTADOR DE PRODUÇÃO".%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON "APONTADOR DE PRODUÇÃO".%I TO authenticated', t);
    EXECUTE format('DROP POLICY IF EXISTS apontador_admin ON "APONTADOR DE PRODUÇÃO".%I', t);
    EXECUTE format('CREATE POLICY apontador_admin ON "APONTADOR DE PRODUÇÃO".%I FOR ALL TO authenticated USING ((SELECT public.apontador_eh_admin())) WITH CHECK ((SELECT public.apontador_eh_admin()))', t);
  END LOOP;
END $rls$;

-- Cálculo mensal com meta coletiva --------------------------------------------------
CREATE OR REPLACE FUNCTION public.apontador_bonificacao(p_mes date)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = ''
AS $function$
DECLARE
  v_ini date := date_trunc('month', p_mes)::date;
  v_fim date := (date_trunc('month', p_mes) + interval '1 month')::date;
  v_cfg record;
BEGIN
  IF NOT public.apontador_eh_admin() THEN
    RAISE EXCEPTION 'Somente administradores podem ver a bonificação.' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_cfg FROM "APONTADOR DE PRODUÇÃO".bonificacao_config LIMIT 1;
  RETURN jsonb_build_object(
   'mes', to_char(v_ini,'YYYY-MM'),
   'faixas', (SELECT coalesce(jsonb_agg(jsonb_build_object('min',f.eficiencia_min,'pct',f.percentual) ORDER BY f.eficiencia_min),'[]'::jsonb) FROM "APONTADOR DE PRODUÇÃO".bonificacao_faixas f),
   'faixasColetiva', (SELECT coalesce(jsonb_agg(jsonb_build_object('min',f.eficiencia_min,'pct',f.percentual) ORDER BY f.eficiencia_min),'[]'::jsonb) FROM "APONTADOR DE PRODUÇÃO".bonificacao_faixas_coletiva f),
   'config', jsonb_build_object('coletivaAtiva',coalesce(v_cfg.coletiva_ativa,true),'coletivaBase',coalesce(v_cfg.coletiva_base,'fabrica'),'coletivaDescontaFaltas',coalesce(v_cfg.coletiva_desconta_faltas,true)),
   'regrasFaltas', (SELECT coalesce(jsonb_agg(jsonb_build_object('min',r.faltas_min,'perda',r.perda_percentual) ORDER BY r.faltas_min),'[]'::jsonb) FROM "APONTADOR DE PRODUÇÃO".bonificacao_faltas r),
   'faltas', (SELECT coalesce(jsonb_agg(jsonb_build_object('id',x.id::text,'funcionario',x.funcionario_id::text,'data',x.data,'observacao',x.observacao) ORDER BY x.data, x.funcionario_id),'[]'::jsonb)
              FROM "APONTADOR DE PRODUÇÃO".faltas x WHERE x.data >= v_ini AND x.data < v_fim),
   'salarios', (SELECT coalesce(jsonb_agg(jsonb_build_object('funcionario',s.funcionario_id::text,'salario',s.salario_base,'desde',s.vigencia_inicio) ORDER BY s.funcionario_id),'[]'::jsonb)
              FROM (SELECT DISTINCT ON (funcionario_id) * FROM "APONTADOR DE PRODUÇÃO".funcionario_salarios
                    WHERE vigencia_inicio < v_fim ORDER BY funcionario_id, vigencia_inicio DESC, id DESC) s),
   'coletivas', (
     SELECT jsonb_build_object(
      'fabrica', (SELECT CASE WHEN sum(meta_pecas)>0 THEN round(sum(realizado_pecas)*100.0/sum(meta_pecas),2) END
                    FROM "APONTADOR DE PRODUÇÃO"."Lançamentos" WHERE data_apontamento >= v_ini AND data_apontamento < v_fim),
      'setores', (SELECT coalesce(jsonb_object_agg(k, ef),'{}'::jsonb) FROM (
                    SELECT setor_id_historico::text k, round(sum(realizado_pecas)*100.0/nullif(sum(meta_pecas),0),2) ef
                      FROM "APONTADOR DE PRODUÇÃO"."Lançamentos" WHERE data_apontamento >= v_ini AND data_apontamento < v_fim AND setor_id_historico IS NOT NULL GROUP BY 1) z),
      'grupos', (SELECT coalesce(jsonb_object_agg(k, ef),'{}'::jsonb) FROM (
                    SELECT grupo_id_historico::text k, round(sum(realizado_pecas)*100.0/nullif(sum(meta_pecas),0),2) ef
                      FROM "APONTADOR DE PRODUÇÃO"."Lançamentos" WHERE data_apontamento >= v_ini AND data_apontamento < v_fim AND grupo_id_historico IS NOT NULL GROUP BY 1) z))),
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
    col AS (
      SELECT 'fabrica'::text tipo, NULL::bigint chave, sum(realizado_pecas)*100.0/nullif(sum(meta_pecas),0) ef
        FROM "APONTADOR DE PRODUÇÃO"."Lançamentos" WHERE data_apontamento >= v_ini AND data_apontamento < v_fim
      UNION ALL
      SELECT 'setor', setor_id_historico, sum(realizado_pecas)*100.0/nullif(sum(meta_pecas),0)
        FROM "APONTADOR DE PRODUÇÃO"."Lançamentos" WHERE data_apontamento >= v_ini AND data_apontamento < v_fim AND setor_id_historico IS NOT NULL GROUP BY setor_id_historico
      UNION ALL
      SELECT 'grupo', grupo_id_historico, sum(realizado_pecas)*100.0/nullif(sum(meta_pecas),0)
        FROM "APONTADOR DE PRODUÇÃO"."Lançamentos" WHERE data_apontamento >= v_ini AND data_apontamento < v_fim AND grupo_id_historico IS NOT NULL GROUP BY grupo_id_historico),
    base AS (
      SELECT f.id, f.nome, f.matricula, a.realizado, a.meta, a.eficiencia,
        floor(a.eficiencia)::int ef_inteira,
        CASE WHEN coalesce(v_cfg.coletiva_ativa,true) THEN
          (SELECT c.ef FROM col c WHERE c.tipo = coalesce(v_cfg.coletiva_base,'fabrica')
             AND (c.tipo='fabrica' OR (c.tipo='setor' AND c.chave=f.setor_id) OR (c.tipo='grupo' AND c.chave=f.grupo_id)) LIMIT 1)
        END ef_col,
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
        coalesce((SELECT fx.percentual FROM "APONTADOR DE PRODUÇÃO".bonificacao_faixas_coletiva fx WHERE b.meta > 0 AND fx.eficiencia_min <= floor(b.ef_col)::int ORDER BY fx.eficiencia_min DESC LIMIT 1),0) pct_col,
        coalesce((SELECT r.perda_percentual FROM "APONTADOR DE PRODUÇÃO".bonificacao_faltas r WHERE r.faltas_min <= b.faltas ORDER BY r.faltas_min DESC LIMIT 1),0) perda_pct
      FROM base b),
    vals AS (
      SELECT c.*,
        coalesce(c.salario,0)*c.pct_bonus/100.0 bruto_ind,
        coalesce(c.salario,0)*c.pct_col/100.0 bruto_col,
        coalesce(c.salario,0)*c.pct_bonus/100.0*(1-c.perda_pct/100.0) premio_ind,
        coalesce(c.salario,0)*c.pct_col/100.0*(1-CASE WHEN coalesce(v_cfg.coletiva_desconta_faltas,true) THEN c.perda_pct ELSE 0 END/100.0) premio_col
      FROM calc c)
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'funcionario', v.id::text, 'nome', v.nome, 'matricula', v.matricula,
      'realizado', coalesce(v.realizado,0), 'meta', coalesce(v.meta,0),
      'eficiencia', round(v.eficiencia,2), 'eficienciaFaixa', v.ef_inteira,
      'percentualBonus', v.pct_bonus, 'salario', v.salario,
      'bonusBruto', round(v.bruto_ind,2),
      'eficienciaColetiva', round(v.ef_col,2), 'percentualColetivo', v.pct_col,
      'bonusColetivoBruto', round(v.bruto_col,2), 'bonusColetivo', round(v.premio_col,2),
      'faltas', v.faltas, 'perdaPercentual', v.perda_pct,
      'desconto', round((v.bruto_ind - v.premio_ind) + (v.bruto_col - v.premio_col),2),
      'bonusIndividual', round(v.premio_ind,2),
      'bonus', round(v.premio_ind + v.premio_col,2),
      'total', CASE WHEN v.salario IS NULL THEN NULL ELSE round(v.salario + v.premio_ind + v.premio_col,2) END,
      'brinde', coalesce(v.eficiencia > 100, false),
      'mesesAcima100', v.meses_acima,
      'cronoanalise', v.meses_acima = 3
    ) ORDER BY v.eficiencia DESC NULLS LAST, v.nome),'[]'::jsonb) FROM vals v)
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.apontador_bonificacao(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apontador_bonificacao(date) TO authenticated;

-- Gravação das regras: inclui faixas coletivas e configuração --------------------------
DO $mig$
DECLARE v_def text; v_old text; v_new text;
BEGIN
  v_def := pg_get_functiondef('public.apontador_bonificacao_salvar(text,jsonb)'::regprocedure);
  v_old := $o$    DELETE FROM "APONTADOR DE PRODUÇÃO".bonificacao_faltas WHERE true;$o$;
  v_new := $n$    IF jsonb_typeof(p_dados->'faixasColetiva') = 'array' THEN
      DELETE FROM "APONTADOR DE PRODUÇÃO".bonificacao_faixas_coletiva WHERE true;
      FOR v_item IN SELECT * FROM jsonb_array_elements(p_dados->'faixasColetiva') LOOP
        INSERT INTO "APONTADOR DE PRODUÇÃO".bonificacao_faixas_coletiva (eficiencia_min, percentual)
        VALUES ((v_item->>'min')::int, (v_item->>'pct')::numeric);
      END LOOP;
    END IF;
    IF jsonb_typeof(p_dados->'config') = 'object' THEN
      INSERT INTO "APONTADOR DE PRODUÇÃO".bonificacao_config (id, coletiva_ativa, coletiva_base, coletiva_desconta_faltas)
      VALUES (true, coalesce((p_dados->'config'->>'coletivaAtiva')::boolean, true),
              coalesce(nullif(p_dados->'config'->>'coletivaBase',''),'fabrica'),
              coalesce((p_dados->'config'->>'coletivaDescontaFaltas')::boolean, true))
      ON CONFLICT (id) DO UPDATE SET coletiva_ativa=EXCLUDED.coletiva_ativa, coletiva_base=EXCLUDED.coletiva_base,
                                     coletiva_desconta_faltas=EXCLUDED.coletiva_desconta_faltas;
    END IF;
    DELETE FROM "APONTADOR DE PRODUÇÃO".bonificacao_faltas WHERE true;$n$;
  IF position(v_old IN v_def) = 0 THEN RAISE EXCEPTION 'Trecho regras não encontrado'; END IF;
  EXECUTE replace(v_def, v_old, v_new);
END
$mig$;
