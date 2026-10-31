# LuminusLore

Site para guardar os textos do cenário de fantasia e escrever junto com os amigos:
**Mundo**, **História**, **Personagens**, **Panteão** e **Organizações**.

- **Páginas:** HTML, CSS e JavaScript puro, hospedadas de graça no **GitHub Pages**.
- **Dados, login e imagens:** no **Supabase** (Postgres na nuvem, plano grátis).

Não tem servidor próprio: o navegador conversa direto com o Supabase, e quem protege os dados
são as regras de segurança do banco (`supabase/schema.sql`).

## Estrutura

```
index.html                   login
home.html                    escolha da seção
mapa.html                    o Mundo: metade mapa, metade texto (js/mapa.js)
mundo.html, historia.html,
personagens.html, panteao.html,
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

## Visitantes (só leitura)

Na tela de login, **Entrar como visitante** deixa qualquer pessoa ler o site sem conta: textos,
mapa, histórico, fichas. Não aparece nenhum botão de criar, editar ou excluir, e o banco também
não deixa: o visitante só tem permissão de **ler**, e só as colunas sem dados pessoais (os e-mails
ficam de fora; no lugar ele vê o **nome** de quem escreveu, que o banco guarda junto com o texto).
O site lê pelas "vitrines" `artigos_publico` e `revisoes_publico`.

Se um membro mudar de nome (`update public.membros set nome = ...`), rode o `schema.sql` de novo para
os textos antigos mostrarem o nome novo aos visitantes.

Como a chave pública do Supabase fica no código do site, com isso qualquer pessoa que tiver o link
consegue ler o conteúdo. Se um dia quiser o site fechado de novo, rode no SQL Editor:

```sql
drop policy visitantes on public.artigos;
drop policy visitantes on public.revisoes;
```

(e para reabrir, rode o `schema.sql` de novo).

## Escrevendo

- O texto aceita **Markdown**: `**negrito**`, `*itálico*`, `# Título`, `- lista`, `> citação`.
  O botão **Pré-visualizar** mostra como vai ficar.
- **Links entre textos:** `[[Nome do texto]]` ou `[[Nome do texto|texto que aparece]]`.
  Ao digitar `[[` aparece a lista de títulos para escolher (setas + Enter, ou clique); o botão
  **🔗 Link** do editor faz o mesmo.
  Link para um texto que ainda não existe aparece tracejado em vermelho; clicando nele dá para criar.
  Os campos da ficha (ex.: *Sede*, *Divindade ligada*) também aceitam links.
- No fim de cada texto aparece **Mencionado em**, com os textos que têm link para ele.
- Dois textos não podem ter o mesmo título (é por ele que os links acham o texto), com uma exceção:
  um **país** pode ter o mesmo nome de um outro texto (ex.: o país Azraq e a cidade Azraq, capital dele).
  Nesse caso `[[Azraq]]` leva à cidade e `[[Azraq (país)]]` leva ao país (as sugestões do `[[`
  já escrevem o certo, e na leitura os dois aparecem só como "Azraq").
- **Histórico:** toda vez que alguém salva, a versão anterior fica guardada. Dá para ver e restaurar
  qualquer versão (restaurar também guarda a atual). **O histórico nunca é apagado**: o banco recusa
  alterar ou apagar versões, até pelo SQL Editor.
- **Excluir não perde nada:** o texto vai para *Textos excluídos*, no fim da lista da seção, e pode ser
  restaurado com histórico, imagem e ponto no mapa. (Os textos que pertenciam a um país excluído não
  voltam a ficar ligados a ele sozinhos.)
- **Quem está editando:** com o editor aberto, os outros veem "Fulano está editando este texto agora"
  na página do texto, no editor e no card da lista. Só avisa, não bloqueia. Se mesmo assim duas
  pessoas salvarem, quem salvar depois recebe um aviso em vez de apagar o que a outra escreveu.
  (Usa o Realtime do Supabase, que já vem ligado.)

