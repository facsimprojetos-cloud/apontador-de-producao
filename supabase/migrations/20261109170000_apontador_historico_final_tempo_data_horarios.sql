-- GUT Apontador — 2026-11-09
-- 1) Peças prontas com histórico: cada lançamento guarda se era da operação final no momento do registro.
-- 2) Tempo individual escolhido pela data/hora do apontamento (e não pelo momento da digitação).
-- 3) Horários fixos de apontamento (faixas de hora em hora configuráveis).
-- 4) RPC de prévia de meta calculada no Supabase.
-- Migração aditiva: nenhuma tabela ou dado existente é removido.

-- 1. Snapshot da etapa final ------------------------------------------------
ALTER TABLE "APONTADOR DE PRODUÇÃO"."Lançamentos"
  ADD COLUMN IF NOT EXISTS etapa_final_snapshot boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN "APONTADOR DE PRODUÇÃO"."Lançamentos".etapa_final_snapshot IS
  'Indica se a operação era a etapa final do produto no momento do apontamento (base do indicador de peças prontas).';

UPDATE "APONTADOR DE PRODUÇÃO"."Lançamentos" l
   SET etapa_final_snapshot = pp.etapa_final
  FROM "APONTADOR DE PRODUÇÃO".produto_processos pp
 WHERE pp.id = l.produto_processo_id AND l.etapa_final_snapshot IS DISTINCT FROM pp.etapa_final;

-- Atualização somente desta coluna (usada pela opção "aplicar aos apontamentos já registrados").
GRANT UPDATE (etapa_final_snapshot) ON "APONTADOR DE PRODUÇÃO"."Lançamentos" TO authenticated;
DROP POLICY IF EXISTS apontador_atualizar ON "APONTADOR DE PRODUÇÃO"."Lançamentos";
CREATE POLICY apontador_atualizar ON "APONTADOR DE PRODUÇÃO"."Lançamentos" FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.apontador_acessos a WHERE a.ativo AND a.email = lower((SELECT auth.jwt()->>'email')) AND a.perfil IN ('admin','editor')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.apontador_acessos a WHERE a.ativo AND a.email = lower((SELECT auth.jwt()->>'email')) AND a.perfil IN ('admin','editor')));

-- 2. Tempo vigente em um momento --------------------------------------------
CREATE OR REPLACE FUNCTION "APONTADOR DE PRODUÇÃO".tempo_vigente(p_funcionario bigint, p_pp bigint, p_momento timestamptz)
RETURNS TABLE(tempo_operador_id bigint, nivel_id bigint, segundos numeric)
LANGUAGE sql STABLE SET search_path = ''
AS $$
  SELECT t.id, t.nivel_id, t.tempo_segundos
    FROM "APONTADOR DE PRODUÇÃO".tempos_operador t
   WHERE t.funcionario_id = p_funcionario
     AND t.produto_processo_id = p_pp
     AND t.vigencia_inicio <= p_momento
     AND (t.vigencia_fim IS NULL OR t.vigencia_fim > p_momento)
   ORDER BY t.vigencia_inicio DESC, t.id DESC
   LIMIT 1
$$;

CREATE OR REPLACE FUNCTION "APONTADOR DE PRODUÇÃO".momento_apontamento(p_data date, p_hora time)
RETURNS timestamptz LANGUAGE sql IMMUTABLE SET search_path = ''
AS $$ SELECT ((p_data + p_hora) AT TIME ZONE 'America/Sao_Paulo') $$;

CREATE OR REPLACE FUNCTION "APONTADOR DE PRODUÇÃO".calcular_lancamento()
RETURNS trigger LANGUAGE plpgsql SET search_path = ''
AS $function$
DECLARE
  v_minutos numeric;
  v_produto text;
  v_processo text;
  v_funcionario text;
  v_tempo_base numeric;
  v_final boolean;
  v_tempo_individual record;
  v_reavaliar boolean;
