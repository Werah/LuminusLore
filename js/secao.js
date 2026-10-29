// Página de uma seção (mundo.html, panteao.html, organizacoes.html).
// Qual seção é vem do <body data-secao="...">.

exigirLogin();

const chave = document.body.dataset.secao;
const SECAO = SECOES[chave];
// Seção com mapa (Mundo): a lista aparece no painel de texto do mapa
if (SECAO.mapa && !embutido) location.replace(SECAO.mapa.pagina);
montarTopo(SECAO.nome);
avisarMapa(null);

const lista = document.getElementById('lista');
const filtros = document.getElementById('filtros');
const busca = document.getElementById('busca');
const ordem = document.getElementById('ordem');

// O primeiro campo com opções (categoria, hierarquia, tipo) vira filtro
const campoFiltro = SECAO.campos.find(c => c.opcoes);

let artigos = [];
let nomes = new Map();
let filtro = ''; // valor escolhido no filtro ('' = todos)

// Filtro em abas (ex.: NPCs | Personagens): sempre tem uma escolhida, e o navegador lembra qual.
// Texto sem valor no campo conta como da primeira aba.
const abas = campoFiltro?.abas;
const CHAVE_ABA = `luminus-aba-${chave}`;
if (abas) {
  filtro = Object.keys(abas)[0];
  try {
    const salva = localStorage.getItem(CHAVE_ABA);
    if (salva in abas) filtro = salva;
  } catch {
    // Sem armazenamento: começa na primeira aba
  }
}

// Filtro por país (nacionalidade): '' = todos, SEM_PAIS = sem país, ou o id do país
const SEM_PAIS = '-';
let filtroPais = '';
let paises = [];

// No Mundo, os países (pontos de estrela no mapa) viram pastas com os textos que pertencem a eles,
// e o que não pertence a nenhum fica na pasta "Outros". Os países não aparecem como cards.
const comPastas = !!SECAO.mapa;
const ehPasta = a => comPastas && ehPais(a) && a.mapaX !== null;
const CHAVE_FECHADAS = 'luminus-pastas-fechadas';
let fechadas = new Set(); // pastas recolhidas (id do país, ou "outros"); fica guardado no navegador
try {
  fechadas = new Set(JSON.parse(localStorage.getItem(CHAVE_FECHADAS) || '[]'));
} catch {
  // Sem armazenamento: todas abertas
}
lista.classList.toggle('grade', !comPastas && !SECAO.linhaDoTempo);
lista.classList.toggle('pastas', comPastas);
document.body.classList.toggle('com-pastas', comPastas);

// Linha do tempo (História): ordenada pela era (na ordem das opções do campo "era") e pelo ano
if (SECAO.linhaDoTempo) {
  ordem.innerHTML = `
    <option value="cronologica">Mais antigo primeiro</option>
    <option value="inversa">Mais recente primeiro</option>
    <option value="recentes">Editados por último</option>
  `;
}
const campoEra = SECAO.campos.find(c => c.chave === 'era');
const posicaoEra = a => {
  const i = campoEra?.opcoes.indexOf(a.detalhes.era) ?? -1;
  return i < 0 ? Infinity : i;
};
const anoDe = a => (a.detalhes.ano ? Number(a.detalhes.ano) : Infinity);
const cronologia = (a, b) => posicaoEra(a) - posicaoEra(b) || anoDe(a) - anoDe(b) || a.titulo.localeCompare(b.titulo);

document.documentElement.style.setProperty('--cor-secao', SECAO.cor);
document.getElementById('titulo-secao').innerHTML = `<span class="icone-secao">${SECAO.icone}</span> ${esc(SECAO.nome)}`;
document.getElementById('descricao-secao').textContent = SECAO.descricao;
const btnNovo = document.getElementById('btn-novo');
btnNovo.textContent = `+ ${SECAO.novo}`;
btnNovo.href = `artigo.html?secao=${chave}`;