## O mapa (Mundo)

A seção Mundo abre em `mapa.html`: o mapa à esquerda (roda do mouse dá zoom, arrastar move)
e o texto à direita. Arraste a barra do meio para mudar o tamanho de cada lado; as setas dela
(ou arrastar até a borda) escondem um lado inteiro, e duplo clique volta para metade/metade.
O navegador lembra a última divisão.

Se aparecer "O banco está desatualizado", rode `supabase/schema.sql` de novo no SQL Editor
(o site ganhou colunas novas e o banco ainda não tem).

- **Pontos:** cada texto pode ter um ponto no mapa. Clicar no ponto abre o texto ao lado.
- **Criar um ponto de interesse num lugar:** botão direito no mapa (toque longo no celular) → *Novo ponto de interesse aqui*.
- **Pôr no mapa um texto que já existe:** abra o texto e clique em *📍 Marcar no mapa* (barra embaixo
  do mapa), depois clique no lugar. A mesma barra tem *Mover ponto* e *Tirar do mapa*.
  Textos do Panteão e das Organizações também podem ter ponto (um templo, uma sede).
- **Cor e ícone do ponto:** botão *🎨 Cor e ícone* na barra (abre sozinho quando o texto ganha
  o primeiro ponto). Ícones: cidade, vila, torre, castelo, caveira, floresta, espadas cruzadas, montanha,
  templo, porto, navio, corpo de água e estrela (país). Sem cor escolhida, o ponto usa a cor do país ou, sem país, da seção. Para criar ícones novos,
  veja `ICONES_MAPA` em `js/mapa.js`.
- **Esconder os pontos:** o olho no canto de cima do mapa esconde todos os pontos para ver só o
  desenho. Vale só para quem clicou (fica guardado no navegador dele).
- **Clicar fora dos pontos** solta o texto selecionado (o painel volta para a lista). Se o
  editor estiver aberto com mudanças, elas são salvas antes.
- **Países:** um ponto com o ícone de estrela é um país. Com o mapa afastado só aparecem os
  países; aproximando, eles somem e aparecem os outros pontos. Clicar num país aproxima até a
  área dele.
- **Pertencer a um país:** no editor de qualquer texto, o campo *País* lista os países
  (ou *Nenhum* para regiões neutras). O ponto herda a cor do país, a menos que tenha cor própria;
  trocar de país volta a usar a cor do país novo.
- **Capital:** quando o texto é um país (estrela no ponto ou categoria *País/Reino*), o editor
  esconde o campo *País* e mostra *Capital*, com as cidades e vilarejos que pertencem a ele.
  A ficha do país mostra o link para a capital, e a da cidade mostra *Capital de*. Se a cidade
  mudar de país ou for excluída, o país fica sem capital.
- **Forma de Governo:** campo de texto livre que só aparece em países; na ficha do país fica
  logo abaixo da capital.
- **Ícone e cor no cadastro:** o editor de um texto que tem (ou vai ganhar) ponto no mapa mostra o
  quadro *Ponto no mapa*, com os ícones e a cor. O *🎨 Cor e ícone* do mapa continua funcionando.
- **Lista do Mundo em pastas:** cada país vira uma pasta (na cor do país) com os textos que
  pertencem a ele; o que não tem país fica em *Outros*. Clicar na faixa abre/fecha a pasta
  (o navegador lembra). O globo antes do nome abre a **ficha do país** por cima do mapa: capa com a
  imagem do país, texto, os lugares dele, e dá para editar ali mesmo.
- **Várias imagens:** no editor, *+ Adicionar imagem* (dá para escolher várias de uma vez). Cada
  miniatura tem ◀ ▶ (mudar a ordem), ⤢ (ajustar a posição) e ✕ (tirar); a primeira é a principal
  (é a que aparece na capa do país, na linha do tempo etc.). Com mais de uma, o card e a página
  viram um carrossel: clicar na borda esquerda/direita troca a imagem, e ela troca sozinha a cada 10 s.