BEGIN
  -- Recalcula o tempo de referência em novos lançamentos ou quando mudar
  -- funcionário, operação do roteiro, data ou hora inicial.
  v_reavaliar := TG_OP = 'INSERT';
  IF TG_OP = 'UPDATE' THEN
    v_reavaliar := NEW.funcionario_id IS DISTINCT FROM OLD.funcionario_id
               OR NEW.produto_processo_id IS DISTINCT FROM OLD.produto_processo_id
               OR NEW.data_apontamento IS DISTINCT FROM OLD.data_apontamento
               OR NEW.hora_inicio IS DISTINCT FROM OLD.hora_inicio;
  END IF;

  IF NEW.produto_processo_id IS NOT NULL THEN
    SELECT pp.tempo_padrao_segundos, pp.etapa_final, p.nome, pr.nome
      INTO v_tempo_base, v_final, v_produto, v_processo
      FROM "APONTADOR DE PRODUÇÃO".produto_processos pp
      JOIN "APONTADOR DE PRODUÇÃO".produtos p ON p.id = pp.produto_id
      JOIN "APONTADOR DE PRODUÇÃO".processos pr ON pr.id = pp.processo_id
     WHERE pp.id = NEW.produto_processo_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Operação de produto inexistente.'; END IF;
    IF v_reavaliar THEN
      NEW.produto := v_produto;
      NEW.processo := v_processo;
      IF TG_OP = 'INSERT' OR NEW.produto_processo_id IS DISTINCT FROM OLD.produto_processo_id THEN
        NEW.etapa_final_snapshot := coalesce(v_final, false);
      END IF;
    END IF;
  END IF;

  IF NEW.funcionario_id IS NOT NULL THEN
    SELECT nome INTO v_funcionario FROM "APONTADOR DE PRODUÇÃO".funcionarios WHERE id = NEW.funcionario_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Funcionário inexistente.'; END IF;
    IF v_reavaliar THEN NEW.funcionario := v_funcionario; END IF;
  END IF;

  IF v_reavaliar AND NEW.produto_processo_id IS NOT NULL THEN
    NEW.tempo_operador_id := NULL;
    NEW.nivel_operador_id := NULL;
    NEW.tempo_aplicado_segundos := v_tempo_base;
    IF NEW.funcionario_id IS NOT NULL THEN
      -- Tempo individual vigente na data/hora em que a produção aconteceu.
      SELECT * INTO v_tempo_individual
        FROM "APONTADOR DE PRODUÇÃO".tempo_vigente(
               NEW.funcionario_id, NEW.produto_processo_id,
               "APONTADOR DE PRODUÇÃO".momento_apontamento(NEW.data_apontamento, NEW.hora_inicio));
      IF FOUND AND v_tempo_individual.tempo_operador_id IS NOT NULL THEN
        NEW.tempo_operador_id := v_tempo_individual.tempo_operador_id;
        NEW.nivel_operador_id := v_tempo_individual.nivel_id;
        NEW.tempo_aplicado_segundos := v_tempo_individual.segundos;
      END IF;
    END IF;
    NEW.meta_hora_pecas := round(3600.0 / NEW.tempo_aplicado_segundos, 2);
  END IF;

  v_minutos := extract(epoch FROM (NEW.hora_fim - NEW.hora_inicio)) / 60.0;
  IF v_minutos <= 0 THEN v_minutos := v_minutos + 1440; END IF;
  IF v_minutos <= 0 OR v_minutos > 720 THEN
    RAISE EXCEPTION 'Período inválido: informe intervalo superior a zero e de no máximo 12 horas.';
  END IF;
  NEW.duracao_minutos := round(v_minutos, 2);

  IF NEW.tempo_aplicado_segundos IS NOT NULL THEN
    NEW.meta_hora_pecas := round(3600.0 / NEW.tempo_aplicado_segundos, 2);
    NEW.meta_pecas := round(v_minutos * 60.0 / NEW.tempo_aplicado_segundos, 0)::integer;
  ELSE
    NEW.meta_pecas := round(NEW.meta_hora_pecas * v_minutos / 60.0, 0)::integer;
  END IF;

  IF NEW.meta_pecas > 0 THEN
    NEW.eficiencia_percentual := round(NEW.realizado_pecas * 100.0 / NEW.meta_pecas, 2);
  ELSE
    NEW.eficiencia_percentual := NULL;
  END IF;
  RETURN NEW;
END;
$function$;

