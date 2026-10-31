// Página de um texto: ler, editar, ver o histórico.
//   artigo.html?id=...                  abre o texto
//   artigo.html?secao=mundo&titulo=...  escreve um texto novo (o título é opcional)
//   artigo.html?titulo=...              usado pelos links [[Título]]: abre o texto com esse título,
//                                       ou oferece criar se ainda não existir
//   artigo.html?secao=mundo&x=..&y=..   texto novo que já nasce com ponto no mapa (vem do mapa.html)
//   artigo.html?id=...&modo=pais        ficha do país, aberta por cima do mapa (globo nas pastas da lista do Mundo)
// Textos de seção com mapa (Mundo) abrem no painel do mapa.html.

exigirLogin();
montarTopo('');

const params = new URLSearchParams(location.search);
const pagina = document.getElementById('pagina');

// Ficha do país: visual de destaque, e os links abrem no painel de texto do mapa (iframe "painel")
const modoPais = params.get('modo') === 'pais';
if (modoPais) {
  document.documentElement.classList.add('modo-pais');
  document.head.insertAdjacentHTML('beforeend', '<base target="painel">');
}
const urlDoTexto = id => `artigo.html?id=${encodeURIComponent(id)}${modoPais ? '&modo=pais' : ''}`;

let artigo = null;       // texto aberto; null enquanto um texto novo não foi salvo
let secao = '';          // chave em SECOES
let titulos = new Map(); // de banco.titulos(), para os [[links]]
let nomes = new Map();   // e-mail -> nome de quem escreveu
let alterado = false;    // tem mudança não salva no editor
window.salvarAlteracoes = null; // com o editor aberto, função que grava (o mapa chama antes de trocar de texto)

// Avisa antes de sair da página com o editor alterado
window.addEventListener('beforeunload', e => {
  if (alterado) e.preventDefault();
});

// ---------- Quem está editando ----------

// Faixa "Ana está editando este texto agora" no texto e no editor. Só avisa, não bloqueia.
let meuEmail = '';
emailAtual().then(e => { meuEmail = e; });

function mostrarAvisoEdicao() {
  const el = document.getElementById('aviso-edicao');
  if (!el || !artigo) return;
  const editores = edicao.agora(artigo.id);
  el.hidden = !editores.length;
  if (!editores.length) return;
  const desde = editores.map(e => e.desde).sort()[0];
  const hora = new Date(desde).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const noEditor = !!document.getElementById('form-artigo');
  el.innerHTML = `
    ✎ <strong>${esc(nomesEditando(editores, nomes, meuEmail))}</strong>
    ${editores.length > 1 ? 'estão' : 'está'} editando este texto agora (desde ${hora}).
    <span>${noEditor
      ? 'Se vocês dois salvarem, quem salvar por último recebe um aviso para juntar as mudanças.'
      : 'Melhor esperar terminar antes de editar.'}</span>
  `;
}
edicao.ouvir(mostrarAvisoEdicao);

async function iniciar() {
  try {
    [titulos, nomes] = await Promise.all([banco.titulos(), banco.nomes()]);
    const id = params.get('id');
    const titulo = (params.get('titulo') || '').trim();

    if (id) {
      artigo = await banco.buscarArtigo(id);
      secao = artigo.secao;
      if (SECOES[secao].mapa && !embutido) {
        location.replace(`${SECOES[secao].mapa.pagina}?id=${encodeURIComponent(id)}`);
        return;
      }
      montarTopo(SECOES[secao].nome);
      desenharTexto();
      // &editar=1 já abre o editor; &historico=1 já abre o histórico
      if (params.get('editar') === '1' && !ehVisitante) document.getElementById('btn-editar').click();
      else if (params.get('historico') === '1') desenharHistorico();
    } else if (SECOES[params.get('secao')] && ehVisitante) {
      // Visitante não cria textos: volta para a lista da seção
      location.replace(SECOES[params.get('secao')].pagina);
    } else if (SECOES[params.get('secao')]) {
      secao = params.get('secao');
      montarTopo(SECOES[secao].nome);
      editar(titulo);
    } else if (titulo) {
      const existente = titulos.get(titulo.toLowerCase());
      if (existente) location.replace(`artigo.html?id=${encodeURIComponent(existente.id)}`);
      else desenharInexistente(titulo);
    } else {
      location.replace('home.html');
    }
  } catch (e) {
    pagina.innerHTML = `<p class="vazio">${esc(e.message)}</p>`;
  }
}

// ---------- Ler ----------

