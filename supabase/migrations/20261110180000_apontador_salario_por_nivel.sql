-- Salário básico por nível (somente administradores) e nível registrado junto com o salário do funcionário.
-- niveis_operador é lida por todos os perfis, por isso o valor fica numa tabela separada com RLS de admin.

CREATE TABLE IF NOT EXISTS "APONTADOR DE PRODUÇÃO".nivel_salarios (
  nivel_id bigint PRIMARY KEY REFERENCES "APONTADOR DE PRODUÇÃO".niveis_operador(id) ON DELETE CASCADE,
  salario_base numeric(12,2) NOT NULL CHECK (salario_base >= 0),
  atualizado_por text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE "APONTADOR DE PRODUÇÃO".nivel_salarios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS apontador_admin ON "APONTADOR DE PRODUÇÃO".nivel_salarios;
CREATE POLICY apontador_admin ON "APONTADOR DE PRODUÇÃO".nivel_salarios FOR ALL TO authenticated
  USING ((SELECT public.apontador_eh_admin())) WITH CHECK ((SELECT public.apontador_eh_admin()));
REVOKE ALL ON "APONTADOR DE PRODUÇÃO".nivel_salarios FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON "APONTADOR DE PRODUÇÃO".nivel_salarios TO authenticated;

ALTER TABLE "APONTADOR DE PRODUÇÃO".funcionario_salarios
  ADD COLUMN IF NOT EXISTS nivel_id bigint REFERENCES "APONTADOR DE PRODUÇÃO".niveis_operador(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS funcionario_salarios_nivel_idx ON "APONTADOR DE PRODUÇÃO".funcionario_salarios(nivel_id);

-- Ajustes pontuais nas duas RPCs existentes (o restante do corpo permanece igual).
DO $mig$
DECLARE d text; n text;
BEGIN
  d := pg_get_functiondef('public.apontador_bonificacao(date)'::regprocedure);
  n := replace(d,
    $a$'salarios', (SELECT coalesce(jsonb_agg(jsonb_build_object('funcionario',s.funcionario_id::text,'salario',s.salario_base,'desde',s.vigencia_inicio)$a$,
    $b$'niveisSalario', (SELECT coalesce(jsonb_agg(jsonb_build_object('nivel',ns.nivel_id::text,'salario',ns.salario_base) ORDER BY ns.nivel_id),'[]'::jsonb) FROM "APONTADOR DE PRODUÇÃO".nivel_salarios ns),
   'salarios', (SELECT coalesce(jsonb_agg(jsonb_build_object('funcionario',s.funcionario_id::text,'salario',s.salario_base,'desde',s.vigencia_inicio,'nivel',s.nivel_id::text)$b$);
  IF n = d THEN RAISE EXCEPTION 'apontador_bonificacao: trecho de salários não encontrado'; END IF;
  EXECUTE n;

  d := pg_get_functiondef('public.apontador_bonificacao_salvar(text,jsonb)'::regprocedure);
  n := replace(d, 'vigencia_inicio, registrado_por)', 'vigencia_inicio, registrado_por, nivel_id)');
  n := replace(n, '::date)::date, v_email)', '::date)::date, v_email, nullif(p_dados->>''nivel'','''')::bigint)');
  n := replace(n, $a$  WHEN 'falta' THEN$a$, $b$  WHEN 'nivel_salario' THEN
    IF nullif(p_dados->>'salario','') IS NULL THEN
      DELETE FROM "APONTADOR DE PRODUÇÃO".nivel_salarios WHERE nivel_id=(p_dados->>'nivel')::bigint RETURNING nivel_id INTO v_id;
    ELSE
      INSERT INTO "APONTADOR DE PRODUÇÃO".nivel_salarios (nivel_id, salario_base, atualizado_por, updated_at)
      VALUES ((p_dados->>'nivel')::bigint, (p_dados->>'salario')::numeric, v_email, now())
      ON CONFLICT (nivel_id) DO UPDATE SET salario_base=EXCLUDED.salario_base, atualizado_por=EXCLUDED.atualizado_por, updated_at=now()
      RETURNING nivel_id INTO v_id;
    END IF;
  WHEN 'falta' THEN$b$);
  IF n NOT LIKE '%registrado_por, nivel_id)%' OR n NOT LIKE '%WHEN ''nivel_salario''%'
     OR (length(n) - length(replace(n, 'v_email, nullif(p_dados->>''nivel''', ''))) / length('v_email, nullif(p_dados->>''nivel''') <> 2 THEN
    RAISE EXCEPTION 'apontador_bonificacao_salvar: ajuste não aplicado como esperado';
  END IF;
  EXECUTE n;
END
$mig$;
