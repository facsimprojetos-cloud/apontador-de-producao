-- GUT Apontador — 2026-11-09
-- 1) Revisão de tempo individual vale para o DIA inteiro em que foi feita (e dias seguintes).
-- 2) Jornada por dia da semana (entrada, saída, intervalo).
-- 3) Ausências no apontamento: falta (dia inteiro, gera falta na bonificação), parcial e coletiva.
--    Ausências não entram na eficiência individual; entram na eficiência da empresa.
-- Migração aditiva.

-- 1. Tempo vigente por data ------------------------------------------------------
CREATE OR REPLACE FUNCTION "APONTADOR DE PRODUÇÃO".tempo_vigente(p_funcionario bigint, p_pp bigint, p_momento timestamptz)
RETURNS TABLE(tempo_operador_id bigint, nivel_id bigint, segundos numeric)
LANGUAGE sql STABLE SET search_path = ''
AS $$
  -- Comparação por dia (fuso de São Paulo): a versão criada em um dia vale para todo aquele dia.
  -- Versões encerradas no mesmo dia em que começaram ficam substituídas pela mais recente.
  SELECT t.id, t.nivel_id, t.tempo_segundos
    FROM "APONTADOR DE PRODUÇÃO".tempos_operador t
   WHERE t.funcionario_id = p_funcionario
     AND t.produto_processo_id = p_pp
     AND (t.vigencia_inicio AT TIME ZONE 'America/Sao_Paulo')::date <= (p_momento AT TIME ZONE 'America/Sao_Paulo')::date
     AND (t.vigencia_fim IS NULL OR (t.vigencia_fim AT TIME ZONE 'America/Sao_Paulo')::date > (p_momento AT TIME ZONE 'America/Sao_Paulo')::date)
   ORDER BY t.vigencia_inicio DESC, t.id DESC
   LIMIT 1
$$;

-- Recalcula apontamentos de produção cujo tempo aplicado mudou com a nova regra (somente de hoje).
WITH calc AS (
  SELECT l.id, v.tempo_operador_id, v.nivel_id, v.segundos
    FROM "APONTADOR DE PRODUÇÃO"."Lançamentos" l
   CROSS JOIN LATERAL "APONTADOR DE PRODUÇÃO".tempo_vigente(l.funcionario_id, l.produto_processo_id,
                 "APONTADOR DE PRODUÇÃO".momento_apontamento(l.data_apontamento, l.hora_inicio)) v
   WHERE l.data_apontamento = (now() AT TIME ZONE 'America/Sao_Paulo')::date
     AND v.tempo_operador_id IS NOT NULL
     AND l.tempo_operador_id IS DISTINCT FROM v.tempo_operador_id)
UPDATE "APONTADOR DE PRODUÇÃO"."Lançamentos" l
   SET tempo_operador_id = c.tempo_operador_id, nivel_operador_id = c.nivel_id, tempo_aplicado_segundos = c.segundos
  FROM calc c WHERE c.id = l.id;

-- 2. Jornada semanal ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "APONTADOR DE PRODUÇÃO".jornada_semana (
  dia_semana smallint PRIMARY KEY CHECK (dia_semana BETWEEN 0 AND 6), -- 0 = domingo
  ativo boolean NOT NULL DEFAULT true,
  entrada time NOT NULL,
  saida time NOT NULL,
  intervalo_inicio time,
  intervalo_fim time,
  CONSTRAINT jornada_saida_maior CHECK (saida > entrada),
  CONSTRAINT jornada_intervalo_valido CHECK (
    (intervalo_inicio IS NULL AND intervalo_fim IS NULL) OR
    (intervalo_inicio IS NOT NULL AND intervalo_fim IS NOT NULL AND intervalo_fim > intervalo_inicio
     AND intervalo_inicio >= entrada AND intervalo_fim <= saida))
);
COMMENT ON TABLE "APONTADOR DE PRODUÇÃO".jornada_semana IS 'Carga horária por dia da semana (0=domingo). Usada para lançar falta de dia inteiro.';
INSERT INTO "APONTADOR DE PRODUÇÃO".jornada_semana (dia_semana, ativo, entrada, saida, intervalo_inicio, intervalo_fim) VALUES
 (0,false,'07:00','17:00',NULL,NULL),
 (1,true,'07:00','17:00','12:00','13:00'),(2,true,'07:00','17:00','12:00','13:00'),(3,true,'07:00','17:00','12:00','13:00'),
 (4,true,'07:00','17:00','12:00','13:00'),(5,true,'07:00','16:00','12:00','13:00'),
 (6,false,'07:00','11:00',NULL,NULL)
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION "APONTADOR DE PRODUÇÃO".minutos_jornada(p_data date)
RETURNS numeric LANGUAGE sql STABLE SET search_path = ''
AS $$
  SELECT CASE WHEN j.ativo THEN
     extract(epoch FROM (j.saida - j.entrada))/60.0
     - coalesce(extract(epoch FROM (j.intervalo_fim - j.intervalo_inicio))/60.0, 0) END
    FROM "APONTADOR DE PRODUÇÃO".jornada_semana j WHERE j.dia_semana = extract(dow FROM p_data)::smallint
