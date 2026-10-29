# LuminusLore

Site para guardar os textos do cenário de fantasia e escrever junto com os amigos:
**Mundo**, **Panteão** e **Organizações**.

- **Páginas:** HTML, CSS e JavaScript puro, hospedadas de graça no **GitHub Pages**.
- **Dados, login e imagens:** no **Supabase** (Postgres na nuvem, plano grátis).

Não tem servidor próprio: o navegador conversa direto com o Supabase, e quem protege os dados
são as regras de segurança do banco (`supabase/schema.sql`).

## Estrutura

```
index.html                   login
home.html                    escolha da seção
mapa.html                    o Mundo: metade mapa, metade texto (js/mapa.js)
mundo.html, panteao.html,
organizacoes.html            lista de textos de cada seção (todas usam js/secao.js)
artigo.html                  ler, escrever, histórico de um texto
mapa/                        imagens do mapa (geradas por ferramentas/preparar_mapa.py)
css/style.css                visual
js/config.js                 URL e chave pública do Supabase
js/secoes.js                 as seções: nome, cor, ícone, categorias e campos da ficha
js/banco.js                  login e leitura/gravação no Supabase, imagens
js/api.js                    ajudantes de tela (topo, Markdown, links, campo de imagem)
supabase/schema.sql          tabelas, regras e segurança (rodar no Supabase)
.github/workflows/           tarefa que mantém o Supabase acordado
```

## Como colocar no ar (uma vez só)

### 1. Supabase

1. Entre em https://supabase.com e crie um **New project** só para o LuminusLore
   (região *South America (São Paulo)*; guarde a senha do banco que ele pedir).
   Não reaproveite o projeto do CampanhasFellas: os dois usam um bucket chamado `imagens`.
2. Vá em **SQL Editor → New query**, cole todo o conteúdo de `supabase/schema.sql` e clique em **Run**.
3. Vá em **Authentication → Sign In / Providers** e **desligue "Allow new users to sign up"**.
   Assim só você cria contas (o banco também bloqueia quem não estiver na lista de membros).
4. Vá em **Project Settings → API** (ou *API Keys*) e copie:
   - **Project URL**
   - a chave **anon public** (ou **publishable**). *Nunca* a `service_role` / `secret`.
5. Cole os dois em `js/config.js`.
6. Crie a sua conta seguindo **Adicionar um amigo** abaixo (com o seu e-mail).

### 2. GitHub Pages

1. Crie um repositório **público** no GitHub (ex.: `luminuslore`) e envie estes arquivos.
2. No repositório: **Settings → Pages → Build and deployment → Source: Deploy from a branch**,
   escolha `main` e `/ (root)` e clique em **Save**.
3. Em 1–2 minutos o site fica em `https://SEU-USUARIO.github.io/luminuslore/`.

Para atualizar o site depois, é só enviar as mudanças (`git push`).

## Adicionar um amigo

Cada pessoa tem o próprio login, e o site mostra quem criou e quem editou cada texto.

1. Supabase → **Authentication → Users → Add user → Create new user**
   - E-mail da pessoa e uma senha provisória
   - Marque **Auto Confirm User**
2. Supabase → **SQL Editor**, rode (com o mesmo e-mail):

   ```sql
   insert into public.membros (email, nome) values ('amigo@email.com', 'Nome que aparece no site');
   ```

3. Mande o link do site, o e-mail e a senha provisória. Na tela de login, a aba
   **Trocar senha** pede o e-mail, a senha provisória e a senha nova, e já entra no site.
   (Logado, dá para trocar de novo clicando no próprio nome, no topo.)

Para tirar alguém: `delete from public.membros where email = 'amigo@email.com';`
(e, se quiser, apague o usuário em Authentication → Users). Os textos que a pessoa escreveu continuam.

Para mudar o nome que aparece: `update public.membros set nome = 'Novo nome' where email = '...';`

## Escrevendo

- O texto aceita **Markdown**: `**negrito**`, `*itálico*`, `# Título`, `- lista`, `> citação`.
  O botão **Pré-visualizar** mostra como vai ficar.
- **Links entre textos:** `[[Nome do texto]]` ou `[[Nome do texto|texto que aparece]]`.
  Ao digitar `[[` aparece a lista de títulos para escolher (setas + Enter, ou clique); o botão
  **🔗 Link** do editor faz o mesmo.
  Link para um texto que ainda não existe aparece tracejado em vermelho; clicando nele dá para criar.
  Os campos da ficha (ex.: *Sede*, *Divindade ligada*) também aceitam links.