function desenharTexto() {
  const s = SECOES[secao];
  document.title = `${artigo.titulo} - LuminusLore`;
  avisarMapa(artigo);
  window.salvarAlteracoes = null;
  edicao.marcar(null);

  const pais = artigo.paisId && [...titulos.values()].find(t => t.id === artigo.paisId);
  // Regente (país, cidade, vila) / Líder (organização)
  const cargo = cargoDeLider(artigo);
  const lider = cargo && artigo.liderId && [...titulos.values()].find(t => t.id === artigo.liderId);
  // País: a capital dele (uma das suas cidades ou vilarejos)
  const capital = ehPaisOuReino(artigo) && artigo.capitalId && [...titulos.values()].find(t => t.id === artigo.capitalId);
  const preenchidos = s.campos.filter(c => artigo.detalhes[c.chave] && campoVisivel(c, artigo.detalhes));
  const ficha = (lider ? `<div><dt>${esc(cargo)}</dt><dd>${linkWiki(lider.link, lider.titulo, titulos)}</dd></div>` : '')
    + (capital ? `<div><dt>Capital</dt><dd>${linkWiki(capital.link, capital.titulo, titulos)}</dd></div>` : '')
    + (pais && !ehPaisOuReino(artigo) ? `<div id="linha-pais"><dt>${esc(s.rotuloPais || 'País')}</dt><dd>${linkWiki(pais.link, pais.titulo, titulos)}</dd></div>` : '')
    // Cidade: "Capital de" é preenchido depois (carregarCapitalDe), procurando o país que aponta para ela
    + (ehCidadeOuVila(artigo) ? '<div id="capital-de" hidden></div>' : '')
    // Personagem: "Líder de" é preenchido depois (carregarLiderDe), procurando quem aponta para ele
    + (secao === 'personagens' ? '<div id="lider-de" hidden></div>' : '')
    + preenchidos
      .filter(c => !c.longo)
      .map(c => `<div><dt>${esc(c.rotulo)}</dt><dd>${linhaComLinks(artigo.detalhes[c.chave], titulos)}</dd></div>`)
      .join('');
  // Campos longos (Descrição, Inventário...) viram blocos antes ou depois do texto principal
  const blocos = depois => preenchidos
    .filter(c => c.longo && !!c.depois === depois)
    .map(c => `<section class="bloco-campo"><h2>${esc(c.rotulo)}</h2>${renderizarTexto(artigo.detalhes[c.chave], titulos)}</section>`)
    .join('');
  const temAlgumTexto = artigo.conteudo || preenchidos.some(c => c.longo);
  // Na ficha do país a imagem vira a capa, em vez de ficar na ficha ao lado do texto
  const imagemNaFicha = artigo.imagem && !modoPais;
  const temFicha = imagemNaFicha || ficha;
  const acoes = `
    <div class="acoes">
      <button class="primario" id="btn-editar">Editar</button>
      <button id="btn-historico">Histórico</button>
      <button class="perigo" id="btn-excluir">Excluir</button>
    </div>`;
  const cabeca = modoPais ? `
      <header class="capa-pais" style="--cor-pais: ${artigo.mapaCor || s.cor}">
        ${artigo.imagem ? `<img class="fundo-capa" src="${banco.urlImagem(artigo.imagem)}" alt="" style="${posicaoDaImagem(artigo)}">` : ''}
        <div class="capa-conteudo">
          <p class="secao-artigo">${desenhoSvg(ICONES_MAPA[ICONE_PAIS].svg)} País</p>
          <h1>${esc(artigo.titulo)}</h1>
          ${artigo.subtitulo ? `<p class="subtitulo">${esc(artigo.subtitulo)}</p>` : ''}
        </div>
      </header>
      ${acoes}` : `
      <header class="cabeca-artigo">
        <div>
          <p class="secao-artigo">${s.icone} ${esc(s.nome)}</p>
          <h1>${esc(artigo.titulo)}</h1>
          ${artigo.subtitulo ? `<p class="subtitulo">${esc(artigo.subtitulo)}</p>` : ''}
        </div>
        ${acoes}
      </header>`;

  pagina.innerHTML = `
    <a class="voltar" href="${s.pagina}">← ${esc(s.nome)}</a>
    <article class="artigo" data-secao="${secao}" style="--cor: ${s.cor}">
      ${cabeca}
      <p class="aviso-edicao" id="aviso-edicao" hidden></p>

      <div class="corpo-artigo${temFicha ? '' : ' sem-ficha'}">
        ${temFicha ? `
          <aside class="ficha">
            ${imagemNaFicha ? carrossel(artigo, 'carrossel-ficha') : ''}
            ${ficha ? `<dl>${ficha}</dl>` : ''}
          </aside>` : ''}
        <div class="prosa">
          ${blocos(false)}
          ${artigo.conteudo && s.rotuloTexto ? `<h2>${esc(s.rotuloTexto)}</h2>` : ''}
          ${artigo.conteudo ? renderizarTexto(artigo.conteudo, titulos) : ''}
          ${blocos(true)}
          ${temAlgumTexto ? '' : '<p class="sem-texto">Ainda não tem nada escrito aqui. Clique em <strong>Editar</strong> para começar.</p>'}
        </div>
      </div>

      <footer class="assinatura">
        Criado por <strong>${esc(nomeDe(artigo.criadoPor, nomes))}</strong> em ${formatarData(artigo.criadoEm)}
        · Última edição por <strong>${esc(nomeDe(artigo.editadoPor, nomes))}</strong> em ${formatarDataHora(artigo.atualizadoEm)}
      </footer>
      ${modoPais ? '<section class="lugares-pais" id="lugares" hidden></section>' : ''}
      <section class="mencoes" id="mencoes" hidden></section>
    </article>
  `;

  document.getElementById('btn-editar').addEventListener('click', async () => {
    // Pega a versão mais nova antes de editar (alguém pode ter mudado desde que a página abriu)
    try {
      artigo = await banco.buscarArtigo(artigo.id);
      editar();
    } catch (e) {
      alert(e.message);
    }
  });
  document.getElementById('btn-historico').addEventListener('click', desenharHistorico);
  document.getElementById('btn-excluir').addEventListener('click', excluir);
  carregarMencoes();
  if (modoPais) carregarLugares();
  if (secao === 'personagens') carregarLiderDe();
  if (ehCidadeOuVila(artigo)) carregarCapitalDe();
  mostrarAvisoEdicao();
}

// Espaço da ficha que ficou vazio (ex.: "Líder de" de quem não lidera nada): se a ficha
// só tinha ele e não tem imagem, a ficha some
function tirarFichaVazia(el) {
  const ficha = el.closest('.ficha');
  if (ficha && !ficha.querySelector('img') && !ficha.querySelector('dl > div:not([hidden])')) {
    ficha.remove();
    document.querySelector('.corpo-artigo')?.classList.add('sem-ficha');
  }
}

