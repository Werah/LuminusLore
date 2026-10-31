-- =====================================================================
-- LuminusLore - estrutura do banco no Supabase
-- Cole tudo no "SQL Editor" do Supabase e clique em "Run".
-- Pode rodar de novo sem problema (não apaga dados).
-- =====================================================================

-- ---------- Membros ----------

-- Quem pode ler e escrever no site. Cada amigo tem o próprio login
-- (Authentication → Users) e precisa estar nesta lista com o mesmo e-mail.
-- Para liberar alguém, rode no SQL Editor:
--   insert into public.membros (email, nome) values ('amigo@email.com', 'Nome que aparece no site');
create table if not exists public.membros (
  email text primary key,
  nome  text not null check (length(trim(nome)) > 0)
);

-- E-mail de quem está logado (em minúsculas)
-- ("set search_path" em todas as funções: assim ninguém consegue trocar as tabelas que elas usam)
create or replace function public.email_atual()
returns text
language sql stable
set search_path = public
as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''))
$$;

-- Nome de um membro pelo e-mail ('' se não for membro). Usado para guardar o nome de quem
-- escreveu junto com o texto (o visitante vê o nome, nunca o e-mail).
create or replace function public.nome_de(email_procurado text)
returns text
language sql stable
security definer set search_path = public
as $$
  select coalesce((select nome from public.membros where lower(email) = lower(email_procurado)), '')
$$;

-- "security definer" para conseguir olhar a tabela membros mesmo com as regras de segurança dela
create or replace function public.eh_membro()
returns boolean
language sql stable
security definer set search_path = public
as $$
  select exists (select 1 from public.membros where lower(email) = public.email_atual())
$$;

-- ---------- Textos ----------

-- Um texto de qualquer seção. Os campos extras de cada seção (categoria, domínios, sede...)
-- ficam em "detalhes" e são definidos em js/secoes.js.
create table if not exists public.artigos (
  id            text primary key default gen_random_uuid()::text,
  secao         text not null check (secao in ('mundo', 'historia', 'personagens', 'panteao', 'organizacoes')),
  titulo        text not null check (length(trim(titulo)) > 0),
  subtitulo     text not null default '',
  conteudo      text not null default '',
  detalhes      jsonb not null default '{}'::jsonb,
  imagem        text not null default '',
  criado_por    text not null default '',
  criado_em     timestamptz not null default now(),
  editado_por   text not null default '',
  atualizado_em timestamptz not null default now()
);

