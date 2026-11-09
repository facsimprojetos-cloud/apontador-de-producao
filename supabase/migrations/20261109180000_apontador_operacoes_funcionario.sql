-- GUT Apontador — 2026-11-09
-- Operações (produto × operação do roteiro) que cada funcionário executa.
-- Base para a tela "Níveis e tempos": cada operação do funcionário mostra o tempo aplicado
-- (individual ou padrão) e o nível, e pode ser revisada.
-- Migração aditiva.

CREATE TABLE IF NOT EXISTS "APONTADOR DE PRODUÇÃO".funcionario_operacoes (
  funcionario_id bigint NOT NULL REFERENCES "APONTADOR DE PRODUÇÃO".funcionarios(id),
  produto_processo_id bigint NOT NULL REFERENCES "APONTADOR DE PRODUÇÃO".produto_processos(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (funcionario_id, produto_processo_id)
);
CREATE INDEX IF NOT EXISTS funcionario_operacoes_pp_idx ON "APONTADOR DE PRODUÇÃO".funcionario_operacoes(produto_processo_id);
COMMENT ON TABLE "APONTADOR DE PRODUÇÃO".funcionario_operacoes IS
  'Operações do roteiro (produto × operação) que o funcionário executa.';
ALTER TABLE "APONTADOR DE PRODUÇÃO".funcionario_operacoes ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, DELETE ON "APONTADOR DE PRODUÇÃO".funcionario_operacoes TO authenticated;
DROP POLICY IF EXISTS apontador_ler ON "APONTADOR DE PRODUÇÃO".funcionario_operacoes;
CREATE POLICY apontador_ler ON "APONTADOR DE PRODUÇÃO".funcionario_operacoes FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.apontador_acessos a WHERE a.ativo AND a.email = lower((SELECT auth.jwt()->>'email'))));
DROP POLICY IF EXISTS apontador_inserir ON "APONTADOR DE PRODUÇÃO".funcionario_operacoes;
CREATE POLICY apontador_inserir ON "APONTADOR DE PRODUÇÃO".funcionario_operacoes FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.apontador_acessos a WHERE a.ativo AND a.email = lower((SELECT auth.jwt()->>'email')) AND a.perfil IN ('admin','editor')));
DROP POLICY IF EXISTS apontador_excluir ON "APONTADOR DE PRODUÇÃO".funcionario_operacoes;
CREATE POLICY apontador_excluir ON "APONTADOR DE PRODUÇÃO".funcionario_operacoes FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.apontador_acessos a WHERE a.ativo AND a.email = lower((SELECT auth.jwt()->>'email')) AND a.perfil IN ('admin','editor')));

-- Ponto de partida: operações que já possuem tempo individual vigente.
INSERT INTO "APONTADOR DE PRODUÇÃO".funcionario_operacoes (funcionario_id, produto_processo_id)
SELECT DISTINCT t.funcionario_id, t.produto_processo_id
  FROM "APONTADOR DE PRODUÇÃO".tempos_operador t
 WHERE t.vigencia_fim IS NULL
ON CONFLICT DO NOTHING;