// Cidade ou vilarejo: o país de que é a capital
async function carregarCapitalDe() {
  const el = document.getElementById('capital-de');
  let paises = [];
  try {
    paises = await banco.capitalDe(artigo.id);
  } catch {
    // Não é essencial: se falhar, só não mostra
  }
  if (!el) return;
  if (!paises.length) return tirarFichaVazia(el);
  const link = p => {
    const t = [...titulos.values()].find(x => x.id === p.id);
    return t ? linkWiki(t.link, t.titulo, titulos) : esc(p.titulo);
  };
  el.innerHTML = `<dt>Capital de</dt><dd>${paises.map(link).join(', ')}</dd>`;
  // "Capital de Azraq" já diz o país: a linha "País: Azraq" sairia repetida
  if (paises.some(p => p.id === artigo.paisId)) document.getElementById('linha-pais')?.remove();
  el.hidden = false;
}

// Personagem: o que ele lidera (país, cidade, vila, organização). Se não lidera nada e a ficha
// só tinha esse espaço, a ficha some.
async function carregarLiderDe() {
  const el = document.getElementById('lider-de');
  let lista = [];
  try {
    lista = await banco.liderados(artigo.id);
  } catch {
    // Não é essencial: se falhar, só não mostra
  }
  if (!el) return;
  if (lista.length) {
    // "Regente de" (países, cidades, vilas) e "Líder de" (organizações), cada um com a sua lista
    const item = l => {
      const t = [...titulos.values()].find(x => x.id === l.id);
      return `${t ? linkWiki(t.link, t.titulo, titulos) : esc(l.titulo)} <small class="tipo-liderado">(${tipoDoLiderado(l)})</small>`;
    };
    el.innerHTML = ['Regente', 'Líder']
      .map(cargo => [cargo, lista.filter(l => cargoDeLider(l) === cargo)])
      .filter(([, itens]) => itens.length)
      .map(([cargo, itens]) => `<dt>${cargo} de</dt><dd>${itens.map(item).join('<br>')}</dd>`)
      .join('');
    el.hidden = false;
    return;
  }
  tirarFichaVazia(el);
}

// Ficha do país: os textos que pertencem a ele, separados por seção (lugares, personagens, eventos...).
// Abrem no painel de texto do mapa.
async function carregarLugares() {
  try {
    const lista = await banco.lugaresDoPais(artigo.id);
    const el = document.getElementById('lugares');
    if (!el) return;
    const grupos = Object.entries(SECOES)
      .map(([chave, s]) => [s, lista.filter(l => l.secao === chave)])
      .filter(([, itens]) => itens.length);
    el.innerHTML = grupos.length
      ? grupos.map(([s, itens]) => `
        <h2>${s === SECOES.mundo ? `Lugares de ${esc(artigo.titulo)}` : esc(s.nome)}</h2>
        <ul>${itens.map(l => `
          <li><a href="artigo.html?id=${encodeURIComponent(l.id)}">
            ${ICONES_MAPA[l.mapaIcone]?.svg ? desenhoSvg(ICONES_MAPA[l.mapaIcone].svg) : `<span class="icone-lugar">${s.icone}</span>`}
            ${esc(l.titulo)}${l.id === artigo.capitalId ? ' <small class="tipo-liderado">(capital)</small>' : ''}
          </a></li>`).join('')}</ul>
      `).join('')
      : `<h2>Lugares de ${esc(artigo.titulo)}</h2>
         <p class="sem-texto">Nada ligado a este país ainda. No editor de um texto, escolha este país no campo “País” (ou “Nacionalidade”).</p>`;
    el.hidden = false;
  } catch {
    // Não é essencial: se falhar, só não mostra
  }
}

// Ficha do país (por cima do mapa): pede para o mapa fechar a ficha
function fecharFichaDoPais() {
  window.parent.postMessage({ tipo: 'fechar-pais' }, location.origin);
}
if (modoPais) {
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !document.getElementById('form-artigo')) fecharFichaDoPais();
  });
}

// "Mencionado em": outros textos com link para este
async function carregarMencoes() {
  try {
    // Os jeitos de escrever o link que chegam neste texto (um país pode ter dois: "Azraq" e "Azraq (país)")
    const jeitos = [...titulos].filter(([, t]) => t.id === artigo.id).map(([chave]) => chave);
    const lista = await banco.mencoes(artigo.titulo, artigo.id, jeitos);
    const el = document.getElementById('mencoes');
    if (!lista.length || !el) return;
    el.innerHTML = `
      <h2>Mencionado em</h2>
      <ul>${lista.map(m => `
        <li><a href="artigo.html?id=${encodeURIComponent(m.id)}">${SECOES[m.secao]?.icone || ''} ${esc(m.titulo)}</a></li>
      `).join('')}</ul>
    `;
    el.hidden = false;
  } catch {
    // Não é essencial: se falhar, só não mostra
  }
}

function desenharInexistente(titulo) {
  document.title = `${titulo} - LuminusLore`;
  avisarMapa(null);
  edicao.marcar(null);
  pagina.innerHTML = `
    <div class="vazio caixa-inexistente">
      <h2>“${esc(titulo)}” ainda não foi escrito</h2>
      <p>${ehVisitante ? 'Ninguém escreveu este texto ainda.' : 'Quer começar? Escolha onde ele fica:'}</p>
      <div class="acoes-centro so-membro">
        ${Object.entries(SECOES).map(([k, s]) => `
          <a class="botao" href="artigo.html?secao=${k}&titulo=${encodeURIComponent(titulo)}">${s.icone} ${esc(s.nome)}</a>
        `).join('')}
      </div>
    </div>
  `;
}

// ---------- Editar ----------