-- 3. Horários fixos -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS "APONTADOR DE PRODUÇÃO".horarios_padrao (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  inicio time NOT NULL,
  fim time NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT horarios_padrao_intervalo CHECK (fim <> inicio),
  CONSTRAINT horarios_padrao_unico UNIQUE (inicio, fim)
);
COMMENT ON TABLE "APONTADOR DE PRODUÇÃO".horarios_padrao IS
  'Faixas de horário fixas (ex.: 08:00–09:00) oferecidas como atalho no apontamento.';
ALTER TABLE "APONTADOR DE PRODUÇÃO".horarios_padrao ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON "APONTADOR DE PRODUÇÃO".horarios_padrao TO authenticated;
GRANT UPDATE (inicio, fim, ativo) ON "APONTADOR DE PRODUÇÃO".horarios_padrao TO authenticated;
DROP POLICY IF EXISTS apontador_ler ON "APONTADOR DE PRODUÇÃO".horarios_padrao;
CREATE POLICY apontador_ler ON "APONTADOR DE PRODUÇÃO".horarios_padrao FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.apontador_acessos a WHERE a.ativo AND a.email = lower((SELECT auth.jwt()->>'email'))));
DROP POLICY IF EXISTS apontador_inserir ON "APONTADOR DE PRODUÇÃO".horarios_padrao;
CREATE POLICY apontador_inserir ON "APONTADOR DE PRODUÇÃO".horarios_padrao FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.apontador_acessos a WHERE a.ativo AND a.email = lower((SELECT auth.jwt()->>'email')) AND a.perfil IN ('admin','editor')));
DROP POLICY IF EXISTS apontador_atualizar ON "APONTADOR DE PRODUÇÃO".horarios_padrao;
CREATE POLICY apontador_atualizar ON "APONTADOR DE PRODUÇÃO".horarios_padrao FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.apontador_acessos a WHERE a.ativo AND a.email = lower((SELECT auth.jwt()->>'email')) AND a.perfil IN ('admin','editor')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.apontador_acessos a WHERE a.ativo AND a.email = lower((SELECT auth.jwt()->>'email')) AND a.perfil IN ('admin','editor')));

INSERT INTO "APONTADOR DE PRODUÇÃO".horarios_padrao (inicio, fim)
SELECT make_time(h,0,0), make_time(h+1,0,0) FROM generate_series(8,16) h
ON CONFLICT (inicio, fim) DO NOTHING;

-- 4. Prévia da meta (mesma regra do trigger) -----------------------------------
CREATE OR REPLACE FUNCTION public.apontador_previa(p_dados jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = ''
AS $function$
DECLARE
  v_pp record;
  v_func bigint := nullif(p_dados->>'funcionario','')::bigint;
  v_data date := coalesce(nullif(p_dados->>'data','')::date, (now() AT TIME ZONE 'America/Sao_Paulo')::date);
  v_ini time := nullif(p_dados->>'inicio','')::time;
  v_fim time := nullif(p_dados->>'fim','')::time;
  v_t record;
  v_seg numeric;
  v_min numeric;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.apontador_acessos a WHERE a.email = lower((SELECT auth.jwt()->>'email')) AND a.ativo) THEN
    RAISE EXCEPTION 'Acesso não autorizado ao Apontador de Produção.' USING ERRCODE='42501';
  END IF;
  SELECT pp.id, pp.tempo_padrao_segundos, pp.etapa_final INTO v_pp
    FROM "APONTADOR DE PRODUÇÃO".produto_processos pp
   WHERE pp.ativo AND (
         (nullif(p_dados->>'roteiro','') IS NOT NULL AND pp.id = (p_dados->>'roteiro')::bigint)
      OR (nullif(p_dados->>'roteiro','') IS NULL AND pp.produto_id = (p_dados->>'produto')::bigint AND pp.processo_id = (p_dados->>'processo')::bigint))
   ORDER BY pp.etapa LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'erro', 'Operação fora do roteiro do produto.'); END IF;
  v_seg := v_pp.tempo_padrao_segundos;
  SELECT * INTO v_t FROM "APONTADOR DE PRODUÇÃO".tempo_vigente(v_func, v_pp.id,
    "APONTADOR DE PRODUÇÃO".momento_apontamento(v_data, coalesce(v_ini, '00:00'::time)));
  IF v_t.tempo_operador_id IS NOT NULL THEN v_seg := v_t.segundos; END IF;
  IF v_ini IS NOT NULL AND v_fim IS NOT NULL THEN
    v_min := extract(epoch FROM (v_fim - v_ini)) / 60.0;
    IF v_min <= 0 THEN v_min := v_min + 1440; END IF;
  END IF;
  RETURN jsonb_build_object('ok', true, 'roteiro', v_pp.id::text, 'segundos', v_seg,
    'fonte', CASE WHEN v_t.tempo_operador_id IS NOT NULL THEN 'individual' ELSE 'padrão' END,
    'nivel', v_t.nivel_id, 'final', v_pp.etapa_final, 'minutos', v_min,
    'meta', CASE WHEN v_min > 0 AND v_min <= 720 THEN round(v_min * 60.0 / v_seg, 0) END);