$$;

-- 3. Ausências -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "APONTADOR DE PRODUÇÃO".ausencias (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  funcionario_id bigint NOT NULL REFERENCES "APONTADOR DE PRODUÇÃO".funcionarios(id),
  data date NOT NULL,
  hora_inicio time NOT NULL,
  hora_fim time NOT NULL,
  minutos numeric(7,2) NOT NULL CHECK (minutos > 0 AND minutos <= 1440),
  tipo text NOT NULL CHECK (tipo IN ('falta','parcial','coletiva')),
  motivo text,
  lote uuid,
  falta_id bigint,
  registrado_por text,
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE "APONTADOR DE PRODUÇÃO".ausencias IS 'Tempo ausente apontado (falta, parcial, coletiva). Não entra na eficiência individual; entra na eficiência da empresa.';
CREATE INDEX IF NOT EXISTS ausencias_data_idx ON "APONTADOR DE PRODUÇÃO".ausencias(data, funcionario_id);
CREATE INDEX IF NOT EXISTS ausencias_lote_idx ON "APONTADOR DE PRODUÇÃO".ausencias(lote);
CREATE UNIQUE INDEX IF NOT EXISTS ausencias_uma_falta_por_dia ON "APONTADOR DE PRODUÇÃO".ausencias(funcionario_id, data) WHERE tipo='falta';

ALTER TABLE "APONTADOR DE PRODUÇÃO".jornada_semana ENABLE ROW LEVEL SECURITY;
ALTER TABLE "APONTADOR DE PRODUÇÃO".ausencias ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON "APONTADOR DE PRODUÇÃO".jornada_semana TO authenticated;
GRANT SELECT, INSERT, DELETE ON "APONTADOR DE PRODUÇÃO".ausencias TO authenticated;
DO $rls$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['jornada_semana','ausencias'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS apontador_ler ON "APONTADOR DE PRODUÇÃO".%I', t);
    EXECUTE format($p$CREATE POLICY apontador_ler ON "APONTADOR DE PRODUÇÃO".%I FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM public.apontador_acessos a WHERE a.ativo AND a.email = lower((SELECT auth.jwt()->>'email'))))$p$, t);
    EXECUTE format('DROP POLICY IF EXISTS apontador_gravar ON "APONTADOR DE PRODUÇÃO".%I', t);
    EXECUTE format($p$CREATE POLICY apontador_gravar ON "APONTADOR DE PRODUÇÃO".%I FOR ALL TO authenticated
      USING (EXISTS (SELECT 1 FROM public.apontador_acessos a WHERE a.ativo AND a.email = lower((SELECT auth.jwt()->>'email')) AND a.perfil IN ('admin','editor')))
      WITH CHECK (EXISTS (SELECT 1 FROM public.apontador_acessos a WHERE a.ativo AND a.email = lower((SELECT auth.jwt()->>'email')) AND a.perfil IN ('admin','editor')))$p$, t);
  END LOOP;
END $rls$;