// "Como formatar o texto": abre embaixo da caixa de texto do editor, com o que digitar e como fica
const AJUDA_FORMATACAO = `
  <details class="ajuda-formatacao">
    <summary>❔ Como formatar o texto</summary>
    <p>Os símbolos vão no texto mesmo; veja como fica na aba <strong>Pré-visualizar</strong>.
       Títulos, listas e citações começam no <strong>começo da linha</strong>, com um espaço depois do símbolo.</p>
    <table>
      <thead><tr><th>Você digita</th><th>Aparece como</th></tr></thead>
      <tbody>
        <tr><td><code># Título</code></td><td><span class="ex-h1">Título</span></td></tr>
        <tr><td><code>## Subtítulo</code></td><td><span class="ex-h2">Subtítulo</span></td></tr>
        <tr><td><code>### Seção</code></td><td><span class="ex-h3">Seção</span></td></tr>
        <tr><td><code>**negrito**</code></td><td><strong>negrito</strong></td></tr>
        <tr><td><code>*itálico*</code></td><td><em>itálico</em></td></tr>
        <tr><td><code>- item</code> <small>(um por linha)</small></td><td>• item</td></tr>
        <tr><td><code>1. item</code></td><td>1. item</td></tr>
        <tr><td><code>&gt; frase</code></td><td><span class="ex-citacao">frase</span></td></tr>
        <tr><td><code>---</code> <small>(sozinho na linha)</small></td><td><span class="ex-linha"></span></td></tr>
        <tr><td><code>[[Nome do texto]]</code></td><td><a class="wiki">Nome do texto</a> <small>(link para outro texto)</small></td></tr>
        <tr><td><code>[[Nome do texto|outro nome]]</code></td><td><a class="wiki">outro nome</a></td></tr>
        <tr><td><code>[[Azraq (país)]]</code></td><td><a class="wiki">Azraq</a> <small>(o país, quando ele tem o nome de outro texto)</small></td></tr>
        <tr><td>Botão <strong>🖼 Imagem</strong></td><td>põe uma imagem onde está o cursor</td></tr>
        <tr><td>Linha em branco</td><td>separa os parágrafos</td></tr>
      </tbody>
    </table>
  </details>`;