async function carregar() {
  try {
    [artigos, nomes, paises] = await Promise.all([
      banco.listarArtigos(chave), banco.nomes(), SECAO.filtroPais ? banco.paises() : [],
    ]);
    desenharFiltroPais();
    desenharFiltros();
    desenhar();
    carregarExcluidos();
  } catch (e) {
    lista.innerHTML = `<p class="vazio">${esc(e.message)}</p>`;
  }
}

// ---------- Textos excluídos ----------

// No fim da lista: os textos excluídos desta seção, com o botão de restaurar.
// (O banco guarda uma cópia de tudo ao excluir; o histórico nunca é apagado.)
lista.insertAdjacentHTML('afterend', '<details class="lixeira" id="lixeira" hidden></details>');
const lixeira = document.getElementById('lixeira');
let excluidos = [];

async function carregarExcluidos() {
  try {
    excluidos = await banco.excluidos(chave);
  } catch {
    return; // Não é essencial: se falhar, só não mostra
  }
  lixeira.hidden = !excluidos.length;
  lixeira.innerHTML = `
    <summary>🗑 Textos excluídos <span class="qtd">${excluidos.length}</span></summary>
    <ul>${excluidos.map((r, i) => {
      const resumo = resumoTexto(r.linha.conteudo || '', 220);
      return `
        <li>
          <div class="cabeca">
            <strong>${esc(r.titulo)}</strong>
            <span>excluído por ${esc(nomeDe(r.excluidoPor, nomes))} em ${formatarDataHora(r.excluidoEm)}</span>
          </div>
          ${r.linha.subtitulo ? `<p class="subtitulo">${esc(r.linha.subtitulo)}</p>` : ''}
          ${resumo ? `<p class="resumo">${esc(resumo)}</p>` : ''}
          <button class="pequeno" data-restaurar="${i}">Restaurar</button>
        </li>`;
    }).join('')}</ul>
  `;
}

lixeira.addEventListener('click', async e => {
  const botao = e.target.closest('[data-restaurar]');
  if (!botao) return;
  const r = excluidos[botao.dataset.restaurar];
  if (!confirm(`Restaurar “${r.titulo}”? Ele volta com o histórico, a imagem e o ponto no mapa.`)) return;
  botao.disabled = true;
  try {
    const id = await banco.restaurarExcluido(r.id);
    location.href = `artigo.html?id=${encodeURIComponent(id)}`;
  } catch (err) {
    alert(err.message);
    botao.disabled = false;
  }
});

function valorFiltro(a) {
  if (!campoFiltro) return '';
  return a.detalhes[campoFiltro.chave] || (abas ? Object.keys(abas)[0] : '');
}

const passaNoPais = a => !filtroPais || (filtroPais === SEM_PAIS ? !a.paisId : a.paisId === filtroPais);

function desenharFiltros() {
  if (!campoFiltro) return;
  const contagem = new Map();
  const itens = artigos.filter(a => !ehPasta(a) && passaNoPais(a)); // países não contam: são as pastas
  for (const a of itens) {
    const v = valorFiltro(a);
    if (v) contagem.set(v, (contagem.get(v) || 0) + 1);
  }

  if (abas) {
    filtros.classList.add('abas-filtro');
    filtros.innerHTML = Object.entries(abas).map(([v, rotulo]) => `
      <button class="${v === filtro ? 'ativo' : ''}" data-valor="${esc(v)}" role="tab" aria-selected="${v === filtro}">
        ${esc(rotulo)} <span class="qtd">${contagem.get(v) || 0}</span>
      </button>
    `).join('');
    return;
  }

  // Na ordem das opções; valores antigos que não estão mais nas opções vão pro fim
  const posicao = v => (campoFiltro.opcoes.includes(v) ? campoFiltro.opcoes.indexOf(v) : Infinity);
  const valores = [...contagem.keys()].sort((a, b) => posicao(a) - posicao(b) || a.localeCompare(b));
  if (!valores.length) {
    filtros.innerHTML = '';
    return;
  }
  filtros.innerHTML = [['', 'Todos', itens.length], ...valores.map(v => [v, v, contagem.get(v)])]
    .map(([v, rotulo, n]) => `
      <button class="${v === filtro ? 'ativo' : ''}" data-valor="${esc(v)}">${esc(rotulo)} <span class="qtd">${n}</span></button>
    `).join('');
}