END;
$function$;
REVOKE ALL ON FUNCTION public.apontador_previa(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apontador_previa(jsonb) TO authenticated;

-- 5. RPC de carga: inclui horários, id do roteiro e snapshot da etapa final ------
CREATE OR REPLACE FUNCTION public.apontador_carregar()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.apontador_acessos a WHERE a.email = lower((select auth.jwt()->>'email')) AND a.ativo) THEN
    RAISE EXCEPTION 'Acesso não autorizado ao Apontador de Produção.' USING ERRCODE='42501';
  END IF;
  RETURN jsonb_build_object(
    'perfil', (SELECT a.perfil FROM public.apontador_acessos a WHERE a.email = lower((select auth.jwt()->>'email')) AND a.ativo LIMIT 1),
    'setores', (SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.id::text,'nome',s.nome) ORDER BY s.nome),'[]'::jsonb) FROM "APONTADOR DE PRODUÇÃO".setores s),
    'grupos', (SELECT coalesce(jsonb_agg(jsonb_build_object('id',g.id::text,'nome',g.nome,'codigo',g.codigo,'descricao',g.descricao,'setor',g.setor_id::text,'ativo',g.ativo) ORDER BY g.nome),'[]'::jsonb) FROM "APONTADOR DE PRODUÇÃO".grupos g),
    'maquinas', (SELECT coalesce(jsonb_agg(jsonb_build_object('id',m.id::text,'nome',m.nome,'setor',m.setor_id::text,'codigo',m.codigo,'tipo',m.tipo,'descricao',m.descricao,'ativo',m.ativo) ORDER BY m.nome),'[]'::jsonb) FROM "APONTADOR DE PRODUÇÃO".maquinas m),
    'funcoes', (SELECT coalesce(jsonb_agg(jsonb_build_object('id',f.id::text,'nome',f.nome) ORDER BY f.nome),'[]'::jsonb) FROM "APONTADOR DE PRODUÇÃO".funcoes f),
    'funcionarios', (SELECT coalesce(jsonb_agg(jsonb_build_object('id',f.id::text,'nome',f.nome,'matricula',f.matricula,'setor',f.setor_id::text,'grupo',f.grupo_id::text,
      'maquinas',(SELECT coalesce(jsonb_agg(fm.maquina_id::text ORDER BY fm.maquina_id),'[]'::jsonb) FROM "APONTADOR DE PRODUÇÃO".funcionario_maquinas fm WHERE fm.funcionario_id=f.id),
      'funcoes',(SELECT coalesce(jsonb_agg(ff.funcao_id::text ORDER BY ff.funcao_id),'[]'::jsonb) FROM "APONTADOR DE PRODUÇÃO".funcionario_funcoes ff WHERE ff.funcionario_id=f.id),
      'nivel',1,'ativo',f.ativo) ORDER BY f.nome),'[]'::jsonb) FROM "APONTADOR DE PRODUÇÃO".funcionarios f),
    'produtos', (SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id::text,'codigo',p.codigo,'nome',p.nome,'descricao',p.descricao) ORDER BY p.nome),'[]'::jsonb) FROM "APONTADOR DE PRODUÇÃO".produtos p),
    'processos', (SELECT coalesce(jsonb_agg(jsonb_build_object('id',pr.id::text,'codigo',pr.codigo,'nome',pr.nome,'funcao',pr.funcao_id::text) ORDER BY pr.nome),'[]'::jsonb) FROM "APONTADOR DE PRODUÇÃO".processos pr),
    'roteiro', (SELECT coalesce(jsonb_agg(jsonb_build_object('id',pp.id::text,'produto',pp.produto_id::text,'processo',pp.processo_id::text,'tempo',pp.tempo_padrao_segundos,'etapa',pp.etapa,'final',pp.etapa_final) ORDER BY pp.produto_id,pp.etapa),'[]'::jsonb) FROM "APONTADOR DE PRODUÇÃO".produto_processos pp WHERE pp.ativo),
    'niveis', (SELECT coalesce(jsonb_agg(jsonb_build_object('id',n.id,'ordem',n.ordem,'nome',n.nome,'descricao',n.descricao) ORDER BY n.ordem),'[]'::jsonb) FROM "APONTADOR DE PRODUÇÃO".niveis_operador n WHERE n.ativo),
    'horarios', (SELECT coalesce(jsonb_agg(jsonb_build_object('id',h.id::text,'inicio',to_char(h.inicio,'HH24:MI'),'fim',to_char(h.fim,'HH24:MI'),'ativo',h.ativo) ORDER BY h.inicio,h.fim),'[]'::jsonb) FROM "APONTADOR DE PRODUÇÃO".horarios_padrao h),
    'tempos', (SELECT coalesce(jsonb_agg(jsonb_build_object('id',t.id::text,'funcionario',t.funcionario_id::text,
      'produto',pp.produto_id::text,'processo',pp.processo_id::text,'roteiro',pp.id::text,'segundos',t.tempo_segundos,'nivel',t.nivel_id,
      'alteradoEm',to_char(t.vigencia_inicio AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD')) ORDER BY t.funcionario_id,t.produto_processo_id),'[]'::jsonb)
      FROM "APONTADOR DE PRODUÇÃO".tempos_operador t JOIN "APONTADOR DE PRODUÇÃO".produto_processos pp ON pp.id=t.produto_processo_id
      WHERE t.vigencia_inicio<=now() AND (t.vigencia_fim IS NULL OR t.vigencia_fim>now())),
    'lancamentos',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',l.id::text,'data',l.data_apontamento,
      'funcionario',l.funcionario_id::text,'produto',pp.produto_id::text,'processo',pp.processo_id::text,'roteiro',l.produto_processo_id::text,
      'inicio',to_char(l.hora_inicio,'HH24:MI'),'fim',to_char(l.hora_fim,'HH24:MI'),
      'realizado',l.realizado_pecas,'metaSnapshot',l.meta_pecas,'tempoSnapshot',l.tempo_aplicado_segundos,
      'nivelSnapshot',l.nivel_operador_id,'finalSnapshot',l.etapa_final_snapshot,
      'setor',l.setor_id_historico::text,'grupo',l.grupo_id_historico::text,'setorNomeHistorico',l.setor_nome_historico,'grupoNomeHistorico',l.grupo_nome_historico) ORDER BY l.data_apontamento,l.hora_inicio,l.id),'[]'::jsonb)
      FROM "APONTADOR DE PRODUÇÃO"."Lançamentos" l LEFT JOIN "APONTADOR DE PRODUÇÃO".produto_processos pp ON pp.id=l.produto_processo_id)
  );
