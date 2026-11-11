-- Empresa da plataforma (FACSIM): os administradores dela gerenciam todas as empresas.
-- Limite de acessos por empresa, definido pela plataforma e garantido no banco.
ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS plataforma boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS limite_usuarios integer CHECK (limite_usuarios IS NULL OR limite_usuarios >= 1);
UPDATE public.empresas SET plataforma = true WHERE lower(nome) = 'facsim';

-- Gestor da plataforma = dono OU administrador ativo de uma empresa da plataforma
CREATE OR REPLACE FUNCTION public.apontador_dono_plataforma() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
  SELECT (SELECT auth.uid()) IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.apontador_acessos a JOIN public.empresas e ON e.id = a.empresa_id AND e.ativo
     WHERE a.ativo AND a.email = lower((SELECT auth.jwt()->>'email'))
       AND (a.dono_plataforma OR (e.plataforma AND a.perfil = 'admin')))
$$;

-- Limite de acessos ativos por empresa (vale para a tela, a Edge Function e qualquer outra via)
CREATE OR REPLACE FUNCTION public.apontador_validar_limite_acessos() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE v_lim int; v_usados int;
BEGIN
  IF NOT NEW.ativo THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.ativo AND OLD.empresa_id = NEW.empresa_id THEN RETURN NEW; END IF;
  SELECT limite_usuarios INTO v_lim FROM public.empresas WHERE id = NEW.empresa_id;
  IF v_lim IS NULL THEN RETURN NEW; END IF;
  SELECT count(*) INTO v_usados FROM public.apontador_acessos WHERE empresa_id = NEW.empresa_id AND ativo AND email <> NEW.email;
  IF v_usados >= v_lim THEN
    RAISE EXCEPTION 'Limite de % acesso(s) desta empresa atingido. Bloqueie um usuário ou peça para a FACSIM ampliar o limite.', v_lim USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_limite_acessos ON public.apontador_acessos;
CREATE TRIGGER trg_limite_acessos BEFORE INSERT OR UPDATE OF ativo, empresa_id ON public.apontador_acessos
  FOR EACH ROW EXECUTE FUNCTION public.apontador_validar_limite_acessos();
REVOKE ALL ON FUNCTION public.apontador_validar_limite_acessos() FROM public, anon, authenticated;

-- Listagem passa a trazer limite e se a empresa é da plataforma
CREATE OR REPLACE FUNCTION public.apontador_acessos_listar() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $$
DECLARE v_dono boolean := public.apontador_dono_plataforma(); v_emp bigint := public.apontador_empresa_atual();
BEGIN
  IF NOT v_dono AND NOT public.apontador_eh_admin() THEN
    RAISE EXCEPTION 'Somente administradores podem gerenciar acessos.' USING ERRCODE='42501';
  END IF;
  RETURN jsonb_build_object('dono', v_dono, 'minhaEmpresa', v_emp::text, 'empresas', (
    SELECT coalesce(jsonb_agg(jsonb_build_object('id',e.id::text,'nome',e.nome,'documento',e.documento,'ativo',e.ativo,'criadaEm',e.created_at,
      'plataforma',e.plataforma,'limite',e.limite_usuarios,
      'ativos',(SELECT count(*) FROM public.apontador_acessos a WHERE a.empresa_id=e.id AND a.ativo),
      'funcionarios',(SELECT count(*) FROM "APONTADOR DE PRODUÇÃO".funcionarios f WHERE f.empresa_id=e.id),
      'lancamentos',(SELECT count(*) FROM "APONTADOR DE PRODUÇÃO"."Lançamentos" l WHERE l.empresa_id=e.id),
      'usuarios',(SELECT coalesce(jsonb_agg(jsonb_build_object('email',a.email,'nome',a.nome,'perfil',a.perfil,'ativo',a.ativo,'dono',a.dono_plataforma) ORDER BY a.perfil, a.email),'[]'::jsonb)
                  FROM public.apontador_acessos a WHERE a.empresa_id=e.id)) ORDER BY e.plataforma DESC, e.id),'[]'::jsonb)
      FROM public.empresas e WHERE v_dono OR e.id = v_emp));
END $$;

-- Empresa: criar / editar nome, CNPJ, limite e situação (somente gestores da plataforma)
CREATE OR REPLACE FUNCTION public.apontador_empresa_salvar(p_dados jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE v_id bigint := nullif(p_dados->>'id','')::bigint; v_lim int;
BEGIN
  IF NOT public.apontador_dono_plataforma() THEN RAISE EXCEPTION 'Somente a FACSIM gerencia empresas.' USING ERRCODE='42501'; END IF;
  IF p_dados ? 'limite' THEN
    v_lim := nullif(btrim(p_dados->>'limite'),'')::numeric::int;
    IF v_lim IS NOT NULL AND v_lim < 1 THEN RAISE EXCEPTION 'O limite de acessos precisa ser de pelo menos 1.'; END IF;
  END IF;
  IF v_id IS NULL THEN
    INSERT INTO public.empresas (nome, documento, limite_usuarios) VALUES (btrim(p_dados->>'nome'), nullif(btrim(p_dados->>'documento'),''), v_lim) RETURNING id INTO v_id;
    PERFORM public.apontador_empresa_semear(v_id);
  ELSE
    IF (SELECT plataforma FROM public.empresas WHERE id=v_id) AND (p_dados->>'ativo')::boolean IS FALSE THEN
      RAISE EXCEPTION 'A empresa da plataforma não pode ser bloqueada.';
    END IF;
    IF v_lim IS NOT NULL AND v_lim < (SELECT count(*) FROM public.apontador_acessos WHERE empresa_id=v_id AND ativo) THEN
      RAISE EXCEPTION 'A empresa já tem % acessos ativos. Bloqueie alguns antes de reduzir o limite para %.', (SELECT count(*) FROM public.apontador_acessos WHERE empresa_id=v_id AND ativo), v_lim;
    END IF;
    UPDATE public.empresas SET nome=coalesce(nullif(btrim(p_dados->>'nome'),''),nome),
           documento=CASE WHEN p_dados ? 'documento' THEN nullif(btrim(p_dados->>'documento'),'') ELSE documento END,
           limite_usuarios=CASE WHEN p_dados ? 'limite' THEN v_lim ELSE limite_usuarios END,
           ativo=coalesce((p_dados->>'ativo')::boolean, ativo)
     WHERE id=v_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Empresa não encontrada.'; END IF;
  END IF;
  RETURN jsonb_build_object('ok',true,'id',v_id::text);
END $$;
