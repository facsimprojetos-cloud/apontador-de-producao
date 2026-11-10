-- GUT Apontador — 2026-11-10
-- Meta coletiva com base nas PEÇAS PRONTAS: eficiência dos apontamentos da operação final
-- (etapa_final_snapshot) no mês. Nova opção 'final' na configuração da bonificação.

ALTER TABLE "APONTADOR DE PRODUÇÃO".bonificacao_config DROP CONSTRAINT IF EXISTS bonificacao_config_coletiva_base_check;
ALTER TABLE "APONTADOR DE PRODUÇÃO".bonificacao_config ADD CONSTRAINT bonificacao_config_coletiva_base_check
  CHECK (coletiva_base IN ('fabrica','setor','grupo','final'));

DO $mig$
DECLARE v_def text; v_old text; v_new text;
BEGIN
  v_def := pg_get_functiondef('public.apontador_bonificacao(date)'::regprocedure);
  -- eficiência da operação final entre as bases coletivas
  v_old := $o$    col AS (
      SELECT 'fabrica'::text tipo, NULL::bigint chave, sum(realizado_pecas)*100.0/nullif(sum(meta_pecas),0) ef
        FROM "APONTADOR DE PRODUÇÃO"."Lançamentos" WHERE data_apontamento >= v_ini AND data_apontamento < v_fim$o$;
  v_new := $n$    col AS (
      SELECT 'fabrica'::text tipo, NULL::bigint chave, sum(realizado_pecas)*100.0/nullif(sum(meta_pecas),0) ef
        FROM "APONTADOR DE PRODUÇÃO"."Lançamentos" WHERE data_apontamento >= v_ini AND data_apontamento < v_fim
      UNION ALL
      SELECT 'final', NULL, sum(realizado_pecas)*100.0/nullif(sum(meta_pecas),0)
        FROM "APONTADOR DE PRODUÇÃO"."Lançamentos" WHERE data_apontamento >= v_ini AND data_apontamento < v_fim AND etapa_final_snapshot$n$;
  IF position(v_old IN v_def) = 0 THEN RAISE EXCEPTION 'Trecho col não encontrado'; END IF;
  v_def := replace(v_def, v_old, v_new);
  v_old := $o$AND (c.tipo='fabrica' OR $o$;
  v_new := $n$AND (c.tipo IN ('fabrica','final') OR $n$;
  IF position(v_old IN v_def) = 0 THEN RAISE EXCEPTION 'Trecho base não encontrado'; END IF;
  v_def := replace(v_def, v_old, v_new);
  v_old := $o$     SELECT jsonb_build_object(
      'fabrica',$o$;
  v_new := $n$     SELECT jsonb_build_object(
      'final', (SELECT CASE WHEN sum(meta_pecas)>0 THEN round(sum(realizado_pecas)*100.0/sum(meta_pecas),2) END
                  FROM "APONTADOR DE PRODUÇÃO"."Lançamentos" WHERE data_apontamento >= v_ini AND data_apontamento < v_fim AND etapa_final_snapshot),
      'fabrica',$n$;
  IF position(v_old IN v_def) = 0 THEN RAISE EXCEPTION 'Trecho coletivas não encontrado'; END IF;
  v_def := replace(v_def, v_old, v_new);
  EXECUTE v_def;
END
$mig$;
