-- Ordem dos funcionários nas listas de seleção (apontamento e demais).
-- ordem NULL = sem posição definida: vai para o fim, em ordem alfabética.

ALTER TABLE "APONTADOR DE PRODUÇÃO".funcionarios ADD COLUMN IF NOT EXISTS ordem integer;

-- Grava a sequência inteira: p_ids = ["12","5","9",...] na ordem desejada.
CREATE OR REPLACE FUNCTION public.apontador_funcionarios_ordem(p_ids jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE v_n integer;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.apontador_acessos a
      WHERE a.email = lower((select auth.jwt()->>'email')) AND a.ativo AND a.perfil IN('admin','editor')) THEN
    RAISE EXCEPTION 'Seu usuário não tem permissão para gravar dados.' USING ERRCODE='42501';
  END IF;
  IF p_ids IS NULL OR jsonb_typeof(p_ids) <> 'array' THEN
    RAISE EXCEPTION 'Envie a lista de funcionários na ordem desejada.';
  END IF;
  -- RLS limita à empresa atual
  UPDATE "APONTADOR DE PRODUÇÃO".funcionarios f
     SET ordem = x.pos
    FROM (SELECT value::bigint id, ordinality::integer pos FROM jsonb_array_elements_text(p_ids) WITH ORDINALITY) x
   WHERE f.id = x.id AND f.ordem IS DISTINCT FROM x.pos;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'afetados', v_n);
END;
$function$;
REVOKE ALL ON FUNCTION public.apontador_funcionarios_ordem(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apontador_funcionarios_ordem(jsonb) TO authenticated;

-- Carga: envia a ordem e já entrega a lista ordenada
DO $mig$
DECLARE v_def text; v_old text; v_new text;
BEGIN
  v_def := pg_get_functiondef('public.apontador_carregar()'::regprocedure);
  IF position('''ordem'',f.ordem' IN v_def) > 0 THEN RETURN; END IF;
  v_old := $o$'nivel',1,'ativo',f.ativo) ORDER BY f.nome)$o$;
  v_new := $n$'nivel',1,'ativo',f.ativo,'ordem',f.ordem) ORDER BY f.ordem NULLS LAST, f.nome)$n$;
  IF position(v_old IN v_def) = 0 THEN RAISE EXCEPTION 'Trecho funcionarios não encontrado em apontador_carregar'; END IF;
  EXECUTE replace(v_def, v_old, v_new);
END
$mig$;