// Resumo do card: o texto principal ou, sem ele, o primeiro campo longo preenchido (ex.: Descrição)
const resumoDe = a => a.conteudo || SECAO.campos.filter(c => c.longo).map(c => a.detalhes[c.chave]).find(Boolean) || '';

// Selo "✎ Ana editando" nos cards dos textos que alguém está editando agora
let meuEmail = '';
emailAtual().then(e => { meuEmail = e; });
edicao.ouvir(() => {
  if (artigos.length) desenhar();
});

function card(a, cor) {
  const resumo = resumoDe(a);
  const editores = edicao.agora(a.id);
  return `
    <a class="card clicavel artigo-card" href="artigo.html?id=${encodeURIComponent(a.id)}" style="--cor: ${cor}">
      ${capaArtigo(a)}
      <div class="corpo-card">
        <div class="linha-titulo">
          <h3>${esc(a.titulo)}</h3>
          ${valorFiltro(a) && !abas ? `<span class="selo">${esc(valorFiltro(a))}</span>` : ''}
        </div>
        ${a.subtitulo ? `<p class="subtitulo">${esc(a.subtitulo)}</p>` : ''}
        ${resumo ? `<p class="descricao">${esc(resumoTexto(resumo))}</p>` : ''}
        <p class="info rodape-card">✎ ${esc(nomeDe(a.editadoPor, nomes))} · ${formatarData(a.atualizadoEm)}</p>
        ${editores.length ? `<p class="editando-agora">✎ ${esc(nomesEditando(editores, nomes, meuEmail))} editando agora</p>` : ''}
      </div>
    </a>
  `;
}

const passaNaBusca = (a, termo) => !termo
  || normalizar(`${a.titulo} ${a.subtitulo} ${Object.values(a.detalhes).join(' ')} ${a.conteudo}`).includes(termo);

function desenhar() {
  const termo = normalizar(busca.value.trim());
  const ordenar = l => (ordem.value === 'recentes' ? l.sort((a, b) => b.atualizadoEm.localeCompare(a.atualizadoEm)) : l);
  const itens = ordenar(artigos.filter(a => !ehPasta(a) && (!filtro || valorFiltro(a) === filtro) && passaNoPais(a)));

  if (!artigos.length) {
    lista.innerHTML = `<p class="vazio">Nenhum texto ainda. Que tal começar com <strong>${esc(SECAO.novo)}</strong>?</p>`;
    return;
  }

  if (comPastas) {
    desenharPastas(itens, termo);
    return;
  }

  if (SECAO.linhaDoTempo) {
    desenharLinhaDoTempo(itens.filter(a => passaNaBusca(a, termo)));
    return;
  }

  const visiveis = itens.filter(a => passaNaBusca(a, termo));
  lista.innerHTML = visiveis.length ? visiveis.map(a => card(a, SECAO.cor)).join('') : '<p class="vazio">Nada encontrado.</p>';
}

// "312", "312 – 340", "Data incerta"
function dataDoEvento(a) {
  const { ano, fim } = a.detalhes;
  if (!ano) return 'Data incerta';
  return fim && fim !== ano ? `${ano} – ${fim}` : ano;
}

