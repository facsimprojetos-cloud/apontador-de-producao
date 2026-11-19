-- Exclusao logica: preserva ids, FK e apontamentos historicos.
BEGIN;
GRANT UPDATE ON TABLE "APONTADOR DE PRODUÇÃO".setores TO authenticated;
DROP POLICY IF EXISTS apontador_cadastro_editar ON "APONTADOR DE PRODUÇÃO".setores;
CREATE POLICY apontador_cadastro_editar ON "APONTADOR DE PRODUÇÃO".setores FOR UPDATE TO authenticated
USING (empresa_id = (SELECT public.apontador_empresa_atual()) AND EXISTS (
  SELECT 1 FROM public.apontador_acessos a WHERE a.email=lower((SELECT auth.jwt()->>'email'))
  AND a.ativo AND a.perfil IN ('admin','editor')))
WITH CHECK (empresa_id = (SELECT public.apontador_empresa_atual()) AND EXISTS (
  SELECT 1 FROM public.apontador_acessos a WHERE a.email=lower((SELECT auth.jwt()->>'email'))
  AND a.ativo AND a.perfil IN ('admin','editor')));
GRANT UPDATE ON TABLE "APONTADOR DE PRODUÇÃO".grupos TO authenticated;
DROP POLICY IF EXISTS apontador_cadastro_editar ON "APONTADOR DE PRODUÇÃO".grupos;
CREATE POLICY apontador_cadastro_editar ON "APONTADOR DE PRODUÇÃO".grupos FOR UPDATE TO authenticated
USING (empresa_id = (SELECT public.apontador_empresa_atual()) AND EXISTS (
  SELECT 1 FROM public.apontador_acessos a WHERE a.email=lower((SELECT auth.jwt()->>'email'))
  AND a.ativo AND a.perfil IN ('admin','editor')))
WITH CHECK (empresa_id = (SELECT public.apontador_empresa_atual()) AND EXISTS (
  SELECT 1 FROM public.apontador_acessos a WHERE a.email=lower((SELECT auth.jwt()->>'email'))
  AND a.ativo AND a.perfil IN ('admin','editor')));
GRANT UPDATE ON TABLE "APONTADOR DE PRODUÇÃO".maquinas TO authenticated;
DROP POLICY IF EXISTS apontador_cadastro_editar ON "APONTADOR DE PRODUÇÃO".maquinas;
CREATE POLICY apontador_cadastro_editar ON "APONTADOR DE PRODUÇÃO".maquinas FOR UPDATE TO authenticated
USING (empresa_id = (SELECT public.apontador_empresa_atual()) AND EXISTS (
  SELECT 1 FROM public.apontador_acessos a WHERE a.email=lower((SELECT auth.jwt()->>'email'))
  AND a.ativo AND a.perfil IN ('admin','editor')))
WITH CHECK (empresa_id = (SELECT public.apontador_empresa_atual()) AND EXISTS (
  SELECT 1 FROM public.apontador_acessos a WHERE a.email=lower((SELECT auth.jwt()->>'email'))
  AND a.ativo AND a.perfil IN ('admin','editor')));
GRANT UPDATE ON TABLE "APONTADOR DE PRODUÇÃO".funcoes TO authenticated;
DROP POLICY IF EXISTS apontador_cadastro_editar ON "APONTADOR DE PRODUÇÃO".funcoes;
CREATE POLICY apontador_cadastro_editar ON "APONTADOR DE PRODUÇÃO".funcoes FOR UPDATE TO authenticated
USING (empresa_id = (SELECT public.apontador_empresa_atual()) AND EXISTS (
  SELECT 1 FROM public.apontador_acessos a WHERE a.email=lower((SELECT auth.jwt()->>'email'))
  AND a.ativo AND a.perfil IN ('admin','editor')))
WITH CHECK (empresa_id = (SELECT public.apontador_empresa_atual()) AND EXISTS (
  SELECT 1 FROM public.apontador_acessos a WHERE a.email=lower((SELECT auth.jwt()->>'email'))
  AND a.ativo AND a.perfil IN ('admin','editor')));