-- Ponto no mapa (waypoint). Posição em fração da imagem: 0 = esquerda/topo, 1 = direita/base.
-- Vazio = o texto não está no mapa. ("add column if not exists" para quem já tinha rodado este arquivo)
alter table public.artigos add column if not exists mapa_x double precision check (mapa_x between 0 and 1);
alter table public.artigos add column if not exists mapa_y double precision check (mapa_y between 0 and 1);
-- Aparência do ponto: cor (#rrggbb; vazio = cor da seção) e ícone (nomes em js/mapa.js; vazio = só o ponto)
alter table public.artigos add column if not exists mapa_cor text not null default ''
  check (mapa_cor = '' or mapa_cor ~ '^#[0-9a-fA-F]{6}$');
alter table public.artigos add column if not exists mapa_icone text not null default ''
  check (mapa_icone ~ '^[a-z]{0,20}$');

-- País a que o texto pertence (país = texto com ponto de estrela no mapa). Vazio = região neutra.
-- Excluir o país só solta os textos dele.
alter table public.artigos add column if not exists pais_id text references public.artigos(id) on delete set null;
alter table public.artigos drop constraint if exists artigos_pais_nao_e_ele_mesmo;
alter table public.artigos add constraint artigos_pais_nao_e_ele_mesmo check (pais_id is null or pais_id <> id);
create index if not exists artigos_pais on public.artigos (pais_id);

-- Posição da imagem (em %): qual parte dela fica à vista nos quadros do site (cards, capa, retrato...).
-- 50/50 = centro. Escolhida arrastando a imagem no popup ao escolher a imagem.
alter table public.artigos add column if not exists imagem_x real not null default 50 check (imagem_x between 0 and 100);
alter table public.artigos add column if not exists imagem_y real not null default 50 check (imagem_y between 0 and 100);
-- Imagens além da principal (a principal é "imagem"): lista de { "arquivo", "x", "y" }.
-- Com mais de uma, os cards e a página mostram um carrossel.
alter table public.artigos add column if not exists imagens_extras jsonb not null default '[]'::jsonb
  check (jsonb_typeof(imagens_extras) = 'array');

-- Líder (personagem) de um país, cidade, vila ou organização: o cargo fica guardado no lugar,
-- e a ficha do personagem mostra "Líder de" procurando quem aponta para ele.
-- Excluir o personagem só deixa o cargo vago.
alter table public.artigos add column if not exists lider_id text references public.artigos(id) on delete set null;
alter table public.artigos drop constraint if exists artigos_lider_nao_e_ele_mesmo;
alter table public.artigos add constraint artigos_lider_nao_e_ele_mesmo check (lider_id is null or lider_id <> id);
create index if not exists artigos_lider on public.artigos (lider_id);

-- Capital (uma cidade ou vilarejo do país): fica guardada no país, e a página da cidade mostra
-- "Capital de" procurando quem aponta para ela. Excluir a cidade deixa o país sem capital.
alter table public.artigos add column if not exists capital_id text references public.artigos(id) on delete set null;
alter table public.artigos drop constraint if exists artigos_capital_nao_e_ele_mesmo;
alter table public.artigos add constraint artigos_capital_nao_e_ele_mesmo check (capital_id is null or capital_id <> id);
create index if not exists artigos_capital on public.artigos (capital_id);

-- Organização de que um personagem é membro: fica guardada no personagem, e a aba "Membros" da
-- organização procura quem aponta para ela. Excluir a organização só deixa o personagem sem.
alter table public.artigos add column if not exists organizacao_id text references public.artigos(id) on delete set null;
alter table public.artigos drop constraint if exists artigos_organizacao_nao_e_ele_mesmo;
alter table public.artigos add constraint artigos_organizacao_nao_e_ele_mesmo check (organizacao_id is null or organizacao_id <> id);
create index if not exists artigos_organizacao on public.artigos (organizacao_id);

-- Seções que existem (as mesmas de js/secoes.js). Refeita aqui para quem já tinha rodado
-- este arquivo antes de existirem História e Personagens.
alter table public.artigos drop constraint if exists artigos_secao_check;
alter table public.artigos add constraint artigos_secao_check
  check (secao in ('mundo', 'historia', 'personagens', 'panteao', 'organizacoes'));

-- Título não se repete (é por ele que os links [[Título]] encontram o texto), com uma exceção:
-- um país (ponto de estrela) pode ter o mesmo nome de um outro texto, como a capital dele.
-- Nos links: [[Azraq]] é o outro texto e [[Azraq (país)]] é o país.
drop index if exists public.artigos_titulo;
create unique index if not exists artigos_titulo_pais on public.artigos (lower(titulo), (mapa_icone = 'estrela'));
create index if not exists artigos_secao on public.artigos (secao, titulo);

-- Versões anteriores de cada texto (guardadas sozinhas a cada edição).
-- O histórico nunca é apagado: nem quando o texto é excluído (ver "Regras" abaixo).
create table if not exists public.revisoes (
  id          bigint generated always as identity primary key,
  artigo_id   text not null,
  titulo      text not null,
  subtitulo   text not null default '',
  conteudo    text not null default '',
  detalhes    jsonb not null default '{}'::jsonb,
  editado_por text not null default '',
  editado_em  timestamptz not null
);

-- Antes o histórico era apagado junto com o texto; agora fica (para quem já tinha rodado este arquivo)
alter table public.revisoes drop constraint if exists revisoes_artigo_id_fkey;

-- Cópia feita na hora de excluir um texto: "linha" guarda o texto inteiro (seção, imagem, ponto
-- no mapa...), para dar para restaurar depois em "Textos excluídos"
alter table public.revisoes add column if not exists excluido     boolean not null default false;
alter table public.revisoes add column if not exists excluido_por text not null default '';
alter table public.revisoes add column if not exists excluido_em  timestamptz;
alter table public.revisoes add column if not exists linha        jsonb;

-- Nome de quem escreveu/editou/excluiu, guardado junto com o e-mail (o banco preenche).
-- É o que o visitante vê: ele não tem acesso às colunas de e-mail.
alter table public.artigos  add column if not exists criado_por_nome   text not null default '';
alter table public.artigos  add column if not exists editado_por_nome  text not null default '';
alter table public.revisoes add column if not exists editado_por_nome  text not null default '';
alter table public.revisoes add column if not exists excluido_por_nome text not null default '';

create index if not exists revisoes_artigo on public.revisoes (artigo_id, editado_em desc);
create index if not exists revisoes_excluidos on public.revisoes (excluido_em desc) where excluido;

-- ---------- Regras ----------

-- Quem criou / editou e quando: o banco preenche, o navegador não consegue mudar.
-- Só conta como edição mudar o texto ou o país; mexer só na imagem ou no ponto do mapa não muda
-- "atualizado_em" (assim marcar o mapa com o editor aberto não dá aviso de conflito).
-- Os nomes (criado_por_nome, editado_por_nome) acompanham: são atualizados com o nome atual do membro
-- (se ele não for mais membro, fica o nome que já estava).
create or replace function public.carimbar_artigo()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.criado_por := public.email_atual();
    new.criado_em := now();
    new.criado_por_nome := public.nome_de(new.criado_por);
  else
    new.criado_por := old.criado_por;
    new.criado_em := old.criado_em;
    new.criado_por_nome := coalesce(nullif(public.nome_de(old.criado_por), ''), old.criado_por_nome);
    if (old.secao, old.titulo, old.subtitulo, old.conteudo, old.detalhes, old.pais_id, old.organizacao_id)
       is not distinct from (new.secao, new.titulo, new.subtitulo, new.conteudo, new.detalhes, new.pais_id, new.organizacao_id) then
      new.editado_por := old.editado_por;
      new.atualizado_em := old.atualizado_em;
      new.editado_por_nome := coalesce(nullif(public.nome_de(old.editado_por), ''), old.editado_por_nome);
      return new;
    end if;
  end if;
  new.editado_por := public.email_atual();
  new.atualizado_em := now();
  new.editado_por_nome := public.nome_de(new.editado_por);
  return new;
end
$$;

drop trigger if exists carimbar_artigo on public.artigos;
create trigger carimbar_artigo
  before insert or update on public.artigos
  for each row execute function public.carimbar_artigo();

-- Quando o texto muda, guarda a versão anterior no histórico
create or replace function public.guardar_revisao()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if (old.titulo, old.subtitulo, old.conteudo, old.detalhes)
     is distinct from (new.titulo, new.subtitulo, new.conteudo, new.detalhes) then
    insert into public.revisoes (artigo_id, titulo, subtitulo, conteudo, detalhes, editado_por, editado_em,
                                 editado_por_nome)
    values (old.id, old.titulo, old.subtitulo, old.conteudo, old.detalhes, old.editado_por, old.atualizado_em,
            old.editado_por_nome);
  end if;
  return new;
end
$$;

drop trigger if exists guardar_revisao on public.artigos;
create trigger guardar_revisao
  after update on public.artigos
  for each row execute function public.guardar_revisao();

-- Cidade que muda de país (ou fica sem país) deixa de ser a capital do país antigo
create or replace function public.soltar_capital()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update public.artigos set capital_id = null
  where capital_id = new.id and id is distinct from new.pais_id;
  return new;
end
$$;

drop trigger if exists soltar_capital on public.artigos;
create trigger soltar_capital
  after update of pais_id on public.artigos
  for each row when (old.pais_id is distinct from new.pais_id)
  execute function public.soltar_capital();

-- Ao excluir um texto, guarda uma cópia completa dele no histórico (dá para restaurar depois)
create or replace function public.guardar_exclusao()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.revisoes (artigo_id, titulo, subtitulo, conteudo, detalhes, editado_por, editado_em,
                               excluido, excluido_por, excluido_em, linha, editado_por_nome, excluido_por_nome)
  values (old.id, old.titulo, old.subtitulo, old.conteudo, old.detalhes, old.editado_por, old.atualizado_em,
          true, public.email_atual(), now(), to_jsonb(old), old.editado_por_nome, public.nome_de(public.email_atual()));
  return old;
end
$$;

drop trigger if exists guardar_exclusao on public.artigos;
create trigger guardar_exclusao
  before delete on public.artigos
  for each row execute function public.guardar_exclusao();

-- O histórico não pode ser alterado nem apagado, por ninguém (nem pelo SQL Editor, a não ser
-- que alguém desligue esta regra de propósito). A única mudança aceita é atualizar o NOME de quem
-- editou/excluiu (editado_por_nome, excluido_por_nome), feita por este arquivo; o conteúdo, nunca.
create or replace function public.proteger_historico()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and to_jsonb(new) - 'editado_por_nome' - 'excluido_por_nome' = to_jsonb(old) - 'editado_por_nome' - 'excluido_por_nome' then
    return new;
  end if;
  raise exception 'O histórico não pode ser alterado nem apagado.';
end
$$;

drop trigger if exists proteger_historico on public.revisoes;
create trigger proteger_historico
  before update or delete on public.revisoes
  for each row execute function public.proteger_historico();

drop trigger if exists proteger_historico_truncate on public.revisoes;
create trigger proteger_historico_truncate
  before truncate on public.revisoes
  for each statement execute function public.proteger_historico();

-- Restaura um texto excluído a partir da cópia guardada na exclusão (mesmo id, então o
-- histórico antigo dele volta junto). O país só volta se ainda existir.
create or replace function public.restaurar_texto(revisao bigint)
returns text
language plpgsql
set search_path = public
as $$
declare
  l jsonb;
begin
  select linha into l from public.revisoes where id = revisao and excluido;
  if l is null then
    raise exception 'Não achei a cópia desse texto excluído.';
  end if;
  if exists (select 1 from public.artigos where id = l->>'id') then
    raise exception 'Esse texto já foi restaurado.';
  end if;
  insert into public.artigos (id, secao, titulo, subtitulo, conteudo, detalhes, imagem, pais_id, lider_id, capital_id, organizacao_id,
                              mapa_x, mapa_y, mapa_cor, mapa_icone, imagem_x, imagem_y, imagens_extras)
  values (
    l->>'id', l->>'secao', l->>'titulo',
    coalesce(l->>'subtitulo', ''), coalesce(l->>'conteudo', ''), coalesce(l->'detalhes', '{}'::jsonb),
    coalesce(l->>'imagem', ''),
    (select id from public.artigos where id = l->>'pais_id'),
    (select id from public.artigos where id = l->>'lider_id'),
    (select id from public.artigos where id = l->>'capital_id' and pais_id = l->>'id'),
    (select id from public.artigos where id = l->>'organizacao_id'),
    (l->>'mapa_x')::double precision, (l->>'mapa_y')::double precision,
    coalesce(l->>'mapa_cor', ''), coalesce(l->>'mapa_icone', ''),
    coalesce((l->>'imagem_x')::real, 50), coalesce((l->>'imagem_y')::real, 50),
    coalesce(l->'imagens_extras', '[]'::jsonb)
  );
  return l->>'id';
end
$$;

-- ---------- Segurança (Row Level Security) ----------

alter table public.membros  enable row level security;
alter table public.artigos  enable row level security;
alter table public.revisoes enable row level security;

drop policy if exists membros on public.membros;
drop policy if exists membros on public.artigos;
drop policy if exists membros on public.revisoes;

-- Membros veem a lista de membros (para mostrar os nomes); só o painel do Supabase altera
create policy membros on public.membros  for select to authenticated using (public.eh_membro());
-- Membros leem, criam, editam e excluem textos
create policy membros on public.artigos  for all    to authenticated using (public.eh_membro()) with check (public.eh_membro());
-- Histórico só é lido pelo site; quem grava é a regra guardar_revisao
create policy membros on public.revisoes for select to authenticated using (public.eh_membro());

grant select on public.membros, public.revisoes to authenticated;
grant select, insert, update, delete on public.artigos to authenticated;
revoke all on public.membros, public.artigos, public.revisoes from anon;
revoke execute on function public.eh_membro() from anon, public;
grant execute on function public.eh_membro() to authenticated;
-- restaurar_texto roda com a permissão de quem chama: só membros conseguem (regras acima)
grant execute on function public.restaurar_texto(bigint) to authenticated;
revoke execute on function public.restaurar_texto(bigint) from anon, public;
-- nome_de é usado pelas regras quando um membro salva; visitante não chama
revoke execute on function public.nome_de(text) from anon, public;
grant execute on function public.nome_de(text) to authenticated;

-- ---------- Visitantes (só leitura, sem conta) ----------

-- O botão "Entrar como visitante" usa a chave pública, sem login. O visitante:
--   * só pode LER, e só as colunas abaixo (nada de e-mail: criado_por, editado_por, excluido_por
--     e a cópia "linha" ficam de fora; no lugar ele vê os nomes, *_nome);
--   * não pode criar, editar nem excluir nada (não tem essas permissões);
--   * não vê a lista de membros.
drop policy if exists visitantes on public.artigos;
drop policy if exists visitantes on public.revisoes;
create policy visitantes on public.artigos  for select to anon using (true);
create policy visitantes on public.revisoes for select to anon using (true);

grant select (id, secao, titulo, subtitulo, conteudo, detalhes, imagem, criado_em, atualizado_em,
              mapa_x, mapa_y, mapa_cor, mapa_icone, pais_id, lider_id, capital_id, organizacao_id, imagem_x, imagem_y, imagens_extras,
              criado_por_nome, editado_por_nome)
  on public.artigos to anon;
grant select (id, artigo_id, titulo, subtitulo, conteudo, detalhes, editado_em, excluido, excluido_em,
              editado_por_nome, excluido_por_nome)
  on public.revisoes to anon;

-- "Vitrines" que o site usa para o visitante: as mesmas colunas das tabelas, com o nome no lugar
-- do e-mail (assim o site lê igual). "security_invoker": rodam com as permissões de quem consulta
-- (o visitante), então só enxergam o que ele já pode enxergar pelas regras acima.
create or replace view public.artigos_publico with (security_invoker = true) as
select
  a.id, a.secao, a.titulo, a.subtitulo, a.conteudo, a.detalhes, a.imagem,
  a.criado_por_nome as criado_por,
  a.criado_em,
  a.editado_por_nome as editado_por,
  a.atualizado_em, a.mapa_x, a.mapa_y, a.mapa_cor, a.mapa_icone, a.pais_id, a.lider_id,
  a.imagem_x, a.imagem_y, a.imagens_extras, a.capital_id, a.organizacao_id
from public.artigos a;

create or replace view public.revisoes_publico with (security_invoker = true) as
select
  r.id, r.artigo_id, r.titulo, r.subtitulo, r.conteudo, r.detalhes,
  r.editado_por_nome as editado_por,
  r.editado_em, r.excluido,
  r.excluido_por_nome as excluido_por,
  r.excluido_em
from public.revisoes r;

revoke all on public.artigos_publico, public.revisoes_publico from anon, authenticated;
grant select on public.artigos_publico, public.revisoes_publico to anon, authenticated;

-- Preenche (ou atualiza, se o membro mudou de nome) os nomes dos textos e do histórico que já
-- existiam. Só mexe nas colunas de nome; não conta como edição nem cria versão no histórico.
update public.artigos set titulo = titulo
where (public.nome_de(criado_por) <> '' and criado_por_nome <> public.nome_de(criado_por))
   or (public.nome_de(editado_por) <> '' and editado_por_nome <> public.nome_de(editado_por));

update public.revisoes set editado_por_nome = public.nome_de(editado_por)
where public.nome_de(editado_por) <> '' and editado_por_nome <> public.nome_de(editado_por);

update public.revisoes set excluido_por_nome = public.nome_de(excluido_por)
where public.nome_de(excluido_por) <> '' and excluido_por_nome <> public.nome_de(excluido_por);

-- ---------- Imagens (Storage) ----------

-- Bucket público: qualquer um com o link exato vê a imagem; só membros enviam e apagam
insert into storage.buckets (id, name, public)
values ('imagens', 'imagens', true)
on conflict (id) do nothing;

drop policy if exists "membros leem imagens" on storage.objects;
drop policy if exists "membros enviam imagens" on storage.objects;
drop policy if exists "membros apagam imagens" on storage.objects;

create policy "membros leem imagens" on storage.objects
  for select to authenticated using (bucket_id = 'imagens' and public.eh_membro());
create policy "membros enviam imagens" on storage.objects
  for insert to authenticated with check (bucket_id = 'imagens' and public.eh_membro());
create policy "membros apagam imagens" on storage.objects
  for delete to authenticated using (bucket_id = 'imagens' and public.eh_membro());

-- ---------- Manter o projeto acordado ----------

-- Função simples chamada pelo GitHub Actions a cada poucos dias,
-- para o plano grátis do Supabase não pausar o projeto por falta de uso.
create or replace function public.ping()
returns text
language sql stable
set search_path = public
as $$ select 'pong'::text $$;

grant execute on function public.ping() to anon;