-- Ajustes pontuais nas RPCs existentes (substituição de trechos com verificação).
DO $mig$
DECLARE v_def text; v_old text; v_new text;
BEGIN
  -- apontador_carregar: lista de operações do funcionário
  v_def := pg_get_functiondef('public.apontador_carregar()'::regprocedure);
  v_old := $o$'nivel',1,'ativo',f.ativo)$o$;
  v_new := $n$'operacoes',(SELECT coalesce(jsonb_agg(fo.produto_processo_id::text ORDER BY fo.produto_processo_id),'[]'::jsonb) FROM "APONTADOR DE PRODUÇÃO".funcionario_operacoes fo WHERE fo.funcionario_id=f.id),
      'nivel',1,'ativo',f.ativo)$n$;
  IF position(v_old IN v_def) = 0 THEN RAISE EXCEPTION 'Trecho não encontrado em apontador_carregar'; END IF;
  EXECUTE replace(v_def, v_old, v_new);

  -- apontador_salvar
  v_def := pg_get_functiondef('public.apontador_salvar(text,jsonb)'::regprocedure);
  -- cadastro novo: grava operações
  v_old := $o$      INSERT INTO "APONTADOR DE PRODUÇÃO".funcionario_funcoes(funcionario_id,funcao_id) VALUES(v_id,v_val);
    END LOOP;
 WHEN 'employee_update' THEN$o$;
  v_new := $n$      INSERT INTO "APONTADOR DE PRODUÇÃO".funcionario_funcoes(funcionario_id,funcao_id) VALUES(v_id,v_val);
    END LOOP;
    INSERT INTO "APONTADOR DE PRODUÇÃO".funcionario_operacoes(funcionario_id,produto_processo_id)
      SELECT DISTINCT v_id,value::bigint FROM jsonb_array_elements_text(coalesce(p_dados->'operacoes','[]'::jsonb)) AS x(value);
 WHEN 'employee_update' THEN$n$;
  IF position(v_old IN v_def) = 0 THEN RAISE EXCEPTION 'Trecho employee não encontrado'; END IF;
  v_def := replace(v_def, v_old, v_new);
  -- edição: substitui operações (somente se a lista foi enviada)
  v_old := $o$    INSERT INTO "APONTADOR DE PRODUÇÃO".funcionario_funcoes(funcionario_id,funcao_id)
      SELECT v_id,value::bigint FROM jsonb_array_elements_text(coalesce(p_dados->'funcoes','[]'::jsonb)) AS x(value);
 WHEN 'sector' THEN$o$;
  v_new := $n$    INSERT INTO "APONTADOR DE PRODUÇÃO".funcionario_funcoes(funcionario_id,funcao_id)
      SELECT v_id,value::bigint FROM jsonb_array_elements_text(coalesce(p_dados->'funcoes','[]'::jsonb)) AS x(value);
    IF p_dados ? 'operacoes' THEN
      DELETE FROM "APONTADOR DE PRODUÇÃO".funcionario_operacoes WHERE funcionario_id=v_id;
      INSERT INTO "APONTADOR DE PRODUÇÃO".funcionario_operacoes(funcionario_id,produto_processo_id)
        SELECT DISTINCT v_id,value::bigint FROM jsonb_array_elements_text(p_dados->'operacoes') AS x(value);
    END IF;
 WHEN 'sector' THEN$n$;
  IF position(v_old IN v_def) = 0 THEN RAISE EXCEPTION 'Trecho employee_update não encontrado'; END IF;
  v_def := replace(v_def, v_old, v_new);
  -- revisão de tempo: aceita a operação exata do roteiro e vincula a operação ao funcionário
  v_old := $o$    SELECT pp.id INTO STRICT v_pp FROM "APONTADOR DE PRODUÇÃO".produto_processos pp
    WHERE pp.produto_id=v_prod AND pp.processo_id=v_processo AND pp.ativo
    ORDER BY pp.etapa LIMIT 1;
    SELECT t.id INTO v_current$o$;
  v_new := $n$    IF nullif(p_dados->>'roteiro','') IS NOT NULL THEN
      SELECT pp.id INTO v_pp FROM "APONTADOR DE PRODUÇÃO".produto_processos pp
       WHERE pp.id=(p_dados->>'roteiro')::bigint AND pp.ativo;
    ELSE
      SELECT pp.id INTO v_pp FROM "APONTADOR DE PRODUÇÃO".produto_processos pp
       WHERE pp.produto_id=v_prod AND pp.processo_id=v_processo AND pp.ativo
       ORDER BY pp.etapa LIMIT 1;
    END IF;
    IF v_pp IS NULL THEN RAISE EXCEPTION 'A operação não faz parte do roteiro do produto.'; END IF;
    INSERT INTO "APONTADOR DE PRODUÇÃO".funcionario_operacoes(funcionario_id,produto_processo_id)
      VALUES (v_func,v_pp) ON CONFLICT DO NOTHING;
    SELECT t.id INTO v_current$n$;
  IF position(v_old IN v_def) = 0 THEN RAISE EXCEPTION 'Trecho time não encontrado'; END IF;
  v_def := replace(v_def, v_old, v_new);
  EXECUTE v_def;
END
$mig$;
