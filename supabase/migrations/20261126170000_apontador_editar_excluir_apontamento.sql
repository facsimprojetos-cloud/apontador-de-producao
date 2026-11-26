-- Editar e excluir apontamentos (Lançamentos).
-- Só admin/editor da empresa atual (ou o dono da plataforma dentro da empresa visitada).
-- Ao editar, o gatilho calcular_lancamento recalcula tempo, meta e eficiência.
-- Ao excluir, a inspeção de qualidade ligada é apagada junto (ON DELETE CASCADE).

CREATE OR REPLACE FUNCTION public.apontador_lancamento(p_acao text, p_dados jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_emp bigint := public.apontador_empresa_atual();
  v_id bigint;
  v_l "APONTADOR DE PRODUÇÃO"."Lançamentos";
  v_func bigint; v_pp bigint; v_tipo text; v_de bigint; v_final boolean;
  v_r record;
BEGIN
  IF v_emp IS NULL THEN RAISE EXCEPTION 'Sessão inválida. Entre novamente.' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.apontador_acessos a
      WHERE a.email = lower((SELECT auth.jwt()->>'email')) AND a.ativo AND a.perfil IN ('admin','editor')
        AND (a.empresa_id = v_emp OR public.apontador_dono_plataforma())) THEN
    RAISE EXCEPTION 'Seu usuário não tem permissão para alterar apontamentos.' USING ERRCODE='42501';
  END IF;
  v_id := nullif(p_dados->>'id','')::bigint;
  SELECT * INTO v_l FROM "APONTADOR DE PRODUÇÃO"."Lançamentos" WHERE id = v_id AND empresa_id = v_emp FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Apontamento não encontrado nesta empresa.'; END IF;

  IF p_acao = 'excluir' THEN
    DELETE FROM "APONTADOR DE PRODUÇÃO"."Lançamentos" WHERE id = v_id AND empresa_id = v_emp;
    RETURN jsonb_build_object('ok', true, 'acao', 'excluido', 'id', v_id::text);
  END IF;

  IF p_acao <> 'editar' THEN RAISE EXCEPTION 'Ação inválida.'; END IF;

  v_func := coalesce(nullif(p_dados->>'funcionario','')::bigint, v_l.funcionario_id);
  IF NOT EXISTS(SELECT 1 FROM "APONTADOR DE PRODUÇÃO".funcionarios WHERE id = v_func AND empresa_id = v_emp) THEN
    RAISE EXCEPTION 'Funcionário não encontrado nesta empresa.';
  END IF;
  v_pp := coalesce(nullif(p_dados->>'roteiro','')::bigint, v_l.produto_processo_id);
  SELECT pp.etapa_final INTO v_final FROM "APONTADOR DE PRODUÇÃO".produto_processos pp WHERE pp.id = v_pp AND pp.empresa_id = v_emp;
  IF NOT FOUND THEN RAISE EXCEPTION 'A operação não faz parte do roteiro desta empresa.'; END IF;
  v_tipo := coalesce(nullif(p_dados->>'tipo',''), v_l.tipo_apontamento);
  IF v_tipo NOT IN ('producao','conserto_proprio','conserto_outro') THEN RAISE EXCEPTION 'Tipo de apontamento inválido.'; END IF;
  v_de := CASE WHEN v_tipo = 'conserto_outro' THEN nullif(p_dados->>'consertoDe','')::bigint END;
  IF v_de IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "APONTADOR DE PRODUÇÃO".funcionarios WHERE id = v_de AND empresa_id = v_emp) THEN
    RAISE EXCEPTION 'Funcionário da peça não encontrado nesta empresa.';
  END IF;
  IF v_tipo = 'producao' AND NOT (coalesce(nullif(p_dados->>'realizado',''),'x') ~ '^\d+$') THEN
    RAISE EXCEPTION 'Informe a quantidade de peças (número inteiro).';
  END IF;

  UPDATE "APONTADOR DE PRODUÇÃO"."Lançamentos" SET
    data_apontamento = coalesce(nullif(p_dados->>'data','')::date, data_apontamento),
    funcionario_id = v_func,
    produto_processo_id = v_pp,
    hora_inicio = coalesce(nullif(p_dados->>'inicio','')::time, hora_inicio),
    hora_fim = coalesce(nullif(p_dados->>'fim','')::time, hora_fim),
    tipo_apontamento = v_tipo,
    realizado_pecas = CASE WHEN v_tipo = 'producao' THEN (p_dados->>'realizado')::integer ELSE 0 END,
    conserto_de_funcionario_id = v_de,
    pecas_consertadas = CASE WHEN v_tipo <> 'producao' THEN nullif(p_dados->>'pecasConsertadas','')::integer END,
    etapa_final_snapshot = CASE WHEN v_tipo = 'producao'
                                 AND (v_pp IS DISTINCT FROM produto_processo_id OR tipo_apontamento <> 'producao')
                                THEN coalesce(v_final, false) ELSE etapa_final_snapshot END
  WHERE id = v_id AND empresa_id = v_emp
  RETURNING meta_pecas, realizado_pecas, eficiencia_percentual INTO v_r;

  RETURN jsonb_build_object('ok', true, 'acao', 'editado', 'id', v_id::text,
    'meta', v_r.meta_pecas, 'realizado', v_r.realizado_pecas, 'eficiencia', v_r.eficiencia_percentual);
END $function$;
REVOKE ALL ON FUNCTION public.apontador_lancamento(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apontador_lancamento(text, jsonb) TO authenticated;
