-- Conserto de outra pessoa: informar de quem é a peça passa a ser opcional
DO $mig$
DECLARE v_def text; v_old text; v_new text;
BEGIN
  v_def := pg_get_functiondef('"APONTADOR DE PRODUÇÃO".calcular_lancamento()'::regprocedure);
  v_old := $o$    IF NEW.conserto_de_funcionario_id IS NULL OR NEW.conserto_de_funcionario_id = NEW.funcionario_id THEN
      RAISE EXCEPTION 'No conserto de outra pessoa, informe de quem é a peça (diferente de quem está consertando).';
    END IF;$o$;
  v_new := $n$    IF NEW.conserto_de_funcionario_id = NEW.funcionario_id THEN
      RAISE EXCEPTION 'No conserto de outra pessoa, a peça não pode ser de quem está consertando.';
    END IF;$n$;
  IF position(v_old IN v_def) > 0 THEN EXECUTE replace(v_def, v_old, v_new); END IF;

  v_def := pg_get_functiondef('public.apontador_salvar(text,jsonb)'::regprocedure);
  v_old := $o$    IF p_dados->>'tipo' = 'conserto_outro' AND NOT EXISTS($o$;
  v_new := $n$    IF p_dados->>'tipo' = 'conserto_outro' AND nullif(p_dados->>'consertoDe','') IS NOT NULL AND NOT EXISTS($n$;
  IF position(v_old IN v_def) > 0 THEN EXECUTE replace(v_def, v_old, v_new); END IF;
END
$mig$;
