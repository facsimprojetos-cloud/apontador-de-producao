-- Apontamento de CONSERTO
--  conserto_proprio: tempo com a meta da operação e 0 peças -> baixa a eficiência de quem conserta.
--  conserto_outro : tempo com meta 0 -> não entra na eficiência de quem conserta (como horas a menos);
--                   continua contando como tempo na eficiência da empresa.
-- Consertos não contam como peça pronta (etapa_final_snapshot = false).

ALTER TABLE "APONTADOR DE PRODUÇÃO"."Lançamentos"
  ADD COLUMN IF NOT EXISTS tipo_apontamento text NOT NULL DEFAULT 'producao',
  ADD COLUMN IF NOT EXISTS conserto_de_funcionario_id bigint REFERENCES "APONTADOR DE PRODUÇÃO".funcionarios(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS pecas_consertadas integer;

DO $c$ BEGIN
  ALTER TABLE "APONTADOR DE PRODUÇÃO"."Lançamentos"
    ADD CONSTRAINT lancamentos_tipo_valido CHECK (tipo_apontamento IN ('producao','conserto_proprio','conserto_outro'));
  ALTER TABLE "APONTADOR DE PRODUÇÃO"."Lançamentos"
    ADD CONSTRAINT lancamentos_pecas_consertadas_validas CHECK (pecas_consertadas IS NULL OR pecas_consertadas >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $c$;

CREATE INDEX IF NOT EXISTS lancamentos_conserto_de_idx
  ON "APONTADOR DE PRODUÇÃO"."Lançamentos"(conserto_de_funcionario_id) WHERE conserto_de_funcionario_id IS NOT NULL;

-- 1) cálculo: aplica a regra do conserto depois da meta normal --------------------------
DO $mig$
DECLARE v_def text; v_old text; v_new text;
BEGIN
  v_def := pg_get_functiondef('"APONTADOR DE PRODUÇÃO".calcular_lancamento()'::regprocedure);
  IF position('tipo_apontamento' IN v_def) > 0 THEN RETURN; END IF;
  v_old := $o$  RETURN NEW;
END;$o$;
  v_new := $n$  IF NEW.tipo_apontamento = 'conserto_proprio' THEN
    NEW.realizado_pecas := 0;
    NEW.conserto_de_funcionario_id := NULL;
    NEW.etapa_final_snapshot := false;
    NEW.eficiencia_percentual := CASE WHEN NEW.meta_pecas > 0 THEN 0 END;
  ELSIF NEW.tipo_apontamento = 'conserto_outro' THEN
    IF NEW.conserto_de_funcionario_id IS NULL OR NEW.conserto_de_funcionario_id = NEW.funcionario_id THEN
      RAISE EXCEPTION 'No conserto de outra pessoa, informe de quem é a peça (diferente de quem está consertando).';
    END IF;
    NEW.realizado_pecas := 0;
    NEW.meta_pecas := 0;
    NEW.eficiencia_percentual := NULL;
    NEW.etapa_final_snapshot := false;
  ELSE
    NEW.conserto_de_funcionario_id := NULL;
    NEW.pecas_consertadas := NULL;
  END IF;
  RETURN NEW;
END;$n$;
  IF position(v_old IN v_def) = 0 THEN RAISE EXCEPTION 'Trecho RETURN NEW não encontrado em calcular_lancamento'; END IF;
  EXECUTE replace(v_def, v_old, v_new);
END
$mig$;

-- 2) gravação: apontador_salvar('entry') aceita tipo, conserto_de e pecas_consertadas ----
DO $mig$
DECLARE v_def text; v_old text; v_new text;
BEGIN
  v_def := pg_get_functiondef('public.apontador_salvar(text,jsonb)'::regprocedure);
  IF position('tipo_apontamento' IN v_def) > 0 THEN RETURN; END IF;
  v_old := $o$    IF v_pp IS NULL THEN RAISE EXCEPTION 'A operação não faz parte do roteiro do produto.'; END IF;
    INSERT INTO "APONTADOR DE PRODUÇÃO"."Lançamentos"
      (data_apontamento,funcionario_id,produto_processo_id,produto,processo,funcionario,
       hora_inicio,hora_fim,meta_hora_pecas,meta_pecas,duracao_minutos,realizado_pecas)
    VALUES ((p_dados->>'data')::date,v_func,v_pp,'Apuração automática','Apuração automática',
      'Apuração automática',(p_dados->>'inicio')::time,(p_dados->>'fim')::time,
      1,0,1,(p_dados->>'realizado')::integer)
    RETURNING id INTO v_id;$o$;
  v_new := $n$    IF v_pp IS NULL THEN RAISE EXCEPTION 'A operação não faz parte do roteiro do produto.'; END IF;
    IF coalesce(nullif(p_dados->>'tipo',''),'producao') NOT IN ('producao','conserto_proprio','conserto_outro') THEN
      RAISE EXCEPTION 'Tipo de apontamento inválido.';
    END IF;
    IF p_dados->>'tipo' = 'conserto_outro' AND NOT EXISTS(
         SELECT 1 FROM "APONTADOR DE PRODUÇÃO".funcionarios f WHERE f.id = nullif(p_dados->>'consertoDe','')::bigint) THEN
      RAISE EXCEPTION 'Informe de quem é a peça do conserto.';
    END IF;
    INSERT INTO "APONTADOR DE PRODUÇÃO"."Lançamentos"
      (data_apontamento,funcionario_id,produto_processo_id,produto,processo,funcionario,
       hora_inicio,hora_fim,meta_hora_pecas,meta_pecas,duracao_minutos,realizado_pecas,
       tipo_apontamento,conserto_de_funcionario_id,pecas_consertadas)
    VALUES ((p_dados->>'data')::date,v_func,v_pp,'Apuração automática','Apuração automática',
      'Apuração automática',(p_dados->>'inicio')::time,(p_dados->>'fim')::time,
      1,0,1,coalesce(nullif(p_dados->>'realizado','')::integer,0),
      coalesce(nullif(p_dados->>'tipo',''),'producao'),
      nullif(p_dados->>'consertoDe','')::bigint,
      nullif(p_dados->>'pecasConsertadas','')::integer)
    RETURNING id INTO v_id;$n$;
  IF position(v_old IN v_def) = 0 THEN RAISE EXCEPTION 'Trecho entry não encontrado em apontador_salvar'; END IF;
  EXECUTE replace(v_def, v_old, v_new);
END
$mig$;

-- 3) carga: envia os campos do conserto ao app -----------------------------------------
DO $mig$
DECLARE v_def text; v_old text; v_new text;
BEGIN
  v_def := pg_get_functiondef('public.apontador_carregar()'::regprocedure);
  IF position('consertoDe' IN v_def) > 0 THEN RETURN; END IF;
  v_old := $o$'setorNomeHistorico',l.setor_nome_historico,'grupoNomeHistorico',l.grupo_nome_historico)$o$;
  v_new := $n$'setorNomeHistorico',l.setor_nome_historico,'grupoNomeHistorico',l.grupo_nome_historico,
      'tipo',l.tipo_apontamento,'consertoDe',l.conserto_de_funcionario_id::text,'pecasConsertadas',l.pecas_consertadas)$n$;
  IF position(v_old IN v_def) = 0 THEN RAISE EXCEPTION 'Trecho lancamentos não encontrado em apontador_carregar'; END IF;
  EXECUTE replace(v_def, v_old, v_new);
END
$mig$;
