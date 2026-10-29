// Página de um texto: ler, editar, ver o histórico.
//   artigo.html?id=...                  abre o texto
//   artigo.html?secao=mundo&titulo=...  escreve um texto novo (o título é opcional)
//   artigo.html?titulo=...              usado pelos links [[Título]]: abre o texto com esse título,
//                                       ou oferece criar se ainda não existir
//   artigo.html?secao=mundo&x=..&y=..   texto novo que já nasce com ponto no mapa (vem do mapa.html)
//   artigo.html?id=...&modo=pais        ficha do país, aberta por cima do mapa (ícone ⓘ da lista do Mundo)
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

  const pais = artigo.paisId && [...titulos.values()].find(t => t.id === artigo.paisId);
  const preenchidos = s.campos.filter(c => artigo.detalhes[c.chave] && campoVisivel(c, artigo.detalhes));
  const ficha = (pais ? `<div><dt>${esc(s.rotuloPais || 'País')}</dt><dd>${linkWiki(pais.titulo, '', titulos)}</dd></div>` : '')
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
        ${artigo.imagem ? `<img class="fundo-capa" src="${banco.urlImagem(artigo.imagem)}" alt="">` : ''}
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
    <article class="artigo" style="--cor: ${s.cor}">
      ${cabeca}

      <div class="corpo-artigo${temFicha ? '' : ' sem-ficha'}">
        ${temFicha ? `
          <aside class="ficha">
            ${imagemNaFicha ? `<img src="${banco.urlImagem(artigo.imagem)}" alt="">` : ''}
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
            ${esc(l.titulo)}
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
    const lista = await banco.mencoes(artigo.titulo, artigo.id);
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
  pagina.innerHTML = `
    <div class="vazio caixa-inexistente">
      <h2>“${esc(titulo)}” ainda não foi escrito</h2>
      <p>Quer começar? Escolha onde ele fica:</p>
      <div class="acoes-centro">
        ${Object.entries(SECOES).map(([k, s]) => `
          <a class="botao" href="artigo.html?secao=${k}&titulo=${encodeURIComponent(titulo)}">${s.icone} ${esc(s.nome)}</a>
        `).join('')}
      </div>
    </div>
  `;
}

// ---------- Editar ----------

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
      ${pontoNovo ? '<p class="aviso-ponto">📍 Este texto vai ficar no ponto que você marcou no mapa.</p>' : ''}

      <div class="duas-colunas">
        <label>Título*
          <input type="text" name="titulo" required maxlength="120" value="${esc(a.titulo)}">
        </label>
        <label>${esc(s.subtitulo.rotulo)}
          <input type="text" name="subtitulo" maxlength="200" value="${esc(a.subtitulo)}" placeholder="${esc(s.subtitulo.dica)}">
        </label>
      </div>

      <div class="grade-campos">
        <label>${esc(s.rotuloPais || 'País')}
          <span class="campo-pais">
            <select name="pais">
              <option value="">Nenhum (região neutra)</option>
              ${a.paisId ? `<option value="${esc(a.paisId)}" selected>Carregando…</option>` : ''}
            </select>
            <span class="amostra-cor" title="Cor que o ponto herda no mapa" hidden></span>
          </span>
        </label>
        ${campos}
      </div>
      ${camposLongos}

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

      <div class="campo">Imagem
        <div class="campo-imagem">
          <div class="preview-imagem"></div>
          <div class="botoes-imagem">
            <label class="botao">Escolher imagem <input type="file" accept="image/*" hidden></label>
            <button type="button" class="pequeno perigo btn-remover-imagem">Remover</button>
          </div>
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
  const campoImagem = ligarCampoImagem(form.querySelector('.campo-imagem'), () => emblemaSecao(secao));
  campoImagem.iniciar(a.imagem);

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
  function desenharPonto() {
    if (!caixaPonto) return;
    const herdada = selPais.selectedOptions[0]?.dataset.cor || s.cor;
    const cor = estiloPonto.cor || herdada;
    caixaPonto.querySelector('.icones-ponto').style.setProperty('--cor', cor);
    caixaPonto.querySelectorAll('[data-icone]').forEach(b => b.classList.toggle('ativo', b.dataset.icone === estiloPonto.icone));
    form['mapa-cor'].value = cor;
    const padrao = caixaPonto.querySelector('[data-acao="cor-padrao"]');
    padrao.textContent = selPais.value ? 'Usar cor do país' : 'Usar cor da seção';
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
    const paisId = form.pais.value || null;
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
        <p class="descricao-secao">Cada vez que alguém salva, a versão anterior fica guardada aqui.</p>
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
            <strong>${esc(v.titulo)}</strong>
            <span>${esc(nomeDe(v.editadoPor, nomes))} · ${formatarDataHora(v.editadoEm)}</span>
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
  if (!confirm(`Excluir “${artigo.titulo}”?\n\nO histórico dele também é apagado. Não dá para desfazer.`)) return;
  try {
    await banco.excluirArtigo(artigo.id);
    if (modoPais) fecharFichaDoPais();
    else location.href = SECOES[secao].pagina;
  } catch (e) {
    alert(e.message);
  }
}

iniciar();
