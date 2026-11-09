-- GUT Apontador — 2026-11-09
-- Estrutura da fábrica opcional (funcionário sem setor), nível opcional na revisão de tempo
-- (tempo individual primeiro, nível depois) e edição do tempo padrão do roteiro.
-- Migração aditiva: nenhuma linha é removida.

ALTER TABLE "APONTADOR DE PRODUÇÃO".funcionarios ALTER COLUMN setor_id DROP NOT NULL;
ALTER TABLE "APONTADOR DE PRODUÇÃO".tempos_operador ALTER COLUMN nivel_id DROP NOT NULL;
GRANT UPDATE (tempo_padrao_segundos) ON "APONTADOR DE PRODUÇÃO".produto_processos TO authenticated;

DO $mig$
DECLARE v_def text;
BEGIN
  v_def := pg_get_functiondef('public.apontador_salvar(text,jsonb)'::regprocedure);

  -- cadastro e edição de funcionário: setor opcional
  IF position($o$nullif(btrim(p_dados->>'matricula'),''),(p_dados->>'setor')::bigint,$o$ IN v_def) = 0 THEN RAISE EXCEPTION 'Trecho employee não encontrado'; END IF;
  v_def := replace(v_def, $o$nullif(btrim(p_dados->>'matricula'),''),(p_dados->>'setor')::bigint,$o$,
                          $n$nullif(btrim(p_dados->>'matricula'),''),nullif(p_dados->>'setor','')::bigint,$n$);
  IF position($o$setor_id=(p_dados->>'setor')::bigint,$o$ IN v_def) = 0 THEN RAISE EXCEPTION 'Trecho employee_update não encontrado'; END IF;
  v_def := replace(v_def, $o$setor_id=(p_dados->>'setor')::bigint,$o$, $n$setor_id=nullif(p_dados->>'setor','')::bigint,$n$);

  -- revisão de tempo: nível opcional
  IF position($o$VALUES (v_func,v_pp,(p_dados->>'nivel')::bigint,$o$ IN v_def) = 0 THEN RAISE EXCEPTION 'Trecho time não encontrado'; END IF;
  v_def := replace(v_def, $o$VALUES (v_func,v_pp,(p_dados->>'nivel')::bigint,$o$, $n$VALUES (v_func,v_pp,nullif(p_dados->>'nivel','')::bigint,$n$);

  -- novo tipo: alterar tempo padrão de uma operação do roteiro (vale para os próximos apontamentos;
  -- os já registrados guardam o tempo aplicado)
  IF position($o$ WHEN 'slot' THEN$o$ IN v_def) = 0 THEN RAISE EXCEPTION 'Trecho slot não encontrado'; END IF;
  v_def := replace(v_def, $o$ WHEN 'slot' THEN$o$, $n$ WHEN 'route_update' THEN
    v_id := (p_dados->>'id')::bigint;
    IF NOT ((p_dados->>'tempo')::numeric > 0) THEN RAISE EXCEPTION 'O tempo padrão deve ser positivo.'; END IF;
    UPDATE "APONTADOR DE PRODUÇÃO".produto_processos SET tempo_padrao_segundos=(p_dados->>'tempo')::numeric WHERE id=v_id AND ativo;
    IF NOT FOUND THEN RAISE EXCEPTION 'Operação do roteiro não encontrada.'; END IF;
 WHEN 'slot' THEN$n$);

  EXECUTE v_def;
END
$mig$;
