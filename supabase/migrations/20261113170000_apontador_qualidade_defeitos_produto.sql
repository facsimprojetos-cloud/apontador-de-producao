-- Defeitos característicos por produto: se o produto tiver uma lista própria, o formulário mostra só ela.
CREATE TABLE IF NOT EXISTS "APONTADOR DE PRODUÇÃO".qualidade_produto_defeitos (
  produto_id bigint NOT NULL REFERENCES "APONTADOR DE PRODUÇÃO".produtos(id) ON DELETE CASCADE,
  defeito_id bigint NOT NULL REFERENCES "APONTADOR DE PRODUÇÃO".qualidade_defeitos(id) ON DELETE CASCADE,
  empresa_id bigint NOT NULL DEFAULT public.apontador_empresa_atual() REFERENCES public.empresas(id),
  PRIMARY KEY (produto_id, defeito_id)
);
ALTER TABLE "APONTADOR DE PRODUÇÃO".qualidade_produto_defeitos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "APONTADOR DE PRODUÇÃO".qualidade_produto_defeitos FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON "APONTADOR DE PRODUÇÃO".qualidade_produto_defeitos TO authenticated;
DROP POLICY IF EXISTS apontador_ler ON "APONTADOR DE PRODUÇÃO".qualidade_produto_defeitos;
CREATE POLICY apontador_ler ON "APONTADOR DE PRODUÇÃO".qualidade_produto_defeitos FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.apontador_acessos a WHERE a.ativo AND a.email = lower((SELECT auth.jwt()->>'email'))));
DROP POLICY IF EXISTS apontador_gravar ON "APONTADOR DE PRODUÇÃO".qualidade_produto_defeitos;
CREATE POLICY apontador_gravar ON "APONTADOR DE PRODUÇÃO".qualidade_produto_defeitos FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.apontador_acessos a WHERE a.ativo AND a.email = lower((SELECT auth.jwt()->>'email')) AND a.perfil IN ('admin','editor')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.apontador_acessos a WHERE a.ativo AND a.email = lower((SELECT auth.jwt()->>'email')) AND a.perfil IN ('admin','editor')));
DROP POLICY IF EXISTS empresa_isolamento ON "APONTADOR DE PRODUÇÃO".qualidade_produto_defeitos;
CREATE POLICY empresa_isolamento ON "APONTADOR DE PRODUÇÃO".qualidade_produto_defeitos AS RESTRICTIVE FOR ALL TO authenticated
  USING (empresa_id = (SELECT public.apontador_empresa_atual())) WITH CHECK (empresa_id = (SELECT public.apontador_empresa_atual()));

DO $mig$
DECLARE d text; n text;
BEGIN
  -- carregar: vínculos produto × defeito
  d := pg_get_functiondef('public.apontador_carregar()'::regprocedure);
  n := replace(d, $a$    'defeitos', (SELECT$a$, $b$    'defeitosProduto', (SELECT coalesce(jsonb_agg(jsonb_build_object('produto',pd.produto_id::text,'defeito',pd.defeito_id::text)),'[]'::jsonb) FROM "APONTADOR DE PRODUÇÃO".qualidade_produto_defeitos pd),
    'defeitos', (SELECT$b$);
  IF n = d THEN RAISE EXCEPTION 'apontador_carregar: trecho de defeitos não encontrado'; END IF;
  EXECUTE n;

  -- salvar: lista de defeitos do produto (substitui a lista inteira)
  d := pg_get_functiondef('public.apontador_qualidade_salvar(text,jsonb)'::regprocedure);
  n := replace(d, $a$  WHEN 'inspecao' THEN$a$, $b$  WHEN 'produto_defeitos' THEN
    v_id := (p_dados->>'produto')::bigint;
    IF NOT EXISTS (SELECT 1 FROM "APONTADOR DE PRODUÇÃO".produtos WHERE id = v_id) THEN RAISE EXCEPTION 'Produto não encontrado.'; END IF;
    DELETE FROM "APONTADOR DE PRODUÇÃO".qualidade_produto_defeitos WHERE produto_id = v_id;
    INSERT INTO "APONTADOR DE PRODUÇÃO".qualidade_produto_defeitos (produto_id, defeito_id)
      SELECT v_id, d2.id FROM "APONTADOR DE PRODUÇÃO".qualidade_defeitos d2
       WHERE d2.id IN (SELECT (jsonb_array_elements_text(coalesce(p_dados->'defeitos','[]'::jsonb)))::bigint);
  WHEN 'inspecao' THEN$b$);
  IF n = d THEN RAISE EXCEPTION 'apontador_qualidade_salvar: trecho não encontrado'; END IF;
  EXECUTE n;
END
$mig$;