function editar(tituloInicial = '') {
  const s = SECOES[secao];
  const a = artigo || { titulo: tituloInicial, subtitulo: '', conteudo: '', detalhes: {}, imagem: '', paisId: null };
  document.title = `${artigo ? `Editando ${artigo.titulo}` : s.novo} - LuminusLore`;
  avisarMapa(artigo);

  // Texto novo criado com o botão direito no mapa: já nasce com o ponto.
  // Fica pendente até ser gravado: se falhar, salvar de novo tenta outra vez.
  const pontoNovo = !artigo && params.has('x') && params.has('y')
    ? { x: Number(params.get('x')), y: Number(params.get('y')) }
    : null;
  let pontoPendente = pontoNovo;

  // Texto que tem (ou vai ter) ponto no mapa escolhe aqui o ícone e a cor do ponto.
  // cor '' = herda a do país (ou, sem país, a da seção)
  const temPonto = !!pontoNovo || (artigo?.mapaX ?? null) !== null;
  const estiloPonto = { cor: a.mapaCor || '', icone: a.mapaIcone || '' };
  // Texto de apresentação da seção (ex.: "Como os Deuses e a Fé são?"): sem os campos de ficha
  const ehIntroducao = artigo?.id === banco.idIntroducao(secao);

  // Líder (país, cidade, vila, organização): um personagem, escolhido buscando pelo nome
  const nomeDoTexto = id => [...titulos.values()].find(t => t.id === id)?.titulo || '';
  let lider = a.liderId ? { id: a.liderId, titulo: nomeDoTexto(a.liderId) } : null;
  const liderInicial = a.liderId || null;
  // "Líder de" (personagem): o que ele lidera; carregado do banco ao abrir o editor
  let lideraAgora = [];
  let lideraAntes = [];

  // Campos curtos vão na grade; os longos (várias linhas) ficam embaixo, largos.
  // data-campo: para esconder os que só valem com certo valor de outro campo (soSe)
  const campoHtml = c => {
    const valor = a.detalhes[c.chave] || '';
    if (c.longo) {
      return `
        <label class="campo-longo" data-campo="${c.chave}">${esc(c.rotulo)}
          <textarea name="d-${c.chave}" rows="4" placeholder="${esc(c.dica || '')}">${esc(valor)}</textarea>
        </label>`;
    }
    if (c.opcoes) {
      // Valor antigo que saiu da lista de opções continua aparecendo
      const opcoes = !valor || c.opcoes.includes(valor) ? c.opcoes : [...c.opcoes, valor];
      return `
        <label data-campo="${c.chave}">${esc(c.rotulo)}
          <select name="d-${c.chave}">
            <option value="">—</option>
            ${opcoes.map(o => `<option${o === valor ? ' selected' : ''}>${esc(o)}</option>`).join('')}
          </select>
        </label>`;
    }
    return `
      <label data-campo="${c.chave}">${esc(c.rotulo)}
        <input type="${c.numero ? 'number' : 'text'}"${c.numero ? ' step="any"' : ''} name="d-${c.chave}" value="${esc(valor)}" placeholder="${esc(c.dica || '')}">
      </label>`;
  };
  const campos = s.campos.filter(c => !c.longo).map(campoHtml).join('');
  const camposLongos = s.campos.filter(c => c.longo).map(campoHtml).join('');

  pagina.innerHTML = `
    <form class="editor" id="form-artigo" style="--cor: ${s.cor}">
      <p class="secao-artigo">${s.icone} ${esc(s.nome)}</p>
      <h1>${artigo ? `Editando “${esc(artigo.titulo)}”` : esc(s.novo)}</h1>
      <p class="aviso-edicao" id="aviso-edicao" hidden></p>
      ${pontoNovo ? '<p class="aviso-ponto">📍 Este texto vai ficar no ponto que você marcou no mapa.</p>' : ''}

      <div class="duas-colunas">
        <label>Título*
          <input type="text" name="titulo" required maxlength="120" value="${esc(a.titulo)}">
        </label>
        <label>${esc(s.subtitulo.rotulo)}
          <input type="text" name="subtitulo" maxlength="200" value="${esc(a.subtitulo)}" placeholder="${esc(s.subtitulo.dica)}">
        </label>
      </div>

      <div class="grade-campos"${ehIntroducao ? ' hidden' : ''}>
        <label class="campo-capital" hidden>Capital
          <select name="capital">
            <option value="">Nenhuma</option>
            ${a.capitalId ? `<option value="${esc(a.capitalId)}" selected>${esc(nomeDoTexto(a.capitalId) || 'Carregando…')}</option>` : ''}
          </select>
          <small class="dica-capital"></small>
        </label>
        <label class="campo-do-pais">${esc(s.rotuloPais || 'País')}
          <span class="campo-pais">
            <select name="pais">
              <option value="">Nenhum (região neutra)</option>
              ${a.paisId ? `<option value="${esc(a.paisId)}" selected>Carregando…</option>` : ''}
            </select>
            <span class="amostra-cor" title="Cor que o ponto herda no mapa" hidden></span>
          </span>
        </label>
        <label class="campo-lider" hidden><span class="rotulo-lider">Líder</span>
          <span class="campo-busca">
            <input type="text" name="lider-busca" value="${esc(lider?.titulo || '')}" placeholder="Digite o nome do personagem…">
            <button type="button" class="pequeno limpar-busca" title="Deixar sem líder">✕</button>
          </span>
        </label>
        ${campos}
      </div>
      <div${ehIntroducao ? ' hidden' : ''}>${camposLongos}</div>
      ${secao === 'personagens' ? `
        <div class="campo campo-lider-de">Regente / Líder de
          <div class="chips" id="chips-lider-de"></div>
          <span class="campo-busca">
            <input type="text" name="lider-de-busca" placeholder="Digite um país, cidade, vila ou organização…">
          </span>
          <p class="dica">Opcional. Ao salvar, o personagem vira o regente (ou o líder, numa organização) do que estiver aqui, e a página de lá passa a mostrar isso.</p>
        </div>` : ''}

      ${temPonto ? `
        <fieldset class="campo-ponto">
          <legend>Ponto no mapa</legend>
          <div class="icones-ponto">${botoesIcones(estiloPonto.icone)}</div>
          <div class="linha-estilo">
            <label class="campo-cor">Cor <input type="color" name="mapa-cor"></label>
            <button type="button" class="pequeno" data-acao="cor-padrao"></button>
          </div>
          <p class="dica">A estrela marca um <strong>país</strong>: aparece só com o mapa afastado, e os outros textos podem pertencer a ele (e herdam a cor).</p>
        </fieldset>` : ''}

      <div class="campo">Imagens
        <small class="dica-imagens">A primeira é a principal. Com mais de uma, o card e a página mostram um carrossel.</small>
        <div class="campo-imagens">
          <div class="lista-imagens"></div>
          <label class="botao adicionar-imagem">+ Adicionar imagem <input type="file" accept="image/*" multiple hidden></label>
        </div>
      </div>

      <div class="campo">
        ${s.rotuloTexto ? `<span class="rotulo-texto">${esc(s.rotuloTexto)}</span>` : ''}
        <div class="abas abas-editor">
          <button type="button" class="ativo" data-aba="escrever">Escrever</button>
          <button type="button" data-aba="ver">Pré-visualizar</button>
          <button type="button" class="btn-link" title="Link para outro texto">🔗 Link</button>
          <label class="botao btn-imagem-texto" title="Pôr uma imagem no meio do texto">🖼 Imagem
            <input type="file" accept="image/*" hidden>
          </label>
        </div>
        <textarea name="conteudo" class="texto-grande" placeholder="${s.rotuloTexto ? `${esc(s.rotuloTexto)}…` : 'Escreva aqui…'}">${esc(a.conteudo)}</textarea>
        <div class="prosa previa" hidden></div>
        <p class="dica">
          <code>**negrito**</code> <code>*itálico*</code> <code># Título</code> <code>- lista</code> <code>&gt; citação</code>
          · Link para outro texto: digite <code>[[</code> e escolha, ou <code>[[Nome do texto|como aparece]]</code>
          · <kbd>Ctrl</kbd>+<kbd>S</kbd> salva
        </p>
        ${AJUDA_FORMATACAO}
      </div>

      <p class="erro" id="erro"></p>
      <div class="botoes-modal barra-salvar">
        <button type="button" id="btn-cancelar">Cancelar</button>
        <button type="submit" class="primario">Salvar</button>
      </div>
    </form>
  `;

  const form = document.getElementById('form-artigo');
  const textarea = form.conteudo;
  const previa = form.querySelector('.previa');
  const erro = document.getElementById('erro');
  // Os formatos do popup de posicionar a imagem dependem do tipo do texto (que pode virar país aqui)
  const campoImagem = ligarCampoImagens(form.querySelector('.campo-imagens'), () => emblemaSecao(secao),
    () => moldurasDaImagem({ id: artigo?.id, secao, mapaIcone: estiloPonto.icone }));
  campoImagem.iniciar(a);

  // Avisa os outros que este texto está sendo editado (texto novo ainda não tem id: não avisa)
  edicao.marcar(artigo?.id || null);
  mostrarAvisoEdicao();

  alterado = false;
  form.addEventListener('input', () => { alterado = true; });
  form.addEventListener('change', () => { alterado = true; });

  // Mostra só os campos que valem para os valores escolhidos (ex.: Inventário só para jogador)
  function mostrarCamposVisiveis() {
    const valores = {};
    for (const c of s.campos) valores[c.chave] = form[`d-${c.chave}`].value;
    for (const c of s.campos) form.querySelector(`[data-campo="${c.chave}"]`).hidden = !campoVisivel(c, valores);
  }
  form.addEventListener('change', mostrarCamposVisiveis);
  mostrarCamposVisiveis();
  if (!artigo) form.titulo.focus();

  // Líder: o campo só aparece se este texto tem cargo (depende da categoria e do ícone, que mudam no editor)
  const comoEstaAgora = () => ({ secao, detalhes: { categoria: form['d-categoria']?.value }, mapaIcone: estiloPonto.icone });
  const cargoAtual = () => cargoDeLider(comoEstaAgora());
  // País (estrela ou categoria País/Reino) não pertence a outro país: no lugar escolhe a capital
  const ehPaisAgora = () => ehPaisOuReino(comoEstaAgora());
  const campoLider = form.querySelector('.campo-lider');
  const inputLider = form['lider-busca'];
  function atualizarCargo() {
    const cargo = cargoAtual();
    campoLider.hidden = !cargo;
    campoLider.querySelector('.rotulo-lider').textContent = cargo || 'Líder';
  }
  form.addEventListener('change', atualizarCargo);
  form.addEventListener('click', atualizarCargo); // os ícones do ponto são botões
  atualizarCargo();
  ligarBusca(inputLider, {
    buscar: termo => banco.buscarPersonagens(termo),
    mostrar: p => `${SECOES.personagens.icone} ${esc(p.titulo)}${p.subtitulo ? ` <small>${esc(p.subtitulo)}</small>` : ''}`,
    escolher: p => {
      lider = { id: p.id, titulo: p.titulo };
      inputLider.value = p.titulo;
      alterado = true;
    },
  });
  // Saiu do campo sem escolher: volta o nome do líder atual (ou fica vazio, se apagou tudo)
  inputLider.addEventListener('blur', () => setTimeout(() => {
    if (!inputLider.value.trim()) {
      if (lider) alterado = true;
      lider = null;
    } else {
      inputLider.value = lider?.titulo || '';
    }
  }, 200));
  form.querySelector('.limpar-busca').addEventListener('click', () => {
    lider = null;
    inputLider.value = '';
    alterado = true;
  });

  // Líder de (só personagens): etiquetas com ✕, e a busca acrescenta
  const chipsLiderDe = document.getElementById('chips-lider-de');
  function desenharLiderDe() {
    if (!chipsLiderDe) return;
    chipsLiderDe.innerHTML = lideraAgora.length
      ? lideraAgora.map((l, i) => `
          <span class="chip">${iconeDoTexto(l)} ${esc(l.titulo)} <small>${tipoDoLiderado(l)}</small>
            <button type="button" data-tirar="${i}" title="Deixar de ser líder de ${esc(l.titulo)}">✕</button>
          </span>`).join('')
      : '<span class="sem-texto">Nenhum</span>';
  }
  if (chipsLiderDe) {
    desenharLiderDe();
    if (artigo) {
      banco.liderados(artigo.id).then(lista => {
        lideraAgora = lista;
        lideraAntes = [...lista];
        desenharLiderDe();
      }).catch(() => {});
    }
    chipsLiderDe.addEventListener('click', e => {
      const botao = e.target.closest('[data-tirar]');
      if (!botao) return;
      lideraAgora.splice(Number(botao.dataset.tirar), 1);
      alterado = true;
      desenharLiderDe();
    });
    const inputLiderDe = form['lider-de-busca'];
    ligarBusca(inputLiderDe, {
      buscar: termo => banco.buscarLideraveis(termo),
      mostrar: l => `${iconeDoTexto(l)} ${esc(l.titulo)} <small>${tipoDoLiderado(l)}${
        l.liderId && l.liderId !== artigo?.id ? ` · hoje: ${esc(nomeDoTexto(l.liderId) || 'outro')}` : ''}</small>`,
      escolher: l => {
        if (!lideraAgora.some(x => x.id === l.id)) lideraAgora.push(l);
        inputLiderDe.value = '';
        alterado = true;
        desenharLiderDe();
      },
    });
  }

  // País: os textos com o ponto de estrela no mapa. O ponto deste texto herda a cor do país.
  const selPais = form.pais;
  const amostra = form.querySelector('.amostra-cor');
  function mostrarCorPais() {
    const cor = selPais.selectedOptions[0]?.dataset.cor;
    amostra.hidden = !cor;
    if (cor) amostra.style.background = cor;
    desenharPonto();
  }
  selPais.addEventListener('change', () => {
    estiloPonto.cor = ''; // trocou de país: passa a usar a cor dele
    mostrarCorPais();
  });

  // Ícone e cor do ponto
  const caixaPonto = form.querySelector('.campo-ponto');
  const paisEscolhido = () => (ehPaisAgora() ? '' : selPais.value);
  function desenharPonto() {
    if (!caixaPonto) return;
    const herdada = (paisEscolhido() && selPais.selectedOptions[0]?.dataset.cor) || s.cor;
    const cor = estiloPonto.cor || herdada;
    caixaPonto.querySelector('.icones-ponto').style.setProperty('--cor', cor);
    caixaPonto.querySelectorAll('[data-icone]').forEach(b => b.classList.toggle('ativo', b.dataset.icone === estiloPonto.icone));
    form['mapa-cor'].value = cor;
    const padrao = caixaPonto.querySelector('[data-acao="cor-padrao"]');
    padrao.textContent = paisEscolhido() ? 'Usar cor do país' : 'Usar cor da seção';
    padrao.disabled = !estiloPonto.cor;
  }
  if (caixaPonto) {
    caixaPonto.addEventListener('click', e => {
      const botao = e.target.closest('button');
      if (!botao) return;
      if (botao.dataset.icone !== undefined) estiloPonto.icone = botao.dataset.icone;
      if (botao.dataset.acao === 'cor-padrao') estiloPonto.cor = '';
      alterado = true;
      desenharPonto();
    });
    form['mapa-cor'].addEventListener('input', () => {
      estiloPonto.cor = form['mapa-cor'].value;
      desenharPonto();
    });
    desenharPonto();
  }
  banco.paises().then(lista => {
    const escolhido = selPais.value;
    const opcoes = lista.filter(p => p.id !== artigo?.id);
    // País escolhido antes que deixou de ser país (tirou a estrela) continua aparecendo
    const antigo = escolhido && !opcoes.some(p => p.id === escolhido)
      ? `<option value="${esc(escolhido)}">${esc([...titulos.values()].find(t => t.id === escolhido)?.titulo || '(texto excluído)')}</option>`
      : '';
    selPais.innerHTML = '<option value="">Nenhum (região neutra)</option>' + antigo
      + opcoes.map(p => `<option value="${esc(p.id)}" data-cor="${esc(p.cor)}">${esc(p.titulo)}</option>`).join('');
    selPais.value = escolhido;
    mostrarCorPais();
  }).catch(() => {
    // Sem a lista, fica só o país que já estava escolhido
  });

  // Capital: uma das cidades ou vilarejos que pertencem a este país
  const campoCapital = form.querySelector('.campo-capital');
  const selCapital = form.capital;
  const dicaCapital = form.querySelector('.dica-capital');
  function atualizarCapital() {
    const pais = ehPaisAgora();
    campoCapital.hidden = !pais;
    form.querySelector('.campo-do-pais').hidden = pais;
    desenharPonto();
  }
  form.addEventListener('change', atualizarCapital);
  form.addEventListener('click', atualizarCapital); // os ícones do ponto são botões
  atualizarCapital();
  if (!artigo) {
    selCapital.disabled = true;
    dicaCapital.textContent = 'Salve o país primeiro. Depois, no editor de uma cidade, escolha este país no campo “País”, e ela aparece aqui.';
  } else {
    banco.lugaresDoPais(artigo.id).then(lista => {
      const escolhida = selCapital.value;
      const cidades = lista.filter(ehCidadeOuVila);
      // Capital que deixou de ser cidade/vilarejo (mudou a categoria) continua aparecendo
      const antiga = escolhida && !cidades.some(c => c.id === escolhida)
        ? `<option value="${esc(escolhida)}">${esc(nomeDoTexto(escolhida) || '(texto excluído)')}</option>`
        : '';
      selCapital.innerHTML = '<option value="">Nenhuma</option>' + antiga
        + cidades.map(c => `<option value="${esc(c.id)}">${esc(c.titulo)}</option>`).join('');
      selCapital.value = escolhida;
      dicaCapital.textContent = cidades.length ? ''
        : 'Nenhuma cidade ou vilarejo deste país ainda. No editor da cidade, escolha este país no campo “País”.';
    }).catch(() => {
      // Sem a lista, fica só a capital que já estava escolhida
    });
  }

  // Digitar [[ sugere os títulos (no texto e nos campos da ficha, que também aceitam links)
  ligarSugestaoDeLinks(textarea, titulos);
  form.querySelectorAll('input[type="text"][name^="d-"], textarea[name^="d-"]').forEach(campo => ligarSugestaoDeLinks(campo, titulos));

  // Escrever / Pré-visualizar
  const abas = form.querySelectorAll('.abas-editor button[data-aba]');

  // Botão "Link": escreve [[ onde está o cursor, e aí aparecem as sugestões
  form.querySelector('.btn-link').addEventListener('click', () => {
    if (textarea.hidden) abas[0].click();
    textarea.focus();
    textarea.setRangeText('[[', textarea.selectionStart, textarea.selectionEnd, 'end');
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  });

  // Botão "Imagem": envia a imagem e escreve ![](endereço) onde está o cursor
  const inputImagemTexto = form.querySelector('.btn-imagem-texto input');
  inputImagemTexto.addEventListener('change', async () => {
    const arquivo = inputImagemTexto.files[0];
    inputImagemTexto.value = '';
    if (!arquivo) return;
    if (textarea.hidden) abas[0].click();
    const rotulo = form.querySelector('.btn-imagem-texto');
    rotulo.classList.add('enviando');
    try {
      const url = await banco.enviarImagemDoTexto(await redimensionarImagem(arquivo, 1600));
      const antes = textarea.value.slice(0, textarea.selectionStart);
      const quebra = antes && !antes.endsWith('\n') ? '\n\n' : '';
      textarea.setRangeText(`${quebra}![](${url})\n\n`, textarea.selectionStart, textarea.selectionEnd, 'end');
      textarea.focus();
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    } catch (e) {
      erro.textContent = e.message;
    } finally {
      rotulo.classList.remove('enviando');
    }
  });

  abas.forEach(aba => aba.addEventListener('click', () => {
    const ver = aba.dataset.aba === 'ver';
    abas.forEach(b => b.classList.toggle('ativo', b === aba));
    if (ver) {
      previa.innerHTML = textarea.value.trim()
        ? renderizarTexto(textarea.value, titulos)
        : '<p class="sem-texto">Nada escrito ainda.</p>';
    }
    textarea.hidden = ver;
    previa.hidden = !ver;
  }));

  form.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      form.requestSubmit();
    }
  });

  document.getElementById('btn-cancelar').addEventListener('click', () => {
    if ((alterado || campoImagem.mudou()) && !confirm('Descartar o que você mudou?')) return;
    alterado = false;
    window.salvarAlteracoes = null;
    if (artigo) desenharTexto();
    else location.href = s.pagina;
  });

  // Grava o que está no editor; devolve true se deu certo (o erro aparece no próprio editor)
  function gravar() {
    erro.textContent = '';
    const detalhes = {};
    for (const c of s.campos) detalhes[c.chave] = form[`d-${c.chave}`].value;
    const paisId = paisEscolhido() || null;
    const capitalId = ehPaisAgora() ? form.capital.value || null : null;
    const dados = { secao, titulo: form.titulo.value, subtitulo: form.subtitulo.value, conteudo: textarea.value, detalhes, paisId };

    return semCliqueDuplo(form, async () => {
      try {
        // Guarda em "artigo" logo depois de salvar: se a imagem falhar, tentar de novo não cria outro texto
        artigo = artigo
          ? await banco.salvarArtigo(artigo.id, dados, artigo.atualizadoEm)
          : await banco.criarArtigo(dados);
        if (pontoPendente) {
          await banco.posicionar(artigo.id, pontoPendente.x, pontoPendente.y);
          pontoPendente = null;
        }
        if (temPonto && (estiloPonto.cor !== (artigo.mapaCor || '') || estiloPonto.icone !== (artigo.mapaIcone || ''))) {
          await banco.estilizarPonto(artigo.id, estiloPonto.cor, estiloPonto.icone);
        }
        // Líder: só grava se mudou aqui (para não desfazer o que alguém fez pela página do personagem).
        // Se o texto deixou de ter cargo (ex.: mudou de categoria), o cargo fica vago.
        const cargo = cargoAtual();
        if (cargo ? (lider?.id || null) !== liderInicial : artigo.liderId) {
          await banco.definirLider(artigo.id, cargo ? lider?.id || null : null);
        }
        // Líder de (personagem): põe este personagem no que entrou e tira do que saiu
        for (const l of lideraAgora.filter(x => !lideraAntes.some(y => y.id === x.id))) await banco.definirLider(l.id, artigo.id);
        for (const l of lideraAntes.filter(x => !lideraAgora.some(y => y.id === x.id))) await banco.definirLider(l.id, null);
        lideraAntes = [...lideraAgora];
        if (capitalId !== (artigo.capitalId || null)) await banco.definirCapital(artigo.id, capitalId);
        await campoImagem.salvar(artigo.id);
        alterado = false;
        return true;
      } catch (err) {
        erro.textContent = err.message;
        return false;
      }
    });
  }

  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (await gravar()) location.replace(urlDoTexto(artigo.id));
  });

  // Usado pelo mapa ao clicar fora de um ponto: grava se tiver mudança, senão só deixa sair.
  // (Um texto novo em que nada foi escrito é só descartado.)
  window.salvarAlteracoes = async () => (alterado || campoImagem.mudou() ? gravar() : true);
}