// Eventos dos dois lados de uma linha vertical, com um marco a cada era nova
// (em "Editados por último" a ordem não é do tempo, então não tem marcos de era)
function desenharLinhaDoTempo(eventos) {
  if (!eventos.length) {
    lista.innerHTML = '<p class="vazio">Nada encontrado.</p>';
    return;
  }
  const porEra = ordem.value !== 'recentes';
  if (ordem.value === 'cronologica') eventos.sort(cronologia);
  if (ordem.value === 'inversa') eventos.sort((a, b) => cronologia(b, a));

  let eraAtual = null;
  let lado = 0;
  const html = eventos.map(a => {
    let marco = '';
    if (porEra && (a.detalhes.era || '') !== eraAtual) {
      eraAtual = a.detalhes.era || '';
      marco = `<h2 class="marco-era"><span>${esc(eraAtual || 'Sem era definida')}</span></h2>`;
    }
    const resumo = resumoDe(a);
    return `${marco}
      <a class="evento ${lado++ % 2 ? 'direita' : 'esquerda'}" href="artigo.html?id=${encodeURIComponent(a.id)}">
        <span class="evento-data">${esc(dataDoEvento(a))}</span>
        <span class="evento-cartao">
          ${a.imagem ? `<img src="${banco.urlImagem(a.imagem)}" alt="" loading="lazy">` : ''}
          <span class="evento-texto">
            <strong>${esc(a.titulo)}</strong>
            ${a.subtitulo ? `<em>${esc(a.subtitulo)}</em>` : ''}
            ${resumo ? `<small>${esc(resumoTexto(resumo, 140))}</small>` : ''}
          </span>
        </span>
      </a>`;
  }).join('');
  lista.innerHTML = `<div class="linha-tempo" style="--cor: ${SECAO.cor}">${html}</div>`;
}

// Globo (círculo, linha do equador e um meridiano): abre a ficha do país
const ICONE_GLOBO = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">'
  + '<circle cx="12" cy="12" r="9.5"/><path d="M2.5 12h19M4 7.5h16M4 16.5h16"/>'
  + '<path d="M12 2.5c2.8 2.6 4.2 5.8 4.2 9.5s-1.4 6.9-4.2 9.5c-2.8-2.6-4.2-5.8-4.2-9.5S9.2 5.1 12 2.5z"/></svg>';

// Pastas: uma por país (A–Z) e "Outros" no fim. Buscando ou filtrando, só aparecem as pastas com
// resultado (ou o país cujo nome bate com a busca), já abertas.
function desenharPastas(itens, termo) {
  const paises = artigos.filter(ehPasta).sort((a, b) => a.titulo.localeCompare(b.titulo));
  const idsPaises = new Set(paises.map(p => p.id));
  const procurando = !!termo || !!filtro;

  const grupos = paises.map(p => {
    const dele = itens.filter(a => a.paisId === p.id);
    const nomeBate = !!termo && normalizar(p.titulo).includes(termo);
    return { id: p.id, pais: p, itens: nomeBate ? dele : dele.filter(a => passaNaBusca(a, termo)), nomeBate };
  });
  grupos.push({ id: 'outros', pais: null, itens: itens.filter(a => !idsPaises.has(a.paisId) && passaNaBusca(a, termo)) });

  const mostrar = grupos.filter(g => (procurando ? g.itens.length || g.nomeBate : g.pais || g.itens.length));
  if (!mostrar.length) {
    lista.innerHTML = '<p class="vazio">Nada encontrado.</p>';
    return;
  }

  lista.innerHTML = mostrar.map(g => {
    const cor = g.pais ? g.pais.mapaCor || SECAO.cor : '#6b6478';
    const aberta = procurando || !fechadas.has(g.id);
    return `
      <section class="pasta${aberta ? ' aberta' : ''}${g.pais ? '' : ' outros'}" style="--cor: ${cor}">
        <div class="pasta-cabeca" data-pasta="${esc(g.id)}" role="button" tabindex="0" aria-expanded="${aberta}">
          ${g.pais
            ? `<button type="button" class="pasta-globo" data-info="${esc(g.id)}" title="Ficha de ${esc(g.pais.titulo)}" aria-label="Ficha de ${esc(g.pais.titulo)}">${ICONE_GLOBO}</button>`
            : '<span class="pasta-globo vazio" aria-hidden="true"></span>'}
          <h2>${g.pais ? esc(g.pais.titulo) : 'Outros'}</h2>
          <span class="pasta-qtd">${g.itens.length}</span>
          <span class="pasta-seta" aria-hidden="true">▾</span>
        </div>
        <div class="pasta-itens">
          ${g.itens.length
            ? `<div class="grade">${g.itens.map(a => card(a, cor)).join('')}</div>`
            : `<p class="pasta-vazia">${g.pais ? 'Nenhum lugar neste país ainda. No editor de um ponto de interesse, escolha este país no campo “País”.' : 'Nada aqui.'}</p>`}
        </div>
      </section>
    `;
  }).join('');
}

