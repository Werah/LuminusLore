// Página de um texto: ler, editar, ver o histórico.
//   artigo.html?id=...                  abre o texto
//   artigo.html?secao=mundo&titulo=...  escreve um texto novo (o título é opcional)
//   artigo.html?titulo=...              usado pelos links [[Título]]: abre o texto com esse título,
//                                       ou oferece criar se ainda não existir
//   artigo.html?secao=mundo&x=..&y=..   texto novo que já nasce com ponto no mapa (vem do mapa.html)
// Textos de seção com mapa (Mundo) abrem no painel do mapa.html.

exigirLogin();
montarTopo('');

const params = new URLSearchParams(location.search);
const pagina = document.getElementById('pagina');

let artigo = null;       // texto aberto; null enquanto um texto novo não foi salvo
let secao = '';          // chave em SECOES
let titulos = new Map(); // de banco.titulos(), para os [[links]]
let nomes = new Map();   // e-mail -> nome de quem escreveu
let alterado = false;    // tem mudança não salva no editor

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

  const ficha = s.campos
    .filter(c => artigo.detalhes[c.chave])
    .map(c => `<div><dt>${esc(c.rotulo)}</dt><dd>${linhaComLinks(artigo.detalhes[c.chave], titulos)}</dd></div>`)
    .join('');
  const temFicha = artigo.imagem || ficha;

  pagina.innerHTML = `
    <a class="voltar" href="${s.pagina}">← ${esc(s.nome)}</a>
    <article class="artigo" style="--cor: ${s.cor}">
      <header class="cabeca-artigo">
        <div>
          <p class="secao-artigo">${s.icone} ${esc(s.nome)}</p>
          <h1>${esc(artigo.titulo)}</h1>
          ${artigo.subtitulo ? `<p class="subtitulo">${esc(artigo.subtitulo)}</p>` : ''}
        </div>
        <div class="acoes">
          <button class="primario" id="btn-editar">Editar</button>
          <button id="btn-historico">Histórico</button>
          <button class="perigo" id="btn-excluir">Excluir</button>
        </div>
      </header>

      <div class="corpo-artigo${temFicha ? '' : ' sem-ficha'}">
        ${temFicha ? `
          <aside class="ficha">
            ${artigo.imagem ? `<img src="${banco.urlImagem(artigo.imagem)}" alt="">` : ''}
            ${ficha ? `<dl>${ficha}</dl>` : ''}
          </aside>` : ''}
        <div class="prosa">
          ${artigo.conteudo
            ? renderizarTexto(artigo.conteudo, titulos)
            : '<p class="sem-texto">Ainda não tem nada escrito aqui. Clique em <strong>Editar</strong> para começar.</p>'}
        </div>
      </div>

      <footer class="assinatura">
        Criado por <strong>${esc(nomeDe(artigo.criadoPor, nomes))}</strong> em ${formatarData(artigo.criadoEm)}
        · Última edição por <strong>${esc(nomeDe(artigo.editadoPor, nomes))}</strong> em ${formatarDataHora(artigo.atualizadoEm)}
      </footer>
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
  const a = artigo || { titulo: tituloInicial, subtitulo: '', conteudo: '', detalhes: {}, imagem: '' };
  document.title = `${artigo ? `Editando ${artigo.titulo}` : s.novo} - LuminusLore`;
  avisarMapa(artigo);

  // Texto novo criado com o botão direito no mapa: já nasce com o ponto
  const pontoNovo = !artigo && params.has('x') && params.has('y')
    ? { x: Number(params.get('x')), y: Number(params.get('y')) }
    : null;

  const campos = s.campos.map(c => {
    const valor = a.detalhes[c.chave] || '';
    if (c.opcoes) {
      // Valor antigo que saiu da lista de opções continua aparecendo
      const opcoes = !valor || c.opcoes.includes(valor) ? c.opcoes : [...c.opcoes, valor];
      return `
        <label>${esc(c.rotulo)}
          <select name="d-${c.chave}">
            <option value="">—</option>
            ${opcoes.map(o => `<option${o === valor ? ' selected' : ''}>${esc(o)}</option>`).join('')}
          </select>
        </label>`;
    }
    return `
      <label>${esc(c.rotulo)}
        <input type="text" name="d-${c.chave}" value="${esc(valor)}" placeholder="${esc(c.dica || '')}">
      </label>`;
  }).join('');

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

      ${campos ? `<div class="grade-campos">${campos}</div>` : ''}

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
        <div class="abas abas-editor">
          <button type="button" class="ativo" data-aba="escrever">Escrever</button>
          <button type="button" data-aba="ver">Pré-visualizar</button>
          <button type="button" class="btn-link" title="Link para outro texto">🔗 Link</button>
        </div>
        <textarea name="conteudo" class="texto-grande" placeholder="Escreva aqui…">${esc(a.conteudo)}</textarea>
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
  if (!artigo) form.titulo.focus();

  // Digitar [[ sugere os títulos (no texto e nos campos da ficha, que também aceitam links)
  ligarSugestaoDeLinks(textarea, titulos);
  form.querySelectorAll('input[name^="d-"]').forEach(campo => ligarSugestaoDeLinks(campo, titulos));

  // Escrever / Pré-visualizar
  const abas = form.querySelectorAll('.abas-editor button[data-aba]');

  // Botão "Link": escreve [[ onde está o cursor, e aí aparecem as sugestões
  form.querySelector('.btn-link').addEventListener('click', () => {
    if (textarea.hidden) abas[0].click();
    textarea.focus();
    textarea.setRangeText('[[', textarea.selectionStart, textarea.selectionEnd, 'end');
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
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
    if (artigo) desenharTexto();
    else location.href = s.pagina;
  });

  form.addEventListener('submit', e => {
    e.preventDefault();
    erro.textContent = '';
    const detalhes = {};
    for (const c of s.campos) detalhes[c.chave] = form[`d-${c.chave}`].value;
    const dados = { secao, titulo: form.titulo.value, subtitulo: form.subtitulo.value, conteudo: textarea.value, detalhes };

    semCliqueDuplo(form, async () => {
      try {
        // Guarda em "artigo" logo depois de salvar: se a imagem falhar, tentar de novo não cria outro texto
        const novo = !artigo;
        artigo = artigo
          ? await banco.salvarArtigo(artigo.id, dados, artigo.atualizadoEm)
          : await banco.criarArtigo(dados);
        if (novo && pontoNovo) await banco.posicionar(artigo.id, pontoNovo.x, pontoNovo.y);
        await campoImagem.salvar(artigo.id);
        alterado = false;
        location.replace(`artigo.html?id=${encodeURIComponent(artigo.id)}`);
      } catch (err) {
        erro.textContent = err.message;
      }
    });
  });
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
      artigo = await banco.salvarArtigo(artigo.id, { ...v, secao }, artigo.atualizadoEm);
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
    location.href = SECOES[secao].pagina;
  } catch (e) {
    alert(e.message);
  }
}

iniciar();
