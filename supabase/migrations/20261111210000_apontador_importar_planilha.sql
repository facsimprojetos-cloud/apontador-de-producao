-- Cadastro em massa a partir da planilha modelo. Só ACRESCENTA o que falta; nunca altera nem apaga cadastros existentes.
-- Com "simular": true faz tudo e desfaz no final, devolvendo o mesmo resumo (prévia antes de gravar).
-- SECURITY INVOKER: as políticas de RLS da empresa do usuário valem para cada inserção.
CREATE OR REPLACE FUNCTION public.apontador_importar(p_dados jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path TO '' AS $$
DECLARE
  x jsonb; v_res jsonb; c jsonb := '{}'::jsonb; av jsonb := '[]'::jsonb;
  v_set bigint; v_grp bigint; v_prod bigint; v_proc bigint; v_pp bigint; v_func bigint; v_et int; v_t numeric;
  n text; cod text; mat text; lin text;
BEGIN
  IF NOT public.apontador_eh_admin() THEN
    RAISE EXCEPTION 'Somente administradores importam planilhas.' USING ERRCODE='42501';
  END IF;
  BEGIN
    -- ---------- Setores ----------
    FOR x IN SELECT * FROM jsonb_array_elements(coalesce(p_dados->'setores','[]')) LOOP
      n := nullif(btrim(x->>'setor'),''); lin := 'Setores, linha '||coalesce(x->>'linha','?');
      CONTINUE WHEN n IS NULL;
      SELECT id INTO v_set FROM "APONTADOR DE PRODUÇÃO".setores WHERE lower(btrim(nome))=lower(n);
      IF v_set IS NULL THEN INSERT INTO "APONTADOR DE PRODUÇÃO".setores(nome) VALUES (n); c := jsonb_set(c,'{setores}',to_jsonb(coalesce((c->>'setores')::int,0)+1));
      ELSE c := jsonb_set(c,'{setores_existentes}',to_jsonb(coalesce((c->>'setores_existentes')::int,0)+1)); END IF;
    END LOOP;

    -- ---------- Grupos ----------
    FOR x IN SELECT * FROM jsonb_array_elements(coalesce(p_dados->'grupos','[]')) LOOP
      lin := 'Grupos, linha '||coalesce(x->>'linha','?'); n := nullif(btrim(x->>'grupo'),'');
      CONTINUE WHEN n IS NULL;
      BEGIN
        IF nullif(btrim(x->>'setor'),'') IS NULL THEN RAISE EXCEPTION 'informe o setor do grupo'; END IF;
        SELECT id INTO v_set FROM "APONTADOR DE PRODUÇÃO".setores WHERE lower(btrim(nome))=lower(btrim(x->>'setor'));
        IF v_set IS NULL THEN INSERT INTO "APONTADOR DE PRODUÇÃO".setores(nome) VALUES (btrim(x->>'setor')) RETURNING id INTO v_set;
          c := jsonb_set(c,'{setores}',to_jsonb(coalesce((c->>'setores')::int,0)+1)); END IF;
        SELECT id INTO v_grp FROM "APONTADOR DE PRODUÇÃO".grupos WHERE setor_id=v_set AND lower(btrim(nome))=lower(n);
        IF v_grp IS NULL THEN
          INSERT INTO "APONTADOR DE PRODUÇÃO".grupos(setor_id,nome,codigo) VALUES (v_set,n,nullif(btrim(x->>'codigo'),''));
          c := jsonb_set(c,'{grupos}',to_jsonb(coalesce((c->>'grupos')::int,0)+1));
        ELSE c := jsonb_set(c,'{grupos_existentes}',to_jsonb(coalesce((c->>'grupos_existentes')::int,0)+1)); END IF;
      EXCEPTION WHEN OTHERS THEN av := av || to_jsonb(lin||': '||SQLERRM);
      END;
    END LOOP;

    -- ---------- Operações ----------
    FOR x IN SELECT * FROM jsonb_array_elements(coalesce(p_dados->'operacoes','[]')) LOOP
      lin := 'Operações, linha '||coalesce(x->>'linha','?'); n := nullif(btrim(x->>'operacao'),''); cod := nullif(btrim(x->>'codigo'),'');
      CONTINUE WHEN n IS NULL;
      BEGIN
        SELECT id INTO v_proc FROM "APONTADOR DE PRODUÇÃO".processos WHERE (cod IS NOT NULL AND lower(btrim(codigo))=lower(cod)) OR lower(btrim(nome))=lower(n) LIMIT 1;
        IF v_proc IS NULL THEN INSERT INTO "APONTADOR DE PRODUÇÃO".processos(nome,codigo) VALUES (n,cod);
          c := jsonb_set(c,'{operacoes}',to_jsonb(coalesce((c->>'operacoes')::int,0)+1));
        ELSE c := jsonb_set(c,'{operacoes_existentes}',to_jsonb(coalesce((c->>'operacoes_existentes')::int,0)+1)); END IF;
      EXCEPTION WHEN OTHERS THEN av := av || to_jsonb(lin||': '||SQLERRM);
      END;
    END LOOP;

    -- ---------- Produtos ----------
    FOR x IN SELECT * FROM jsonb_array_elements(coalesce(p_dados->'produtos','[]')) LOOP
      lin := 'Produtos, linha '||coalesce(x->>'linha','?'); n := nullif(btrim(x->>'produto'),''); cod := nullif(btrim(x->>'codigo'),'');
      CONTINUE WHEN n IS NULL;
      BEGIN
        SELECT id INTO v_prod FROM "APONTADOR DE PRODUÇÃO".produtos WHERE (cod IS NOT NULL AND lower(btrim(codigo))=lower(cod)) OR lower(btrim(nome))=lower(n) LIMIT 1;
        IF v_prod IS NULL THEN INSERT INTO "APONTADOR DE PRODUÇÃO".produtos(nome,codigo) VALUES (n,cod);
          c := jsonb_set(c,'{produtos}',to_jsonb(coalesce((c->>'produtos')::int,0)+1));
        ELSE c := jsonb_set(c,'{produtos_existentes}',to_jsonb(coalesce((c->>'produtos_existentes')::int,0)+1)); END IF;
      EXCEPTION WHEN OTHERS THEN av := av || to_jsonb(lin||': '||SQLERRM);
      END;
    END LOOP;

    -- ---------- Roteiro (produto × operação × tempo) ----------
    FOR x IN SELECT * FROM jsonb_array_elements(coalesce(p_dados->'roteiro','[]')) LOOP
      lin := 'Roteiro, linha '||coalesce(x->>'linha','?');
      CONTINUE WHEN nullif(btrim(x->>'produto'),'') IS NULL AND nullif(btrim(x->>'operacao'),'') IS NULL;
      BEGIN
        IF nullif(btrim(x->>'produto'),'') IS NULL OR nullif(btrim(x->>'operacao'),'') IS NULL THEN RAISE EXCEPTION 'informe produto e operação'; END IF;
        v_t := nullif(replace(btrim(x->>'tempo'),',','.'),'')::numeric;
        IF v_t IS NULL OR v_t <= 0 THEN RAISE EXCEPTION 'tempo padrão (segundos) precisa ser maior que zero'; END IF;
        SELECT id INTO v_prod FROM "APONTADOR DE PRODUÇÃO".produtos WHERE lower(btrim(nome))=lower(btrim(x->>'produto')) OR lower(btrim(codigo))=lower(btrim(x->>'produto')) LIMIT 1;
        IF v_prod IS NULL THEN INSERT INTO "APONTADOR DE PRODUÇÃO".produtos(nome) VALUES (btrim(x->>'produto')) RETURNING id INTO v_prod;
          c := jsonb_set(c,'{produtos}',to_jsonb(coalesce((c->>'produtos')::int,0)+1)); END IF;
        SELECT id INTO v_proc FROM "APONTADOR DE PRODUÇÃO".processos WHERE lower(btrim(nome))=lower(btrim(x->>'operacao')) OR lower(btrim(codigo))=lower(btrim(x->>'operacao')) LIMIT 1;
        IF v_proc IS NULL THEN INSERT INTO "APONTADOR DE PRODUÇÃO".processos(nome) VALUES (btrim(x->>'operacao')) RETURNING id INTO v_proc;
          c := jsonb_set(c,'{operacoes}',to_jsonb(coalesce((c->>'operacoes')::int,0)+1)); END IF;
        v_et := nullif(btrim(x->>'etapa'),'')::numeric::int;
        IF v_et IS NULL THEN
          SELECT pp.etapa INTO v_et FROM "APONTADOR DE PRODUÇÃO".produto_processos pp WHERE pp.produto_id=v_prod AND pp.processo_id=v_proc ORDER BY pp.etapa LIMIT 1;
          IF v_et IS NULL THEN SELECT coalesce(max(etapa),0)+1 INTO v_et FROM "APONTADOR DE PRODUÇÃO".produto_processos WHERE produto_id=v_prod; END IF;
        END IF;
        SELECT id INTO v_pp FROM "APONTADOR DE PRODUÇÃO".produto_processos WHERE produto_id=v_prod AND processo_id=v_proc AND etapa=v_et;
        IF v_pp IS NULL THEN
          INSERT INTO "APONTADOR DE PRODUÇÃO".produto_processos(produto_id,processo_id,etapa,tempo_padrao_segundos) VALUES (v_prod,v_proc,v_et,v_t) RETURNING id INTO v_pp;
          c := jsonb_set(c,'{roteiro}',to_jsonb(coalesce((c->>'roteiro')::int,0)+1));
        ELSE
          c := jsonb_set(c,'{roteiro_existentes}',to_jsonb(coalesce((c->>'roteiro_existentes')::int,0)+1));
          IF (SELECT tempo_padrao_segundos FROM "APONTADOR DE PRODUÇÃO".produto_processos WHERE id=v_pp) <> v_t THEN
            av := av || to_jsonb(lin||': já existia com outro tempo padrão; o tempo do sistema foi mantido (altere em Produtos → Tempos por produto).');
          END IF;
        END IF;
        IF lower(left(btrim(coalesce(x->>'final','')),1)) IN ('s','y','x','1','v')
           AND NOT EXISTS (SELECT 1 FROM "APONTADOR DE PRODUÇÃO".produto_processos WHERE produto_id=v_prod AND etapa_final) THEN
          UPDATE "APONTADOR DE PRODUÇÃO".produto_processos SET etapa_final=true WHERE id=v_pp;
          c := jsonb_set(c,'{finais}',to_jsonb(coalesce((c->>'finais')::int,0)+1));
        END IF;
      EXCEPTION WHEN OTHERS THEN av := av || to_jsonb(lin||': '||SQLERRM);
      END;
    END LOOP;

    -- ---------- Funcionários ----------
    FOR x IN SELECT * FROM jsonb_array_elements(coalesce(p_dados->'funcionarios','[]')) LOOP
      lin := 'Funcionários, linha '||coalesce(x->>'linha','?'); n := nullif(btrim(x->>'nome'),''); mat := nullif(btrim(x->>'matricula'),'');
      CONTINUE WHEN n IS NULL;
      BEGIN
        SELECT id INTO v_func FROM "APONTADOR DE PRODUÇÃO".funcionarios WHERE (mat IS NOT NULL AND lower(btrim(matricula))=lower(mat)) OR (mat IS NULL AND lower(btrim(nome))=lower(n)) LIMIT 1;
        IF v_func IS NOT NULL THEN c := jsonb_set(c,'{funcionarios_existentes}',to_jsonb(coalesce((c->>'funcionarios_existentes')::int,0)+1)); CONTINUE; END IF;
        v_set := NULL; v_grp := NULL;
        IF nullif(btrim(x->>'setor'),'') IS NOT NULL THEN
          SELECT id INTO v_set FROM "APONTADOR DE PRODUÇÃO".setores WHERE lower(btrim(nome))=lower(btrim(x->>'setor'));
          IF v_set IS NULL THEN INSERT INTO "APONTADOR DE PRODUÇÃO".setores(nome) VALUES (btrim(x->>'setor')) RETURNING id INTO v_set;
            c := jsonb_set(c,'{setores}',to_jsonb(coalesce((c->>'setores')::int,0)+1)); END IF;
        END IF;
        IF nullif(btrim(x->>'grupo'),'') IS NOT NULL THEN
          IF v_set IS NULL THEN RAISE EXCEPTION 'para informar o grupo, informe também o setor'; END IF;
          SELECT id INTO v_grp FROM "APONTADOR DE PRODUÇÃO".grupos WHERE setor_id=v_set AND lower(btrim(nome))=lower(btrim(x->>'grupo'));
          IF v_grp IS NULL THEN INSERT INTO "APONTADOR DE PRODUÇÃO".grupos(setor_id,nome) VALUES (v_set,btrim(x->>'grupo')) RETURNING id INTO v_grp;
            c := jsonb_set(c,'{grupos}',to_jsonb(coalesce((c->>'grupos')::int,0)+1)); END IF;
        END IF;
        INSERT INTO "APONTADOR DE PRODUÇÃO".funcionarios(nome,matricula,setor_id,grupo_id,data_admissao)
        VALUES (n, mat, v_set, v_grp, nullif(btrim(x->>'admissao'),'')::date);
        c := jsonb_set(c,'{funcionarios}',to_jsonb(coalesce((c->>'funcionarios')::int,0)+1));
      EXCEPTION WHEN OTHERS THEN av := av || to_jsonb(lin||': '||SQLERRM);
      END;
    END LOOP;

    -- ---------- Operações que cada funcionário sabe fazer ----------
    FOR x IN SELECT * FROM jsonb_array_elements(coalesce(p_dados->'habilidades','[]')) LOOP
      lin := 'Operações por funcionário, linha '||coalesce(x->>'linha','?');
      CONTINUE WHEN nullif(btrim(x->>'funcionario'),'') IS NULL;
      BEGIN
        SELECT id INTO v_func FROM "APONTADOR DE PRODUÇÃO".funcionarios
         WHERE lower(btrim(matricula))=lower(btrim(x->>'funcionario')) OR lower(btrim(nome))=lower(btrim(x->>'funcionario')) ORDER BY (lower(btrim(matricula))=lower(btrim(x->>'funcionario'))) DESC NULLS LAST LIMIT 1;
        IF v_func IS NULL THEN RAISE EXCEPTION 'funcionário "%" não encontrado', x->>'funcionario'; END IF;
        SELECT pp.id INTO v_pp FROM "APONTADOR DE PRODUÇÃO".produto_processos pp
          JOIN "APONTADOR DE PRODUÇÃO".produtos p ON p.id=pp.produto_id JOIN "APONTADOR DE PRODUÇÃO".processos o ON o.id=pp.processo_id
         WHERE pp.ativo AND (lower(btrim(p.nome))=lower(btrim(x->>'produto')) OR lower(btrim(p.codigo))=lower(btrim(x->>'produto')))
           AND (lower(btrim(o.nome))=lower(btrim(x->>'operacao')) OR lower(btrim(o.codigo))=lower(btrim(x->>'operacao')))
         ORDER BY pp.etapa LIMIT 1;
        IF v_pp IS NULL THEN RAISE EXCEPTION 'a operação "%" não está no roteiro do produto "%"', x->>'operacao', x->>'produto'; END IF;
        INSERT INTO "APONTADOR DE PRODUÇÃO".funcionario_operacoes(funcionario_id,produto_processo_id) VALUES (v_func,v_pp) ON CONFLICT DO NOTHING;
        IF FOUND THEN c := jsonb_set(c,'{habilidades}',to_jsonb(coalesce((c->>'habilidades')::int,0)+1));
        ELSE c := jsonb_set(c,'{habilidades_existentes}',to_jsonb(coalesce((c->>'habilidades_existentes')::int,0)+1)); END IF;
      EXCEPTION WHEN OTHERS THEN av := av || to_jsonb(lin||': '||SQLERRM);
      END;
    END LOOP;

    v_res := jsonb_build_object('contagem', c, 'avisos', av, 'simulado', coalesce((p_dados->>'simular')::boolean,false));
    IF coalesce((p_dados->>'simular')::boolean,false) THEN
      RAISE EXCEPTION USING ERRCODE='P0099', MESSAGE=v_res::text;  -- desfaz tudo, só devolve a prévia
    END IF;
  EXCEPTION WHEN SQLSTATE 'P0099' THEN v_res := SQLERRM::jsonb;
  END;
  RETURN v_res;
END $$;
REVOKE ALL ON FUNCTION public.apontador_importar(jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.apontador_importar(jsonb) TO authenticated;