function alternarPasta(id) {
  if (fechadas.has(id)) fechadas.delete(id);
  else fechadas.add(id);
  try {
    localStorage.setItem(CHAVE_FECHADAS, JSON.stringify([...fechadas]));
  } catch {
    // Sem armazenamento: só não lembra da próxima vez
  }
  desenhar();
}

// O globo abre a ficha do país por cima do mapa (fora do mapa, abre a página do país)
function abrirFichaPais(id) {
  if (embutido) window.parent.postMessage({ tipo: 'abrir-pais', id }, location.origin);
  else location.href = `artigo.html?id=${encodeURIComponent(id)}`;
}

lista.addEventListener('click', e => {
  const info = e.target.closest('[data-info]');
  if (info) {
    abrirFichaPais(info.dataset.info);
    return;
  }
  const cabeca = e.target.closest('[data-pasta]');
  if (cabeca && !busca.value.trim() && !filtro) alternarPasta(cabeca.dataset.pasta);
});
lista.addEventListener('keydown', e => {
  const cabeca = e.target.closest?.('[data-pasta]');
  if (!cabeca || e.target !== cabeca || (e.key !== 'Enter' && e.key !== ' ')) return;
  e.preventDefault();
  if (!busca.value.trim() && !filtro) alternarPasta(cabeca.dataset.pasta);
});

filtros.addEventListener('click', e => {
  const botao = e.target.closest('button');
  if (!botao) return;
  filtro = botao.dataset.valor;
  if (abas) {
    try {
      localStorage.setItem(CHAVE_ABA, filtro);
    } catch {
      // Sem armazenamento: só não lembra da próxima vez
    }
  }
  desenharFiltros();
  desenhar();
});
busca.addEventListener('input', desenhar);
ordem.addEventListener('change', desenhar);

// ---------- Filtro por país ----------

// Botão com o globo ao lado da ordem: "Todos os países", cada país, ou "Sem <país>"
let seletorPais = null;
if (SECAO.filtroPais) {
  const rotulo = SECAO.rotuloPais || 'País';
  ordem.insertAdjacentHTML('beforebegin', `
    <label class="filtro-pais" title="Filtrar por ${esc(rotulo.toLowerCase())}">
      ${ICONE_GLOBO}
      <select id="filtro-pais" aria-label="Filtrar por ${esc(rotulo.toLowerCase())}"></select>
    </label>
  `);
  seletorPais = document.getElementById('filtro-pais');
  seletorPais.addEventListener('change', () => {
    filtroPais = seletorPais.value;
    seletorPais.parentElement.classList.toggle('ativo', !!filtroPais);
    desenharFiltros();
    desenhar();
  });
}

function desenharFiltroPais() {
  if (!seletorPais) return;
  const rotulo = (SECAO.rotuloPais || 'País').toLowerCase();
  seletorPais.innerHTML = `
    <option value="">Todos os países</option>
    ${paises.map(p => `<option value="${esc(p.id)}">${esc(p.titulo)}</option>`).join('')}
    <option value="${SEM_PAIS}">Sem ${esc(rotulo)}</option>
  `;
  seletorPais.value = filtroPais;
}

carregar();