- No fim de cada texto aparece **Mencionado em**, com os textos que têm link para ele.
- Dois textos não podem ter o mesmo título (é por ele que os links acham o texto).
- **Histórico:** toda vez que alguém salva, a versão anterior fica guardada. Dá para ver e restaurar.
- Se duas pessoas editarem o mesmo texto ao mesmo tempo, quem salvar depois recebe um aviso
  em vez de apagar o que a outra escreveu.

## O mapa (Mundo)

A seção Mundo abre em `mapa.html`: o mapa à esquerda (roda do mouse dá zoom, arrastar move)
e o texto à direita. Arraste a barra do meio para mudar o tamanho de cada lado; as setas dela
(ou arrastar até a borda) escondem um lado inteiro, e duplo clique volta para metade/metade.
O navegador lembra a última divisão.

Se aparecer "O banco está desatualizado", rode `supabase/schema.sql` de novo no SQL Editor
(o site ganhou colunas novas e o banco ainda não tem).

- **Pontos:** cada texto pode ter um ponto no mapa. Clicar no ponto abre o texto ao lado.
- **Criar um verbete num lugar:** botão direito no mapa (toque longo no celular) → *Novo verbete aqui*.
- **Pôr no mapa um texto que já existe:** abra o texto e clique em *📍 Marcar no mapa* (barra embaixo
  do mapa), depois clique no lugar. A mesma barra tem *Mover ponto* e *Tirar do mapa*.
  Textos do Panteão e das Organizações também podem ter ponto (um templo, uma sede).
- **Cor e ícone do ponto:** botão *🎨 Cor e ícone* na barra (abre sozinho quando o texto ganha
  o primeiro ponto). Ícones: cidade, vila, castelo, caveira, floresta, espadas cruzadas, montanha,
  templo, porto e estrela (país). Sem cor escolhida, o ponto usa a cor do país ou, sem país, da seção. Para criar ícones novos,
  veja `ICONES_MAPA` em `js/mapa.js`.
- **Clicar fora dos pontos** solta o texto selecionado (o painel volta para a lista). Se o
  editor estiver aberto com mudanças, elas são salvas antes.
- **Países:** um ponto com o ícone de estrela é um país. Com o mapa afastado só aparecem os
  países; aproximando, eles somem e aparecem os outros pontos. Clicar num país aproxima até a
  área dele.
- **Pertencer a um país:** no editor de qualquer texto, o campo *País* lista os países
  (ou *Nenhum* para regiões neutras). O ponto herda a cor do país, a menos que tenha cor própria;
  trocar de país volta a usar a cor do país novo.
- **Links andam pelo mapa:** clicar num `[[link]]` dentro do texto abre o outro texto no painel
  e o mapa vai até o ponto dele.

### Trocar a imagem do mapa

A imagem original (`mapa/*.png`) é pesada demais para o site e não vai para o GitHub (está no
`.gitignore`). O site usa versões comprimidas, geradas assim:

```bash
python ferramentas/preparar_mapa.py "mapa/Artia Mapa Mundi.png"
```

Se a nova imagem tiver outro tamanho, atualize `largura` e `altura` em `js/secoes.js` (o script
mostra os valores). Os pontos são guardados em proporção da imagem, então continuam no lugar
se o mapa novo for o mesmo desenho em outra resolução.

## Mudar categorias e campos

Tudo fica em `js/secoes.js`: nome, cor e ícone de cada seção, as opções de categoria
(o primeiro campo com `opcoes` vira o filtro da página) e os campos da ficha.
Dá para adicionar ou tirar campos sem mexer no banco.

Para criar uma **seção nova**, além de `js/secoes.js`: copie `mundo.html` trocando o
`data-secao`, e adicione a chave nova na linha `check (secao in (...))` de `supabase/schema.sql`
(no Supabase, rode só o `alter table` correspondente, já que a tabela existe).

## Supabase grátis: pausa por falta de uso

O plano grátis pausa o projeto depois de **1 semana sem nenhum acesso**. O workflow
`.github/workflows/manter-supabase-ativo.yml` chama o banco a cada 3 dias para evitar isso.

- Para testar: aba **Actions → Manter Supabase ativo → Run workflow**.
- O GitHub desliga tarefas agendadas em repositórios sem nenhuma mudança por 60 dias;
  se chegar um e-mail avisando, é só reativar na aba Actions.
- Se mesmo assim pausar, entre no painel do Supabase e clique em **Restore project**.

## Testar no próprio PC

As páginas precisam ser abertas por um servidor (não direto pelo arquivo):

```bash
python -m http.server 5510
```

E abra http://localhost:5510. Os dados são os mesmos do Supabase de verdade.