GRANT UPDATE ON TABLE "APONTADOR DE PRODUÇÃO".produtos TO authenticated;
DROP POLICY IF EXISTS apontador_cadastro_editar ON "APONTADOR DE PRODUÇÃO".produtos;
CREATE POLICY apontador_cadastro_editar ON "APONTADOR DE PRODUÇÃO".produtos FOR UPDATE TO authenticated
USING (empresa_id = (SELECT public.apontador_empresa_atual()) AND EXISTS (
  SELECT 1 FROM public.apontador_acessos a WHERE a.email=lower((SELECT auth.jwt()->>'email'))
  AND a.ativo AND a.perfil IN ('admin','editor')))
WITH CHECK (empresa_id = (SELECT public.apontador_empresa_atual()) AND EXISTS (
  SELECT 1 FROM public.apontador_acessos a WHERE a.email=lower((SELECT auth.jwt()->>'email'))
  AND a.ativo AND a.perfil IN ('admin','editor')));
GRANT UPDATE ON TABLE "APONTADOR DE PRODUÇÃO".processos TO authenticated;
DROP POLICY IF EXISTS apontador_cadastro_editar ON "APONTADOR DE PRODUÇÃO".processos;
CREATE POLICY apontador_cadastro_editar ON "APONTADOR DE PRODUÇÃO".processos FOR UPDATE TO authenticated
USING (empresa_id = (SELECT public.apontador_empresa_atual()) AND EXISTS (
  SELECT 1 FROM public.apontador_acessos a WHERE a.email=lower((SELECT auth.jwt()->>'email'))
  AND a.ativo AND a.perfil IN ('admin','editor')))
WITH CHECK (empresa_id = (SELECT public.apontador_empresa_atual()) AND EXISTS (
  SELECT 1 FROM public.apontador_acessos a WHERE a.email=lower((SELECT auth.jwt()->>'email'))
  AND a.ativo AND a.perfil IN ('admin','editor')));
GRANT UPDATE ON TABLE "APONTADOR DE PRODUÇÃO".produto_processos TO authenticated;
DROP POLICY IF EXISTS apontador_cadastro_editar ON "APONTADOR DE PRODUÇÃO".produto_processos;
CREATE POLICY apontador_cadastro_editar ON "APONTADOR DE PRODUÇÃO".produto_processos FOR UPDATE TO authenticated
USING (empresa_id = (SELECT public.apontador_empresa_atual()) AND EXISTS (
  SELECT 1 FROM public.apontador_acessos a WHERE a.email=lower((SELECT auth.jwt()->>'email'))
  AND a.ativo AND a.perfil IN ('admin','editor')))
WITH CHECK (empresa_id = (SELECT public.apontador_empresa_atual()) AND EXISTS (
  SELECT 1 FROM public.apontador_acessos a WHERE a.email=lower((SELECT auth.jwt()->>'email'))
  AND a.ativo AND a.perfil IN ('admin','editor')));
GRANT UPDATE ON TABLE "APONTADOR DE PRODUÇÃO".funcionarios TO authenticated;
DROP POLICY IF EXISTS apontador_cadastro_editar ON "APONTADOR DE PRODUÇÃO".funcionarios;
CREATE POLICY apontador_cadastro_editar ON "APONTADOR DE PRODUÇÃO".funcionarios FOR UPDATE TO authenticated
USING (empresa_id = (SELECT public.apontador_empresa_atual()) AND EXISTS (
  SELECT 1 FROM public.apontador_acessos a WHERE a.email=lower((SELECT auth.jwt()->>'email'))
  AND a.ativo AND a.perfil IN ('admin','editor')))
WITH CHECK (empresa_id = (SELECT public.apontador_empresa_atual()) AND EXISTS (
  SELECT 1 FROM public.apontador_acessos a WHERE a.email=lower((SELECT auth.jwt()->>'email'))
  AND a.ativo AND a.perfil IN ('admin','editor')));

