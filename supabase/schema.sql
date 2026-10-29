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
create or replace function public.email_atual()
returns text
language sql stable
as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''))
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

-- Seções que existem (as mesmas de js/secoes.js). Refeita aqui para quem já tinha rodado
-- este arquivo antes de existirem História e Personagens.
alter table public.artigos drop constraint if exists artigos_secao_check;
alter table public.artigos add constraint artigos_secao_check
  check (secao in ('mundo', 'historia', 'personagens', 'panteao', 'organizacoes'));

-- Título não se repete (é por ele que os links [[Título]] encontram o texto)
create unique index if not exists artigos_titulo on public.artigos (lower(titulo));
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

create index if not exists revisoes_artigo on public.revisoes (artigo_id, editado_em desc);
create index if not exists revisoes_excluidos on public.revisoes (excluido_em desc) where excluido;

-- ---------- Regras ----------

-- Quem criou / editou e quando: o banco preenche, o navegador não consegue mudar.
-- Só conta como edição mudar o texto ou o país; mexer só na imagem ou no ponto do mapa não muda
-- "atualizado_em" (assim marcar o mapa com o editor aberto não dá aviso de conflito).
create or replace function public.carimbar_artigo()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.criado_por := public.email_atual();
    new.criado_em := now();
  else
    new.criado_por := old.criado_por;
    new.criado_em := old.criado_em;
    if (old.secao, old.titulo, old.subtitulo, old.conteudo, old.detalhes, old.pais_id)
       is not distinct from (new.secao, new.titulo, new.subtitulo, new.conteudo, new.detalhes, new.pais_id) then
      new.editado_por := old.editado_por;
      new.atualizado_em := old.atualizado_em;
      return new;
    end if;
  end if;
  new.editado_por := public.email_atual();
  new.atualizado_em := now();
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
    insert into public.revisoes (artigo_id, titulo, subtitulo, conteudo, detalhes, editado_por, editado_em)
    values (old.id, old.titulo, old.subtitulo, old.conteudo, old.detalhes, old.editado_por, old.atualizado_em);
  end if;
  return new;
end
$$;

drop trigger if exists guardar_revisao on public.artigos;
create trigger guardar_revisao
  after update on public.artigos
  for each row execute function public.guardar_revisao();

-- Ao excluir um texto, guarda uma cópia completa dele no histórico (dá para restaurar depois)
create or replace function public.guardar_exclusao()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.revisoes (artigo_id, titulo, subtitulo, conteudo, detalhes, editado_por, editado_em,
                               excluido, excluido_por, excluido_em, linha)
  values (old.id, old.titulo, old.subtitulo, old.conteudo, old.detalhes, old.editado_por, old.atualizado_em,
          true, public.email_atual(), now(), to_jsonb(old));
  return old;
end
$$;

drop trigger if exists guardar_exclusao on public.artigos;
create trigger guardar_exclusao
  before delete on public.artigos
  for each row execute function public.guardar_exclusao();

-- O histórico não pode ser alterado nem apagado, por ninguém (nem pelo SQL Editor, a não ser
-- que alguém desligue esta regra de propósito)
create or replace function public.proteger_historico()
returns trigger
language plpgsql
as $$
begin
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
  insert into public.artigos (id, secao, titulo, subtitulo, conteudo, detalhes, imagem, pais_id,
                              mapa_x, mapa_y, mapa_cor, mapa_icone)
  values (
    l->>'id', l->>'secao', l->>'titulo',
    coalesce(l->>'subtitulo', ''), coalesce(l->>'conteudo', ''), coalesce(l->'detalhes', '{}'::jsonb),
    coalesce(l->>'imagem', ''),
    (select id from public.artigos where id = l->>'pais_id'),
    (l->>'mapa_x')::double precision, (l->>'mapa_y')::double precision,
    coalesce(l->>'mapa_cor', ''), coalesce(l->>'mapa_icone', '')
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
grant execute on function public.eh_membro() to authenticated;
-- restaurar_texto roda com a permissão de quem chama: só membros conseguem (regras acima)
grant execute on function public.restaurar_texto(bigint) to authenticated;
revoke execute on function public.restaurar_texto(bigint) from anon, public;

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
as $$ select 'pong'::text $$;

grant execute on function public.ping() to anon;