-- Falta de dia inteiro lançada no apontamento entra automaticamente nas faltas da bonificação.
-- SECURITY DEFINER: o apontador (editor) registra a falta sem precisar ler dados salariais.
CREATE OR REPLACE FUNCTION "APONTADOR DE PRODUÇÃO".ausencia_vincular_falta()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_id bigint;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.tipo = 'falta' THEN
    INSERT INTO "APONTADOR DE PRODUÇÃO".faltas (funcionario_id, data, observacao, registrado_por)
    VALUES (NEW.funcionario_id, NEW.data, coalesce(NEW.motivo, 'Lançada no apontamento'), NEW.registrado_por)
    ON CONFLICT (funcionario_id, data) DO NOTHING
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN
      SELECT id INTO v_id FROM "APONTADOR DE PRODUÇÃO".faltas WHERE funcionario_id = NEW.funcionario_id AND data = NEW.data;
    END IF;
    NEW.falta_id := v_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' AND OLD.tipo = 'falta' AND OLD.falta_id IS NOT NULL THEN
    DELETE FROM "APONTADOR DE PRODUÇÃO".faltas WHERE id = OLD.falta_id;
    RETURN OLD;
  END IF;
  RETURN coalesce(NEW, OLD);
END;
$$;
REVOKE ALL ON FUNCTION "APONTADOR DE PRODUÇÃO".ausencia_vincular_falta() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_ausencia_falta_ins ON "APONTADOR DE PRODUÇÃO".ausencias;
CREATE TRIGGER trg_ausencia_falta_ins BEFORE INSERT ON "APONTADOR DE PRODUÇÃO".ausencias
  FOR EACH ROW EXECUTE FUNCTION "APONTADOR DE PRODUÇÃO".ausencia_vincular_falta();
DROP TRIGGER IF EXISTS trg_ausencia_falta_del ON "APONTADOR DE PRODUÇÃO".ausencias;
CREATE TRIGGER trg_ausencia_falta_del AFTER DELETE ON "APONTADOR DE PRODUÇÃO".ausencias
  FOR EACH ROW EXECUTE FUNCTION "APONTADOR DE PRODUÇÃO".ausencia_vincular_falta();