CREATE OR REPLACE FUNCTION public.apontador_cadastro_gerenciar(p_tipo text, p_acao text, p_dados jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path TO '' AS $fn$
DECLARE v_empresa bigint; v_id bigint; v_tabela text; v_rows integer;
BEGIN
 v_empresa:=public.apontador_empresa_atual();
 IF v_empresa IS NULL OR NOT EXISTS (
   SELECT 1 FROM public.apontador_acessos a WHERE a.email=lower((SELECT auth.jwt()->>'email'))
   AND a.ativo AND a.perfil IN ('admin','editor') AND a.empresa_id=v_empresa
 ) THEN RAISE EXCEPTION 'Sem permissao para alterar este cadastro.' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(p_dados) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Dados invalidos.'; END IF;
 v_id:=nullif(p_dados->>'id','')::bigint;
 IF v_id IS NULL THEN RAISE EXCEPTION 'Identificador obrigatorio.'; END IF;
 v_tabela:= CASE p_tipo
   WHEN 'sector' THEN 'setores' WHEN 'group' THEN 'grupos'
   WHEN 'machine' THEN 'maquinas' WHEN 'function' THEN 'funcoes'
   WHEN 'product' THEN 'produtos' WHEN 'process' THEN 'processos'
   WHEN 'employee' THEN 'funcionarios' WHEN 'route' THEN 'produto_processos'
   ELSE NULL END;
 IF v_tabela IS NULL THEN RAISE EXCEPTION 'Tipo nao permitido.'; END IF;
 IF p_acao IN ('excluir','reativar') THEN
   EXECUTE format('UPDATE "APONTADOR DE PRODUÇÃO".%I SET ativo=$1 WHERE id=$2 AND empresa_id=$3',v_tabela)
   USING (p_acao='reativar'),v_id,v_empresa;
 ELSIF p_acao='editar' THEN
   IF nullif(btrim(p_dados->>'nome'),'') IS NULL THEN
     RAISE EXCEPTION 'Nome obrigatorio.'; END IF;
   CASE p_tipo
WHEN 'sector' THEN
 UPDATE "APONTADOR DE PRODUÇÃO".setores SET nome=CASE WHEN p_dados ? 'nome' THEN nullif(btrim(p_dados->>'nome'),'') ELSE nome END, descricao=CASE WHEN p_dados ? 'descricao' THEN nullif(btrim(p_dados->>'descricao'),'') ELSE descricao END
 WHERE id=v_id AND empresa_id=v_empresa;
WHEN 'group' THEN
 UPDATE "APONTADOR DE PRODUÇÃO".grupos SET nome=CASE WHEN p_dados ? 'nome' THEN nullif(btrim(p_dados->>'nome'),'') ELSE nome END, codigo=CASE WHEN p_dados ? 'codigo' THEN nullif(btrim(p_dados->>'codigo'),'') ELSE codigo END, descricao=CASE WHEN p_dados ? 'descricao' THEN nullif(btrim(p_dados->>'descricao'),'') ELSE descricao END, setor_id=CASE WHEN p_dados ? 'setor' THEN nullif(btrim(p_dados->>'setor'),'')::bigint ELSE setor_id END
 WHERE id=v_id AND empresa_id=v_empresa;
WHEN 'machine' THEN
 UPDATE "APONTADOR DE PRODUÇÃO".maquinas SET nome=CASE WHEN p_dados ? 'nome' THEN nullif(btrim(p_dados->>'nome'),'') ELSE nome END, codigo=CASE WHEN p_dados ? 'codigo' THEN nullif(btrim(p_dados->>'codigo'),'') ELSE codigo END, tipo=CASE WHEN p_dados ? 'tipo' THEN nullif(btrim(p_dados->>'tipo'),'') ELSE tipo END, descricao=CASE WHEN p_dados ? 'descricao' THEN nullif(btrim(p_dados->>'descricao'),'') ELSE descricao END, setor_id=CASE WHEN p_dados ? 'setor' THEN nullif(btrim(p_dados->>'setor'),'')::bigint ELSE setor_id END
 WHERE id=v_id AND empresa_id=v_empresa;
WHEN 'function' THEN
 UPDATE "APONTADOR DE PRODUÇÃO".funcoes SET nome=CASE WHEN p_dados ? 'nome' THEN nullif(btrim(p_dados->>'nome'),'') ELSE nome END, descricao=CASE WHEN p_dados ? 'descricao' THEN nullif(btrim(p_dados->>'descricao'),'') ELSE descricao END
 WHERE id=v_id AND empresa_id=v_empresa;
WHEN 'product' THEN
 UPDATE "APONTADOR DE PRODUÇÃO".produtos SET nome=CASE WHEN p_dados ? 'nome' THEN nullif(btrim(p_dados->>'nome'),'') ELSE nome END, codigo=CASE WHEN p_dados ? 'codigo' THEN nullif(btrim(p_dados->>'codigo'),'') ELSE codigo END, descricao=CASE WHEN p_dados ? 'descricao' THEN nullif(btrim(p_dados->>'descricao'),'') ELSE descricao END
 WHERE id=v_id AND empresa_id=v_empresa;
WHEN 'process' THEN
 UPDATE "APONTADOR DE PRODUÇÃO".processos SET nome=CASE WHEN p_dados ? 'nome' THEN nullif(btrim(p_dados->>'nome'),'') ELSE nome END, codigo=CASE WHEN p_dados ? 'codigo' THEN nullif(btrim(p_dados->>'codigo'),'') ELSE codigo END, funcao_id=CASE WHEN p_dados ? 'funcao' THEN nullif(btrim(p_dados->>'funcao'),'')::bigint ELSE funcao_id END
 WHERE id=v_id AND empresa_id=v_empresa;
ELSE RAISE EXCEPTION 'Tipo nao editavel por esta funcao.';
   END CASE;
 ELSE RAISE EXCEPTION 'Acao invalida.';
 END IF;
 GET DIAGNOSTICS v_rows=ROW_COUNT;
 IF v_rows=0 THEN RAISE EXCEPTION 'Cadastro nao encontrado nesta empresa.'; END IF;
 RETURN jsonb_build_object('ok',true,'id',v_id::text,'acao',p_acao);
END $fn$;
REVOKE ALL ON FUNCTION public.apontador_cadastro_gerenciar(text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apontador_cadastro_gerenciar(text,text,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.apontador_carregar()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
BEGIN
  IF public.apontador_empresa_atual() IS NULL THEN
    RAISE EXCEPTION 'Acesso não autorizado ao Apontador de Produção.' USING ERRCODE='42501';
  END IF;
  RETURN jsonb_build_object(
    'perfil', (SELECT a.perfil FROM public.apontador_acessos a WHERE a.email = lower((select auth.jwt()->>'email')) AND a.ativo LIMIT 1),
    'empresa', (SELECT jsonb_build_object('id',e.id::text,'nome',e.nome) FROM public.empresas e WHERE e.id = public.apontador_empresa_atual()),
    'defeitos', (SELECT coalesce(jsonb_agg(jsonb_build_object('id',q.id::text,'nome',q.nome,'ativo',q.ativo) ORDER BY q.nome),'[]'::jsonb) FROM "APONTADOR DE PRODUÇÃO".qualidade_defeitos q),
    'qualidade', (SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.id::text,'lancamento',r.lancamento_id::text,'inspecionadas',r.inspecionadas,'defeituosas',r.defeituosas,
                   'retrabalho',r.retrabalho,'refugo',r.refugo,'observacao',r.observacao,
                   'defeitos',(SELECT coalesce(jsonb_agg(jsonb_build_object('defeito',x.defeito_id::text,'quantidade',x.quantidade)),'[]'::jsonb) FROM "APONTADOR DE PRODUÇÃO".qualidade_registro_defeitos x WHERE x.registro_id=r.id))),'[]'::jsonb)
                  FROM "APONTADOR DE PRODUÇÃO".qualidade_registros r),
    'donoPlataforma', coalesce((SELECT a.dono_plataforma FROM public.apontador_acessos a WHERE a.email = lower((select auth.jwt()->>'email')) AND a.ativo LIMIT 1), false),
    'setores', (SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.id::text,'nome',s.nome,'descricao',s.descricao,'ativo',s.ativo) ORDER BY s.nome),'[]'::jsonb) FROM "APONTADOR DE PRODUÇÃO".setores s),
    'grupos', (SELECT coalesce(jsonb_agg(jsonb_build_object('id',g.id::text,'nome',g.nome,'codigo',g.codigo,'descricao',g.descricao,'setor',g.setor_id::text,'ativo',g.ativo) ORDER BY g.nome),'[]'::jsonb) FROM "APONTADOR DE PRODUÇÃO".grupos g),
    'maquinas', (SELECT coalesce(jsonb_agg(jsonb_build_object('id',m.id::text,'nome',m.nome,'setor',m.setor_id::text,'codigo',m.codigo,'tipo',m.tipo,'descricao',m.descricao,'ativo',m.ativo) ORDER BY m.nome),'[]'::jsonb) FROM "APONTADOR DE PRODUÇÃO".maquinas m),
    'funcoes', (SELECT coalesce(jsonb_agg(jsonb_build_object('id',f.id::text,'nome',f.nome,'descricao',f.descricao,'ativo',f.ativo) ORDER BY f.nome),'[]'::jsonb) FROM "APONTADOR DE PRODUÇÃO".funcoes f),
    'funcionarios', (SELECT coalesce(jsonb_agg(jsonb_build_object('id',f.id::text,'nome',f.nome,'matricula',f.matricula,'setor',f.setor_id::text,'grupo',f.grupo_id::text,
      'maquinas',(SELECT coalesce(jsonb_agg(fm.maquina_id::text ORDER BY fm.maquina_id),'[]'::jsonb) FROM "APONTADOR DE PRODUÇÃO".funcionario_maquinas fm WHERE fm.funcionario_id=f.id),
      'funcoes',(SELECT coalesce(jsonb_agg(ff.funcao_id::text ORDER BY ff.funcao_id),'[]'::jsonb) FROM "APONTADOR DE PRODUÇÃO".funcionario_funcoes ff WHERE ff.funcionario_id=f.id),
      'operacoes',(SELECT coalesce(jsonb_agg(fo.produto_processo_id::text ORDER BY fo.produto_processo_id),'[]'::jsonb) FROM "APONTADOR DE PRODUÇÃO".funcionario_operacoes fo WHERE fo.funcionario_id=f.id),
      'nivel',1,'ativo',f.ativo) ORDER BY f.nome),'[]'::jsonb) FROM "APONTADOR DE PRODUÇÃO".funcionarios f),
    'produtos', (SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id::text,'codigo',p.codigo,'nome',p.nome,'descricao',p.descricao,'ativo',p.ativo) ORDER BY p.nome),'[]'::jsonb) FROM "APONTADOR DE PRODUÇÃO".produtos p),
    'processos', (SELECT coalesce(jsonb_agg(jsonb_build_object('id',pr.id::text,'codigo',pr.codigo,'nome',pr.nome,'funcao',pr.funcao_id::text,'ativo',pr.ativo) ORDER BY pr.nome),'[]'::jsonb) FROM "APONTADOR DE PRODUÇÃO".processos pr),
    'roteiro', (SELECT coalesce(jsonb_agg(jsonb_build_object('id',pp.id::text,'produto',pp.produto_id::text,'processo',pp.processo_id::text,'tempo',pp.tempo_padrao_segundos,'etapa',pp.etapa,'final',pp.etapa_final,'qualidade',pp.inspecao_qualidade,'ativo',pp.ativo) ORDER BY pp.produto_id,pp.etapa),'[]'::jsonb) FROM "APONTADOR DE PRODUÇÃO".produto_processos pp),
    'niveis', (SELECT coalesce(jsonb_agg(jsonb_build_object('id',n.id,'ordem',n.ordem,'nome',n.nome,'descricao',n.descricao) ORDER BY n.ordem),'[]'::jsonb) FROM "APONTADOR DE PRODUÇÃO".niveis_operador n WHERE n.ativo),
    'jornada', (SELECT coalesce(jsonb_agg(jsonb_build_object('dia',j.dia_semana,'ativo',j.ativo,'entrada',to_char(j.entrada,'HH24:MI'),'saida',to_char(j.saida,'HH24:MI'),
       'intervaloInicio',to_char(j.intervalo_inicio,'HH24:MI'),'intervaloFim',to_char(j.intervalo_fim,'HH24:MI'),
       'minutos',"APONTADOR DE PRODUÇÃO".minutos_jornada(('2026-11-01'::date + j.dia_semana))) ORDER BY j.dia_semana),'[]'::jsonb) FROM "APONTADOR DE PRODUÇÃO".jornada_semana j),
    'ausencias', (SELECT coalesce(jsonb_agg(jsonb_build_object('id',a.id::text,'funcionario',a.funcionario_id::text,'data',a.data,
       'inicio',to_char(a.hora_inicio,'HH24:MI'),'fim',to_char(a.hora_fim,'HH24:MI'),'minutos',a.minutos,'tipo',a.tipo,'motivo',a.motivo,'lote',a.lote::text) ORDER BY a.data, a.hora_inicio, a.id),'[]'::jsonb)
       FROM "APONTADOR DE PRODUÇÃO".ausencias a),
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
$function$

COMMIT;