- **Posição da imagem:** ao escolher a imagem de um texto, abre um popup com um quadro para cada
  formato em que ela aparece no site (ex.: personagem = retrato em pé + card da lista; país = capa
  larga + página). Arraste a imagem em qualquer quadro para escolher a parte que fica à vista; o botão
  *Ajustar posição* reabre o popup depois. A imagem é guardada inteira, só a posição muda.
  Os formatos ficam em `moldurasDaImagem` (`js/secoes.js`) e precisam bater com o CSS.
- **Imagens no texto:** o botão *🖼 Imagem* do editor envia uma imagem e a coloca no ponto do texto
  onde está o cursor (vale para qualquer texto, e é o jeito de montar a ficha de um país com fotos).
- **Links andam pelo mapa:** clicar num `[[link]]` dentro do texto abre o outro texto no painel
  e o mapa vai até o ponto dele.
- **Submenu do painel:** no alto do painel de texto ficam as seções (Mundo, História, Personagens,
  Panteão, Organizações). Clicar abre a lista daquela seção ali mesmo, sem sair do mapa.

### Trocar a imagem do mapa

A imagem original (`mapa/*.png`) é pesada demais para o site e não vai para o GitHub (está no
`.gitignore`). O site usa versões comprimidas, geradas assim:

```bash
python ferramentas/preparar_mapa.py "mapa/Artia Mapa Mundi.png"
```

Se a nova imagem tiver outro tamanho, atualize `largura` e `altura` em `js/secoes.js` (o script
mostra os valores). Os pontos são guardados em proporção da imagem, então continuam no lugar
se o mapa novo for o mesmo desenho em outra resolução.

## História e Personagens

- **Panteão:** abre em duas abas: *Como os Deuses e a Fé são?* (um texto de apresentação, com
  editor, links e histórico como qualquer outro) e *Divindades* (a lista). Outras seções podem ganhar
  o mesmo com `introducao` em `js/secoes.js` (a página da seção precisa carregar o marked e o DOMPurify,
  como `panteao.html`).

- **História do Mundo:** cada evento tem *Era*, *Ano* (e *Até o ano*, se durou mais) e aparece numa
  linha do tempo. A ordem das eras é a da lista de opções do campo *Era* em `js/secoes.js`;
  troque pelos nomes das eras do seu mundo.
- **Personagens:** *Tipo* separa NPCs de personagens de jogadores (na lista, são as abas *NPCs* e
  *Personagens*; o botão do globo filtra pela nacionalidade). Todos têm nome, alcunha,
  descrição, história, imagem e nacionalidade (um país do mapa). Personagens de jogador também têm
  *Jogador*, *Raça*, *Classe* e *Inventário* (um item por linha). Sem tipo escolhido, o personagem
  é NPC (vale também para os antigos). Um campo pode ter valor padrão com `padrao` em `js/secoes.js`.
- **Organização do personagem:** o campo *Organização* (digite parte do nome e escolha) liga o
  personagem a uma organização. A página da organização tem as abas *Sobre* (o texto) e *Membros*
  (os personagens filiados, com o selo *Líder* em quem lidera a organização).
- A ficha de um país mostra também os personagens com essa nacionalidade e os eventos ligados a ele.
- **Regentes e líderes:** países, cidades e vilas têm o campo *Regente*, e organizações o campo *Líder*:
  digite parte do nome e escolha o personagem na lista. No personagem, o campo *Regente / Líder de* faz o
  mesmo pelo outro lado. Os dois são a mesma informação, então as duas páginas sempre batem.
  Quem tem cargo é definido em `cargoDeLider` (`js/secoes.js`).

- **Paginação:** as listas em cards (Personagens, Organizações e Divindades) mostram 20 por página.
  Buscar, filtrar ou mudar a ordem volta para a primeira página, e voltar de um texto cai na mesma
  página em que você estava. O tamanho da página é `POR_PAGINA` em `js/secao.js`.

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