-- RPC de ausências e jornada ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apontador_ausencia_salvar(p_tipo text, p_dados jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path = ''
AS $function$
DECLARE
  v_email text := lower((SELECT auth.jwt()->>'email'));
  v_func bigint; v_data date; v_ini time; v_fim time; v_min numeric; v_j record; v_id bigint; v_n integer := 0; v_lote uuid;
  v_item jsonb;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.apontador_acessos a WHERE a.email = v_email AND a.ativo AND a.perfil IN ('admin','editor')) THEN
    RAISE EXCEPTION 'Seu usuário não tem permissão para gravar dados.' USING ERRCODE='42501';
  END IF;
  CASE p_tipo
  WHEN 'falta' THEN
    v_func := (p_dados->>'funcionario')::bigint; v_data := (p_dados->>'data')::date;
    SELECT * INTO v_j FROM "APONTADOR DE PRODUÇÃO".jornada_semana WHERE dia_semana = extract(dow FROM v_data)::smallint;
    IF NOT FOUND OR NOT v_j.ativo THEN RAISE EXCEPTION 'Não há jornada cadastrada para este dia da semana. Ajuste em Apontamentos → Horários e jornada.'; END IF;
    IF EXISTS (SELECT 1 FROM "APONTADOR DE PRODUÇÃO"."Lançamentos" WHERE funcionario_id=v_func AND data_apontamento=v_data) THEN
      RAISE EXCEPTION 'Este funcionário já tem produção apontada neste dia. Use ausência parcial.';
    END IF;
    IF EXISTS (SELECT 1 FROM "APONTADOR DE PRODUÇÃO".ausencias WHERE funcionario_id=v_func AND data=v_data AND tipo='falta') THEN
      RAISE EXCEPTION 'Falta já lançada para este funcionário neste dia.';
    END IF;
    INSERT INTO "APONTADOR DE PRODUÇÃO".ausencias (funcionario_id, data, hora_inicio, hora_fim, minutos, tipo, motivo, registrado_por)
    VALUES (v_func, v_data, v_j.entrada, v_j.saida, "APONTADOR DE PRODUÇÃO".minutos_jornada(v_data), 'falta',
            coalesce(nullif(btrim(p_dados->>'motivo'),''),'Falta'), v_email)
    RETURNING id INTO v_id; v_n := 1;
  WHEN 'parcial', 'coletiva' THEN
    v_data := (p_dados->>'data')::date; v_ini := (p_dados->>'inicio')::time; v_fim := (p_dados->>'fim')::time;
    IF v_fim <= v_ini THEN RAISE EXCEPTION 'O horário final deve ser maior que o inicial.'; END IF;
    v_min := extract(epoch FROM (v_fim - v_ini))/60.0;
    SELECT * INTO v_j FROM "APONTADOR DE PRODUÇÃO".jornada_semana WHERE dia_semana = extract(dow FROM v_data)::smallint AND ativo;
    IF FOUND AND v_j.intervalo_inicio IS NOT NULL THEN -- não conta o intervalo da jornada
      v_min := v_min - greatest(0, extract(epoch FROM (least(v_fim, v_j.intervalo_fim) - greatest(v_ini, v_j.intervalo_inicio)))/60.0);
    END IF;
    IF v_min <= 0 THEN RAISE EXCEPTION 'O período informado fica todo dentro do intervalo da jornada.'; END IF;
    IF p_tipo = 'parcial' THEN
      INSERT INTO "APONTADOR DE PRODUÇÃO".ausencias (funcionario_id, data, hora_inicio, hora_fim, minutos, tipo, motivo, registrado_por)
      VALUES ((p_dados->>'funcionario')::bigint, v_data, v_ini, v_fim, v_min, 'parcial', nullif(btrim(p_dados->>'motivo'),''), v_email)
      RETURNING id INTO v_id; v_n := 1;
    ELSE
      v_lote := gen_random_uuid();
      INSERT INTO "APONTADOR DE PRODUÇÃO".ausencias (funcionario_id, data, hora_inicio, hora_fim, minutos, tipo, motivo, lote, registrado_por)
      SELECT f.id, v_data, v_ini, v_fim, v_min, 'coletiva', coalesce(nullif(btrim(p_dados->>'motivo'),''),'Ausência coletiva'), v_lote, v_email
        FROM "APONTADOR DE PRODUÇÃO".funcionarios f
       WHERE f.ativo AND (nullif(p_dados->>'setor','') IS NULL OR f.setor_id = (p_dados->>'setor')::bigint)
         AND NOT EXISTS (SELECT 1 FROM "APONTADOR DE PRODUÇÃO".ausencias x WHERE x.funcionario_id=f.id AND x.data=v_data AND x.tipo='falta');
      GET DIAGNOSTICS v_n = ROW_COUNT;
      IF v_n = 0 THEN RAISE EXCEPTION 'Nenhum funcionário ativo para lançar a ausência coletiva.'; END IF;
    END IF;
  WHEN 'excluir' THEN
    IF nullif(p_dados->>'lote','') IS NOT NULL THEN
      DELETE FROM "APONTADOR DE PRODUÇÃO".ausencias WHERE lote = (p_dados->>'lote')::uuid;
    ELSE
      DELETE FROM "APONTADOR DE PRODUÇÃO".ausencias WHERE id = (p_dados->>'id')::bigint;
    END IF;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n = 0 THEN RAISE EXCEPTION 'Ausência não encontrada.'; END IF;
  WHEN 'jornada' THEN
    IF jsonb_typeof(p_dados->'dias') <> 'array' THEN RAISE EXCEPTION 'Envie os dias da jornada.'; END IF;
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_dados->'dias') LOOP
      INSERT INTO "APONTADOR DE PRODUÇÃO".jornada_semana (dia_semana, ativo, entrada, saida, intervalo_inicio, intervalo_fim)
      VALUES ((v_item->>'dia')::smallint, coalesce((v_item->>'ativo')::boolean,true), (v_item->>'entrada')::time, (v_item->>'saida')::time,
              nullif(v_item->>'intervaloInicio','')::time, nullif(v_item->>'intervaloFim','')::time)
      ON CONFLICT (dia_semana) DO UPDATE SET ativo=EXCLUDED.ativo, entrada=EXCLUDED.entrada, saida=EXCLUDED.saida,
        intervalo_inicio=EXCLUDED.intervalo_inicio, intervalo_fim=EXCLUDED.intervalo_fim;
      v_n := v_n + 1;
    END LOOP;
  ELSE
    RAISE EXCEPTION 'Operação não permitida.';
  END CASE;
  RETURN jsonb_build_object('ok', true, 'tipo', p_tipo, 'id', v_id::text, 'afetados', v_n);