// ---------- Histórico ----------

async function desenharHistorico() {
  edicao.marcar(null);
  pagina.innerHTML = '<p class="vazio">Carregando histórico…</p>';
  let versoes;
  try {
    // Recarrega o texto também, para "Versão atual" e "Restaurar" partirem da versão mais nova
    [versoes, artigo] = await Promise.all([banco.revisoes(artigo.id), banco.buscarArtigo(artigo.id)]);
  } catch (e) {
    pagina.innerHTML = `<p class="vazio">${esc(e.message)}</p>`;
    return;
  }

  document.title = `Histórico de ${artigo.titulo} - LuminusLore`;
  pagina.innerHTML = `
    <a class="voltar" href="#" id="voltar-texto">← ${esc(artigo.titulo)}</a>
    <div class="cabecalho-pagina">
      <div>
        <h1>Histórico</h1>
        <p class="descricao-secao">Cada vez que alguém salva, a versão anterior fica guardada aqui. O histórico nunca é apagado.</p>
      </div>
    </div>
    <ul class="historico" style="--cor: ${SECOES[secao].cor}">
      <li class="atual">
        <div class="cabeca">
          <strong>Versão atual</strong>
          <span>${esc(nomeDe(artigo.editadoPor, nomes))} · ${formatarDataHora(artigo.atualizadoEm)}</span>
        </div>
      </li>
      ${versoes.map((v, i) => `
        <li>
          <div class="cabeca">
            <strong>${esc(v.titulo)}${v.excluido ? ' <span class="selo-excluido">excluído aqui</span>' : ''}</strong>
            <span>${esc(nomeDe(v.editadoPor, nomes))} · ${formatarDataHora(v.editadoEm)}${v.excluido
              ? ` · excluído por ${esc(nomeDe(v.excluidoPor, nomes))} em ${formatarDataHora(v.excluidoEm)}` : ''}</span>
          </div>
          <div class="acoes">
            <button class="pequeno" data-ver="${i}">Ver</button>
            <button class="pequeno" data-restaurar="${i}">Restaurar esta versão</button>
          </div>
          <div class="prosa versao" hidden></div>
        </li>
      `).join('')}
    </ul>
    ${versoes.length ? '' : '<p class="vazio">Nenhuma versão anterior ainda.</p>'}
  `;

  document.getElementById('voltar-texto').addEventListener('click', e => {
    e.preventDefault();
    desenharTexto();
  });

  pagina.querySelector('.historico').addEventListener('click', async e => {
    const botao = e.target.closest('button');
    if (!botao) return;

    if (botao.dataset.ver) {
      const v = versoes[botao.dataset.ver];
      const caixa = botao.closest('li').querySelector('.versao');
      if (caixa.hidden) {
        caixa.innerHTML = (v.subtitulo ? `<p class="subtitulo">${esc(v.subtitulo)}</p>` : '')
          + (v.conteudo ? renderizarTexto(v.conteudo, titulos) : '<p class="sem-texto">(sem texto)</p>');
      }
      caixa.hidden = !caixa.hidden;
      botao.textContent = caixa.hidden ? 'Ver' : 'Esconder';
      return;
    }

    const v = versoes[botao.dataset.restaurar];
    if (!confirm(`Voltar o texto para a versão de ${formatarDataHora(v.editadoEm)}?\n\nA versão atual continua guardada no histórico.`)) return;
    try {
      // O histórico guarda só o texto: o país continua o atual
      artigo = await banco.salvarArtigo(artigo.id, { ...v, secao, paisId: artigo.paisId }, artigo.atualizadoEm);
      titulos = await banco.titulos();
      desenharTexto();
    } catch (err) {
      alert(err.message);
    }
  });
}

// ---------- Excluir ----------

async function excluir() {
  if (!confirm(`Excluir “${artigo.titulo}”?\n\nEle sai do site, mas fica em “Textos excluídos” (no fim da lista de ${SECOES[secao].nome}) e pode ser restaurado com todo o histórico.`)) return;
  try {
    await banco.excluirArtigo(artigo.id);
    if (modoPais) fecharFichaDoPais();
    else location.href = SECOES[secao].pagina;
  } catch (e) {
    alert(e.message);
  }
}

iniciar();