END;
$function$;

-- 6. RPC de gravação: roteiro explícito no apontamento, operação final com opção
--    retroativa e cadastro de horários fixos -----------------------------------
CREATE OR REPLACE FUNCTION public.apontador_salvar(p_tipo text, p_dados jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_id bigint;
  v_pp bigint;
  v_func bigint;
  v_prod bigint;
  v_processo bigint;
  v_current bigint;
  v_val bigint;
  v_n integer;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.apontador_acessos a
     WHERE a.email = lower((select auth.jwt()->>'email'))
       AND a.ativo AND a.perfil IN('admin','editor')) THEN
    RAISE EXCEPTION 'Seu usuário não tem permissão para gravar dados.' USING ERRCODE='42501';
 END IF;
 IF p_dados IS NULL OR jsonb_typeof(p_dados) <> 'object' THEN
    RAISE EXCEPTION 'Envie os dados no formato de objeto JSON.';
 END IF;
 CASE p_tipo
 WHEN 'entry' THEN
    v_func := (p_dados->>'funcionario')::bigint;
    v_prod := (p_dados->>'produto')::bigint;
    v_processo := (p_dados->>'processo')::bigint;
    IF NOT EXISTS(SELECT 1 FROM "APONTADOR DE PRODUÇÃO".funcionarios f WHERE f.id=v_func AND f.ativo) THEN
      RAISE EXCEPTION 'Funcionário inexistente ou inativo.';
    END IF;
    IF nullif(p_dados->>'roteiro','') IS NOT NULL THEN
      SELECT pp.id INTO v_pp FROM "APONTADOR DE PRODUÇÃO".produto_processos pp
       WHERE pp.id=(p_dados->>'roteiro')::bigint AND pp.produto_id=v_prod AND pp.ativo;
    ELSE
      SELECT pp.id INTO v_pp FROM "APONTADOR DE PRODUÇÃO".produto_processos pp
       WHERE pp.produto_id=v_prod AND pp.processo_id=v_processo AND pp.ativo
       ORDER BY pp.etapa LIMIT 1;
    END IF;
    IF v_pp IS NULL THEN RAISE EXCEPTION 'A operação não faz parte do roteiro do produto.'; END IF;
    INSERT INTO "APONTADOR DE PRODUÇÃO"."Lançamentos"
      (data_apontamento,funcionario_id,produto_processo_id,produto,processo,funcionario,
       hora_inicio,hora_fim,meta_hora_pecas,meta_pecas,duracao_minutos,realizado_pecas)
    VALUES ((p_dados->>'data')::date,v_func,v_pp,'Apuração automática','Apuração automática',
      'Apuração automática',(p_dados->>'inicio')::time,(p_dados->>'fim')::time,
      1,0,1,(p_dados->>'realizado')::integer)
    RETURNING id INTO v_id;
 WHEN 'employee' THEN
    INSERT INTO "APONTADOR DE PRODUÇÃO".funcionarios (nome,matricula,setor_id,grupo_id)
    VALUES (btrim(p_dados->>'nome'),nullif(btrim(p_dados->>'matricula'),''),(p_dados->>'setor')::bigint,nullif(p_dados->>'grupo','')::bigint)
    RETURNING id INTO v_id;
    FOR v_val IN SELECT value::bigint FROM jsonb_array_elements_text(coalesce(p_dados->'maquinas','[]'::jsonb)) AS x(value) LOOP
      INSERT INTO "APONTADOR DE PRODUÇÃO".funcionario_maquinas(funcionario_id,maquina_id) VALUES(v_id,v_val);
    END LOOP;
    FOR v_val IN SELECT value::bigint FROM jsonb_array_elements_text(coalesce(p_dados->'funcoes','[]'::jsonb)) AS x(value) LOOP
      INSERT INTO "APONTADOR DE PRODUÇÃO".funcionario_funcoes(funcionario_id,funcao_id) VALUES(v_id,v_val);
    END LOOP;
 WHEN 'employee_update' THEN
    v_id := (p_dados->>'id')::bigint;
    UPDATE "APONTADOR DE PRODUÇÃO".funcionarios
       SET nome=btrim(p_dados->>'nome'),
           matricula=nullif(btrim(p_dados->>'matricula'),''),
           setor_id=(p_dados->>'setor')::bigint,
           grupo_id=nullif(p_dados->>'grupo','')::bigint
     WHERE id=v_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Funcionário não encontrado para edição.'; END IF;
    DELETE FROM "APONTADOR DE PRODUÇÃO".funcionario_maquinas WHERE funcionario_id=v_id;
    INSERT INTO "APONTADOR DE PRODUÇÃO".funcionario_maquinas(funcionario_id,maquina_id)
      SELECT v_id,value::bigint FROM jsonb_array_elements_text(coalesce(p_dados->'maquinas','[]'::jsonb)) AS x(value);
    DELETE FROM "APONTADOR DE PRODUÇÃO".funcionario_funcoes WHERE funcionario_id=v_id;
    INSERT INTO "APONTADOR DE PRODUÇÃO".funcionario_funcoes(funcionario_id,funcao_id)
      SELECT v_id,value::bigint FROM jsonb_array_elements_text(coalesce(p_dados->'funcoes','[]'::jsonb)) AS x(value);
 WHEN 'sector' THEN
    INSERT INTO "APONTADOR DE PRODUÇÃO".setores(nome,descricao)
    VALUES (btrim(p_dados->>'nome'),nullif(btrim(p_dados->>'descricao'),''))
    RETURNING id INTO v_id;
 WHEN 'group' THEN
    INSERT INTO "APONTADOR DE PRODUÇÃO".grupos(setor_id,nome,codigo,descricao)
    VALUES ((p_dados->>'setor')::bigint,btrim(p_dados->>'nome'),nullif(btrim(p_dados->>'codigo'),''),
            nullif(btrim(p_dados->>'descricao'),''))
    RETURNING id INTO v_id;
 WHEN 'machine' THEN
    INSERT INTO "APONTADOR DE PRODUÇÃO".maquinas(nome,codigo,tipo,setor_id,descricao)
    VALUES (btrim(p_dados->>'nome'),nullif(btrim(p_dados->>'codigo'),''),
            nullif(btrim(p_dados->>'tipo'),''),nullif(p_dados->>'setor','')::bigint,
            nullif(btrim(p_dados->>'descricao'),''))
    RETURNING id INTO v_id;
 WHEN 'function' THEN
    INSERT INTO "APONTADOR DE PRODUÇÃO".funcoes(nome,descricao)
    VALUES (btrim(p_dados->>'nome'),nullif(btrim(p_dados->>'descricao'),''))
    RETURNING id INTO v_id;
 WHEN 'final_operation' THEN
    v_prod := (p_dados->>'produto')::bigint;
    v_pp := nullif(p_dados->>'roteiro','')::bigint;
    IF NOT EXISTS(SELECT 1 FROM "APONTADOR DE PRODUÇÃO".produtos WHERE id=v_prod) THEN
       RAISE EXCEPTION 'Produto não encontrado.';
    END IF;
    IF v_pp IS NOT NULL AND NOT EXISTS(
      SELECT 1 FROM "APONTADOR DE PRODUÇÃO".produto_processos pp
      WHERE pp.id=v_pp AND pp.produto_id=v_prod AND pp.ativo
    ) THEN RAISE EXCEPTION 'A operação final deve fazer parte do roteiro do produto.'; END IF;
    UPDATE "APONTADOR DE PRODUÇÃO".produto_processos SET etapa_final=false WHERE produto_id=v_prod AND etapa_final;
    IF v_pp IS NOT NULL THEN
      UPDATE "APONTADOR DE PRODUÇÃO".produto_processos SET etapa_final=true WHERE id=v_pp AND produto_id=v_prod AND ativo;
    END IF;
    -- Por padrão, só os novos apontamentos usam a nova definição.
    -- Com "retroativo", os apontamentos já registrados deste produto também são reclassificados.
    IF coalesce((p_dados->>'retroativo')::boolean, false) THEN
      UPDATE "APONTADOR DE PRODUÇÃO"."Lançamentos" l
         SET etapa_final_snapshot = (v_pp IS NOT NULL AND l.produto_processo_id = v_pp)
        FROM "APONTADOR DE PRODUÇÃO".produto_processos pp
       WHERE pp.id = l.produto_processo_id AND pp.produto_id = v_prod
         AND l.etapa_final_snapshot IS DISTINCT FROM (v_pp IS NOT NULL AND l.produto_processo_id = v_pp);
      GET DIAGNOSTICS v_n = ROW_COUNT;
    END IF;
    v_id := v_pp;
 WHEN 'product' THEN
    INSERT INTO "APONTADOR DE PRODUÇÃO".produtos(codigo,nome,descricao)
    VALUES (nullif(btrim(p_dados->>'codigo'),''),btrim(p_dados->>'nome'),nullif(btrim(p_dados->>'descricao'),''))
    RETURNING id INTO v_id;
 WHEN 'process' THEN
    INSERT INTO "APONTADOR DE PRODUÇÃO".processos(codigo,nome,funcao_id)
    VALUES (nullif(btrim(p_dados->>'codigo'),''),btrim(p_dados->>'nome'),nullif(p_dados->>'funcao','')::bigint)
    RETURNING id INTO v_id;
 WHEN 'linkprocess' THEN
    v_prod := (p_dados->>'produto')::bigint;
    v_processo := (p_dados->>'processo')::bigint;
    IF EXISTS(SELECT 1 FROM "APONTADOR DE PRODUÇÃO".produto_processos WHERE produto_id=v_prod AND processo_id=v_processo) THEN
       RAISE EXCEPTION 'Operação já vinculada a este produto.';
    END IF;
    INSERT INTO "APONTADOR DE PRODUÇÃO".produto_processos(produto_id,processo_id,tempo_padrao_segundos,etapa)
    VALUES(v_prod,v_processo,(p_dados->>'tempo')::numeric,
     (SELECT coalesce(max(etapa),0)+1 FROM "APONTADOR DE PRODUÇÃO".produto_processos WHERE produto_id=v_prod))
    RETURNING id INTO v_id;
 WHEN 'time' THEN
    v_func := (p_dados->>'funcionario')::bigint;
    v_prod := (p_dados->>'produto')::bigint;
    v_processo := (p_dados->>'processo')::bigint;
    SELECT pp.id INTO STRICT v_pp FROM "APONTADOR DE PRODUÇÃO".produto_processos pp
    WHERE pp.produto_id=v_prod AND pp.processo_id=v_processo AND pp.ativo
    ORDER BY pp.etapa LIMIT 1;
    SELECT t.id INTO v_current FROM "APONTADOR DE PRODUÇÃO".tempos_operador t
       WHERE t.funcionario_id=v_func AND t.produto_processo_id=v_pp AND t.vigencia_fim IS NULL
       FOR UPDATE;
    IF v_current IS NOT NULL THEN
      UPDATE "APONTADOR DE PRODUÇÃO".tempos_operador SET vigencia_fim=now() WHERE id=v_current;
    END IF;
    INSERT INTO "APONTADOR DE PRODUÇÃO".tempos_operador
      (funcionario_id,produto_processo_id,nivel_id,tempo_segundos,motivo,aprovado_por,vigencia_inicio)
    VALUES (v_func,v_pp,(p_dados->>'nivel')::bigint,(p_dados->>'segundos')::numeric,
        nullif(btrim(p_dados->>'motivo'),''),coalesce((select auth.jwt()->>'email'),'usuario'),now())
    RETURNING id INTO v_id;
 WHEN 'slot' THEN
    INSERT INTO "APONTADOR DE PRODUÇÃO".horarios_padrao(inicio,fim)
    VALUES ((p_dados->>'inicio')::time,(p_dados->>'fim')::time)
    ON CONFLICT (inicio,fim) DO UPDATE SET ativo=true
    RETURNING id INTO v_id;
 WHEN 'slot_toggle' THEN
    v_id := (p_dados->>'id')::bigint;
    UPDATE "APONTADOR DE PRODUÇÃO".horarios_padrao SET ativo = coalesce((p_dados->>'ativo')::boolean, NOT ativo) WHERE id=v_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Horário não encontrado.'; END IF;
 ELSE
    RAISE EXCEPTION 'Operação não permitida.';
 END CASE;
 RETURN jsonb_build_object('ok',true,'tipo',p_tipo,'id',v_id::text,'afetados',v_n);
END;
$function$;

-- Ajuste de dados aplicado após a migração (2026-11-09): operações finais definidas pela
-- versão anterior da tela (que valia para o histórico) tiveram seus lançamentos marcados.
-- UPDATE "APONTADOR DE PRODUÇÃO"."Lançamentos" l SET etapa_final_snapshot = true
--   FROM "APONTADOR DE PRODUÇÃO".produto_processos pp
--  WHERE pp.id = l.produto_processo_id AND pp.etapa_final AND NOT l.etapa_final_snapshot;