END;
$function$;
REVOKE ALL ON FUNCTION public.apontador_ausencia_salvar(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apontador_ausencia_salvar(text, jsonb) TO authenticated;

-- Carga: jornada e ausências -----------------------------------------------------------
DO $mig$
DECLARE v_def text; v_old text; v_new text;
BEGIN
  v_def := pg_get_functiondef('public.apontador_carregar()'::regprocedure);
  v_old := $o$    'horarios', ($o$;
  v_new := $n$    'jornada', (SELECT coalesce(jsonb_agg(jsonb_build_object('dia',j.dia_semana,'ativo',j.ativo,'entrada',to_char(j.entrada,'HH24:MI'),'saida',to_char(j.saida,'HH24:MI'),
       'intervaloInicio',to_char(j.intervalo_inicio,'HH24:MI'),'intervaloFim',to_char(j.intervalo_fim,'HH24:MI'),
       'minutos',"APONTADOR DE PRODUÇÃO".minutos_jornada(('2026-11-01'::date + j.dia_semana))) ORDER BY j.dia_semana),'[]'::jsonb) FROM "APONTADOR DE PRODUÇÃO".jornada_semana j),
    'ausencias', (SELECT coalesce(jsonb_agg(jsonb_build_object('id',a.id::text,'funcionario',a.funcionario_id::text,'data',a.data,
       'inicio',to_char(a.hora_inicio,'HH24:MI'),'fim',to_char(a.hora_fim,'HH24:MI'),'minutos',a.minutos,'tipo',a.tipo,'motivo',a.motivo,'lote',a.lote::text) ORDER BY a.data, a.hora_inicio, a.id),'[]'::jsonb)
       FROM "APONTADOR DE PRODUÇÃO".ausencias a),
    'horarios', ($n$;
  IF position(v_old IN v_def) = 0 THEN RAISE EXCEPTION 'Trecho horarios não encontrado'; END IF;
  EXECUTE replace(v_def, v_old, v_new);
END
$mig$;

-- Fechamento: minutos de ausência por funcionário e eficiência da empresa ---------------
DO $mig$
DECLARE v_def text; v_old text; v_new text;
BEGIN
  v_def := pg_get_functiondef('public.apontador_bonificacao(date)'::regprocedure);
  -- indicador da empresa
  v_old := $o$   'coletivas', ($o$;
  v_new := $n$   'empresa', (SELECT jsonb_build_object(
       'minutosPadrao', round(p.padrao,1), 'minutosProducao', round(p.prod,1), 'minutosAusencia', round(coalesce(a.aus,0),1),
       'minutosAusenciaColetiva', round(coalesce(a.col,0),1),
       'eficienciaEmpresa', CASE WHEN p.prod + coalesce(a.aus,0) > 0 THEN round(p.padrao*100.0/(p.prod + coalesce(a.aus,0)),2) END)
     FROM (SELECT coalesce(sum(CASE WHEN meta_pecas > 0 THEN realizado_pecas::numeric * duracao_minutos / meta_pecas ELSE 0 END),0) padrao,
                  coalesce(sum(duracao_minutos),0) prod
             FROM "APONTADOR DE PRODUÇÃO"."Lançamentos" WHERE data_apontamento >= v_ini AND data_apontamento < v_fim) p,
          (SELECT sum(minutos) aus, sum(minutos) FILTER (WHERE tipo='coletiva') col
             FROM "APONTADOR DE PRODUÇÃO".ausencias WHERE data >= v_ini AND data < v_fim) a),
   'coletivas', ($n$;
  IF position(v_old IN v_def) = 0 THEN RAISE EXCEPTION 'Trecho coletivas não encontrado'; END IF;
  v_def := replace(v_def, v_old, v_new);
  -- minutos de ausência por funcionário
  v_old := $o$      'faltas', v.faltas, 'perdaPercentual', v.perda_pct,$o$;
  v_new := $n$      'faltas', v.faltas, 'perdaPercentual', v.perda_pct,
      'minutosAusencia', (SELECT coalesce(round(sum(x.minutos),1),0) FROM "APONTADOR DE PRODUÇÃO".ausencias x WHERE x.funcionario_id=v.id AND x.data >= v_ini AND x.data < v_fim),$n$;
  IF position(v_old IN v_def) = 0 THEN RAISE EXCEPTION 'Trecho faltas não encontrado'; END IF;
  v_def := replace(v_def, v_old, v_new);
  EXECUTE v_def;
END
$mig$;
