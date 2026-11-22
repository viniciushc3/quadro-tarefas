/**
 * ============================================================
 *  QUADRO DE TAREFAS, RECOMPENSAS E MESADA  —  BACKEND
 *  Google Apps Script (Web App / JSON API)
 * ============================================================
 *
 *  COMO IMPLANTAR (resumo — detalhes no README.md):
 *   1. Abra sua Planilha Google > Extensões > Apps Script.
 *   2. Cole este arquivo inteiro em "Code.gs" e salve.
 *   3. Rode a função setupPlanilha() uma vez (autorize o acesso).
 *   4. Implantar > Nova implantação > Tipo: "App da Web"
 *        - Executar como: Eu
 *        - Quem tem acesso: Qualquer pessoa
 *   5. Copie a URL /exec e cole em API_URL no app.js.
 *
 *  OBSERVAÇÕES DE ARQUITETURA
 *   - CORS: respostas GET/POST do Apps Script já são servidas com
 *     Access-Control-Allow-Origin: *. O front-end envia POST com
 *     Content-Type "text/plain" (requisição "simples") para evitar
 *     o preflight OPTIONS, que o Apps Script não responde.
 *     Há também suporte a JSONP (?callback=...) como plano B.
 *   - IDEMPOTÊNCIA: o cliente gera o `id` do registro (UUID). Se o
 *     mesmo id chegar duas vezes (retry da fila offline), o servidor
 *     apenas devolve o registro existente. Isso torna a fila de
 *     sincronização segura para reenvio.
 *   - RESGATES da lojinha são gravados na aba `registros` usando
 *     tarefa_id = "rec:<id_da_recompensa>" e pontos_ganhos negativo,
 *     mantendo a estrutura de 4 abas pedida.
 */

/* ============================================================
 *  CONSTANTES
 * ============================================================ */

var ABAS = {
  tarefas: ['id', 'titulo', 'icone', 'tipo', 'pontos', 'periodo', 'recorrencia', 'dias', 'precisa_aprova', 'conta_mesada', 'ativa', 'criada_em', 'precisa_foto'],
  registros: ['id', 'data', 'tarefa_id', 'status', 'pontos_ganhos', 'aprovado_em', 'foto_url'],
  recompensas: ['id', 'titulo', 'icone', 'custo_pontos', 'ativa'],
  config: ['chave', 'valor']
};

var CONFIG_PADRAO = {
  pin_pais: '1234',
  valor_mesada_base: '40',
  valor_por_ponto: '0.10',
  nome_crianca: 'Minha filha',
  meta_pontos_semana: '50'
};

var PREFIXO_RESGATE = 'rec:';
var PASTA_FOTOS = 'Fotos_Tarefas';
var DIAS_RETENCAO_FOTOS = 30;
var TZ = Session.getScriptTimeZone() || 'America/Sao_Paulo';

/* ============================================================
 *  SETUP
 * ============================================================ */

/**
 * Cria as abas que estiverem faltando, com os cabeçalhos corretos,
 * e popula `config` com valores padrão. Pode rodar quantas vezes
 * quiser: não apaga nem duplica nada que já exista.
 */
function setupPlanilha() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var criadas = [];

  Object.keys(ABAS).forEach(function (nome) {
    var sh = ss.getSheetByName(nome);
    if (!sh) {
      sh = ss.insertSheet(nome);
      criadas.push(nome);
    }
    // Cria os cabeçalhos quando a aba está vazia e acrescenta as colunas
    // novas (precisa_foto, foto_url) quando a aba veio de uma versão anterior.
    _colunasConferidas[nome] = false;
    garantirColunas_(nome, sh);
  });

  // Config padrão (só preenche as chaves ausentes)
  var shConfig = ss.getSheetByName('config');
  var existentes = {};
  lerTabela_('config').forEach(function (r) { existentes[String(r.chave).trim()] = true; });
  Object.keys(CONFIG_PADRAO).forEach(function (k) {
    if (!existentes[k]) shConfig.appendRow([k, CONFIG_PADRAO[k]]);
  });

  // Exemplos de recompensa, apenas se a lojinha estiver vazia
  if (lerTabela_('recompensas').length === 0) {
    var shRec = ss.getSheetByName('recompensas');
    [
      ['30 min de tablet', '📱', 10],
      ['Escolher o filme da noite', '🍿', 15],
      ['Sorvete especial', '🍦', 25],
      ['Passeio no parque', '🎠', 40]
    ].forEach(function (r) {
      shRec.appendRow([novoId_(), r[0], r[1], r[2], 'sim']);
    });
  }

  // Exemplos de tarefa, apenas se não houver nenhuma
  if (lerTabela_('tarefas').length === 0) {
    var shT = ss.getSheetByName('tarefas');
    var hoje = agoraISO_();
    [
      ['Escovar os dentes', '🪥', 'basica', 0, 'manha', 'diaria', '', 'nao', 'sim', 'sim', 'nao'],
      ['Arrumar a cama', '🛏️', 'basica', 0, 'manha', 'diaria', '', 'nao', 'sim', 'sim', 'sim'],
      ['Fazer a lição de casa', '📚', 'basica', 0, 'tarde', 'semana', '', 'sim', 'sim', 'sim', 'sim'],
      ['Guardar os brinquedos', '🧸', 'basica', 0, 'noite', 'diaria', '', 'nao', 'sim', 'sim', 'nao'],
      ['Ajudar na louça', '🍽️', 'extra', 5, 'qualquer', 'diaria', '', 'sim', 'nao', 'sim', 'sim'],
      ['Ler 20 minutos', '📖', 'extra', 3, 'noite', 'diaria', '', 'nao', 'nao', 'sim', 'nao'],
      ['Regar as plantas', '🪴', 'extra', 2, 'qualquer', 'dias', '2,5', 'nao', 'nao', 'sim', 'nao']
    ].forEach(function (t) {
      shT.appendRow([novoId_(), t[0], t[1], t[2], t[3], t[4], t[5], t[6], t[7], t[8], t[9], hoje, t[10]]);
    });
  }

  return 'OK — abas criadas: ' + (criadas.length ? criadas.join(', ') : '(nenhuma, já existiam)');
}

/* ============================================================
 *  ROTEADOR HTTP
 * ============================================================ */

function doGet(e) {
  var p = (e && e.parameter) || {};
  var cb = p.callback || '';
  try {
    return responder_(executar_(p.action || 'bootstrap', p), cb);
  } catch (err) {
    return responder_({ ok: false, erro: String(err && err.message || err) }, cb);
  }
}

function doPost(e) {
  var body = {};
  try {
    if (e && e.postData && e.postData.contents) body = JSON.parse(e.postData.contents);
  } catch (err) {
    body = {};
  }
  var p = (e && e.parameter) || {};
  var payload = body.payload || body.dados || body || {};
  var acao = body.action || p.action;
  var cb = p.callback || '';
  try {
    return responder_(executar_(acao, payload), cb);
  } catch (err) {
    return responder_({ ok: false, erro: String(err && err.message || err) }, cb);
  }
}

function executar_(acao, p) {
  p = p || {};
  switch (acao) {
    /* ---------- leitura ---------- */
    case 'ping':            return { ok: true, pong: true, hora: agoraISO_() };
    case 'bootstrap':       return apiBootstrap_(p);
    case 'resumo_mesada':   return apiResumoMesada_(p);

    /* ---------- criança ---------- */
    case 'concluir':        return apiConcluir_(p);
    case 'enviar_foto':     return apiEnviarFoto_(p);
    case 'desfazer':        return apiDesfazer_(p);
    case 'resgatar':        return apiResgatar_(p);

    /* ---------- pais (exigem PIN) ---------- */
    case 'verificar_pin':   return { ok: true, valido: pinValido_(p.pin) };
    case 'aprovar':         exigirPin_(p); return apiDecidir_(p, 'aprovada');
    case 'rejeitar':        exigirPin_(p); return apiDecidir_(p, 'rejeitada');
    case 'salvar_tarefa':   exigirPin_(p); return apiSalvarTarefa_(p);
    case 'excluir_tarefa':  exigirPin_(p); return apiExcluir_('tarefas', p.id);
    case 'salvar_recompensa': exigirPin_(p); return apiSalvarRecompensa_(p);
    case 'excluir_recompensa': exigirPin_(p); return apiExcluir_('recompensas', p.id);
    case 'salvar_config':   exigirPin_(p); return apiSalvarConfig_(p);
    case 'setup':           exigirPin_(p); return { ok: true, msg: setupPlanilha() };
    case 'limpar_fotos':    exigirPin_(p); return { ok: true, msg: limparFotosAntigas() };
    default:
      throw new Error('Ação desconhecida: ' + acao);
  }
}

function responder_(obj, callback) {
  var txt = JSON.stringify(obj);
  if (callback) {
    return ContentService
      .createTextOutput(callback + '(' + txt + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService
    .createTextOutput(txt)
    .setMimeType(ContentService.MimeType.JSON);
}

/* ============================================================
 *  ENDPOINTS
 * ============================================================ */

/** Tudo que o app precisa para desenhar a tela, em 1 requisição. */
function apiBootstrap_(p) {
  var hoje = p.data || hojeISO_();
  var cfg = lerConfig_();
  var tarefas = lerTabela_('tarefas').map(normalizarTarefa_);
  var recompensas = lerTabela_('recompensas').map(normalizarRecompensa_);
  var registros = lerTabela_('registros').map(normalizarRegistro_);

  var pendentes = registros
    .filter(function (r) { return r.status === 'pendente_aprovacao'; })
    .map(function (r) { return enriquecerRegistro_(r, tarefas, recompensas); })
    .sort(function (a, b) { return a.data < b.data ? 1 : -1; });

  return {
    ok: true,
    hoje: hoje,
    config: configPublica_(cfg),
    tarefas: tarefas,
    recompensas: recompensas,
    registros_hoje: registros.filter(function (r) { return r.data === hoje; }),
    registros_recentes: registros.filter(function (r) { return r.data >= somarDias_(hoje, -45); }),
    pendentes: pendentes,
    saldo: calcularSaldo_(registros),
    streak: calcularStreak_(tarefas, registros, hoje),
    servidor_em: agoraISO_()
  };
}

/** Criança concluiu uma tarefa. `id` vem do cliente (idempotência). */
function apiConcluir_(p) {
  var tarefaId = String(p.tarefa_id || '');
  var data = p.data || hojeISO_();
  var id = p.id || novoId_();
  if (!tarefaId) throw new Error('tarefa_id obrigatório');

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var registros = lerTabela_('registros').map(normalizarRegistro_);

    // Idempotência: mesmo id, ou mesma tarefa no mesmo dia (não rejeitada)
    var existente = registros.filter(function (r) {
      if (r.id === id) return true;
      return r.tarefa_id === tarefaId && r.data === data && r.status !== 'rejeitada';
    })[0];
    if (existente) {
      // Reenvio da fila: se a foto ainda não subiu, aproveita esta tentativa.
      if (p.foto && !existente.foto_url) {
        var urlNova = salvarFoto_(p.foto, tarefaId, data);
        if (urlNova) {
          atualizarPorId_('registros', existente.id, { foto_url: urlNova });
          existente.foto_url = urlNova;
        }
      }
      return { ok: true, duplicado: true, registro: existente, saldo: calcularSaldo_(registros) };
    }

    var tarefa = lerTabela_('tarefas').map(normalizarTarefa_).filter(function (t) { return t.id === tarefaId; })[0];
    if (!tarefa) throw new Error('Tarefa não encontrada: ' + tarefaId);

    var pontos = tarefa.tipo === 'extra' ? tarefa.pontos : 0;
    var precisa = tarefa.precisa_aprova === 'sim';
    var novo = {
      id: id,
      data: data,
      tarefa_id: tarefaId,
      status: precisa ? 'pendente_aprovacao' : 'aprovada',
      pontos_ganhos: precisa ? 0 : pontos,
      aprovado_em: precisa ? '' : agoraISO_(),
      foto_url: salvarFoto_(p.foto, tarefaId, data)
    };
    inserirLinha_('registros', novo);

    var todos = registros.concat([novo]);
    return { ok: true, registro: novo, saldo: calcularSaldo_(todos) };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Sobe a foto de um registro que já existe (a fila do app envia a conclusão
 * primeiro, para a interface responder na hora, e a imagem em seguida).
 */
function apiEnviarFoto_(p) {
  var id = String(p.id || p.registro_id || '');
  if (!id) throw new Error('id do registro obrigatório');
  if (!p.foto) throw new Error('foto obrigatória');

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var reg = lerTabela_('registros').map(normalizarRegistro_).filter(function (r) { return r.id === id; })[0];
    if (!reg) throw new Error('Registro não encontrado');
    if (reg.foto_url) return { ok: true, duplicado: true, foto_url: reg.foto_url, registro: reg };

    var url = salvarFoto_(p.foto, reg.tarefa_id, reg.data);
    atualizarPorId_('registros', id, { foto_url: url });
    reg.foto_url = url;
    return { ok: true, foto_url: url, registro: reg };
  } finally {
    lock.releaseLock();
  }
}

/** Criança desmarcou a tarefa (só se ainda não foi aprovada por adulto). */
function apiDesfazer_(p) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var alvo = p.id ? { id: String(p.id) } : null;
    var registros = lerTabela_('registros').map(normalizarRegistro_);
    var reg = registros.filter(function (r) {
      if (alvo) return r.id === alvo.id;
      return r.tarefa_id === String(p.tarefa_id) && r.data === (p.data || hojeISO_());
    })[0];
    if (!reg) return { ok: true, inexistente: true, saldo: calcularSaldo_(registros) };

    excluirPorId_('registros', reg.id);
    var restantes = registros.filter(function (r) { return r.id !== reg.id; });
    return { ok: true, removido: reg.id, saldo: calcularSaldo_(restantes) };
  } finally {
    lock.releaseLock();
  }
}

/** Pedido de resgate na lojinha. */
function apiResgatar_(p) {
  var recId = String(p.recompensa_id || '');
  var id = p.id || novoId_();
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var registros = lerTabela_('registros').map(normalizarRegistro_);
    var dup = registros.filter(function (r) { return r.id === id; })[0];
    if (dup) return { ok: true, duplicado: true, registro: dup, saldo: calcularSaldo_(registros) };

    var rec = lerTabela_('recompensas').map(normalizarRecompensa_).filter(function (r) { return r.id === recId; })[0];
    if (!rec) throw new Error('Recompensa não encontrada');

    var saldo = calcularSaldo_(registros);
    if (saldo < rec.custo_pontos) throw new Error('Saldo insuficiente');

    var novo = {
      id: id,
      data: p.data || hojeISO_(),
      tarefa_id: PREFIXO_RESGATE + recId,
      status: 'pendente_aprovacao',
      pontos_ganhos: -rec.custo_pontos,
      aprovado_em: ''
    };
    inserirLinha_('registros', novo);
    return { ok: true, registro: novo, saldo: calcularSaldo_(registros.concat([novo])) };
  } finally {
    lock.releaseLock();
  }
}

/** Aprovar / rejeitar um registro pendente. */
function apiDecidir_(p, novoStatus) {
  var id = String(p.id || p.registro_id || '');
  if (!id) throw new Error('id do registro obrigatório');

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var registros = lerTabela_('registros').map(normalizarRegistro_);
    var reg = registros.filter(function (r) { return r.id === id; })[0];
    if (!reg) throw new Error('Registro não encontrado');

    var pontos = 0;
    if (novoStatus === 'aprovada') {
      if (ehResgate_(reg.tarefa_id)) {
        pontos = reg.pontos_ganhos; // já negativo
      } else {
        var t = lerTabela_('tarefas').map(normalizarTarefa_).filter(function (x) { return x.id === reg.tarefa_id; })[0];
        pontos = t && t.tipo === 'extra' ? t.pontos : 0;
      }
    }
    atualizarPorId_('registros', id, {
      status: novoStatus,
      pontos_ganhos: pontos,
      aprovado_em: agoraISO_()
    });

    reg.status = novoStatus;
    reg.pontos_ganhos = pontos;
    return { ok: true, registro: reg, saldo: calcularSaldo_(registros) };
  } finally {
    lock.releaseLock();
  }
}

function apiSalvarTarefa_(p) {
  var t = p.tarefa || p;
  var dados = {
    id: t.id || novoId_(),
    titulo: String(t.titulo || '').trim(),
    icone: t.icone || '⭐',
    tipo: t.tipo === 'extra' ? 'extra' : 'basica',
    pontos: Number(t.pontos) || 0,
    periodo: ['manha', 'tarde', 'noite', 'qualquer'].indexOf(t.periodo) >= 0 ? t.periodo : 'qualquer',
    recorrencia: ['diaria', 'semana', 'fimdesemana', 'dias'].indexOf(t.recorrencia) >= 0 ? t.recorrencia : 'diaria',
    dias: String(t.dias || ''),
    precisa_aprova: simNao_(t.precisa_aprova),
    conta_mesada: simNao_(t.conta_mesada),
    ativa: simNao_(t.ativa === undefined ? 'sim' : t.ativa),
    criada_em: t.criada_em || agoraISO_(),
    precisa_foto: simNao_(t.precisa_foto)
  };
  if (!dados.titulo) throw new Error('Título obrigatório');
  if (dados.tipo === 'basica') dados.pontos = 0;

  var existe = lerTabela_('tarefas').some(function (r) { return String(r.id) === dados.id; });
  if (existe) atualizarPorId_('tarefas', dados.id, dados);
  else inserirLinha_('tarefas', dados);

  return { ok: true, tarefa: normalizarTarefa_(dados) };
}

function apiSalvarRecompensa_(p) {
  var r = p.recompensa || p;
  var dados = {
    id: r.id || novoId_(),
    titulo: String(r.titulo || '').trim(),
    icone: r.icone || '🎁',
    custo_pontos: Number(r.custo_pontos) || 0,
    ativa: simNao_(r.ativa === undefined ? 'sim' : r.ativa)
  };
  if (!dados.titulo) throw new Error('Título obrigatório');

  var existe = lerTabela_('recompensas').some(function (x) { return String(x.id) === dados.id; });
  if (existe) atualizarPorId_('recompensas', dados.id, dados);
  else inserirLinha_('recompensas', dados);

  return { ok: true, recompensa: normalizarRecompensa_(dados) };
}

function apiExcluir_(aba, id) {
  if (!id) throw new Error('id obrigatório');
  excluirPorId_(aba, String(id));
  return { ok: true, excluido: String(id) };
}

function apiSalvarConfig_(p) {
  var itens = p.config || p.itens || {};
  var sh = aba_('config');
  var dados = lerTabela_('config');
  Object.keys(itens).forEach(function (chave) {
    var valor = String(itens[chave]);
    var idx = -1;
    for (var i = 0; i < dados.length; i++) {
      if (String(dados[i].chave).trim() === chave) { idx = i; break; }
    }
    if (idx >= 0) sh.getRange(idx + 2, 2).setValue(valor);
    else { sh.appendRow([chave, valor]); dados.push({ chave: chave, valor: valor }); }
  });
  return { ok: true, config: configPublica_(lerConfig_()) };
}

/**
 * Resumo de mesada de um período.
 * Parâmetros: de=YYYY-MM-DD, ate=YYYY-MM-DD  (ou periodo=semana|mes)
 */
function apiResumoMesada_(p) {
  var hoje = p.hoje || hojeISO_();
  var de = p.de, ate = p.ate;
  if (!de || !ate) {
    if (p.periodo === 'mes') {
      de = hoje.slice(0, 8) + '01';
      ate = hoje;
    } else {
      var d = parseISO_(hoje);
      var dow = d.getDay();                       // 0=Dom
      var offset = (dow + 6) % 7;                 // semana começa na segunda
      de = somarDias_(hoje, -offset);
      ate = somarDias_(de, 6);
    }
  }

  var tarefas = lerTabela_('tarefas').map(normalizarTarefa_);
  var registros = lerTabela_('registros').map(normalizarRegistro_);
  var cfg = lerConfig_();

  var esperadas = 0, feitas = 0, pontosExtra = 0, extrasFeitas = 0;
  var porDia = [];

  var dia = de;
  var guard = 0;
  while (dia <= ate && guard++ < 400) {
    var dow2 = parseISO_(dia).getDay();
    var doDia = tarefas.filter(function (t) { return t.ativa === 'sim' && tarefaNoDia_(t, dow2); });
    var basicasMesada = doDia.filter(function (t) { return t.tipo === 'basica' && t.conta_mesada === 'sim'; });
    var regsDia = registros.filter(function (r) { return r.data === dia && r.status === 'aprovada'; });
    var idsFeitos = {};
    regsDia.forEach(function (r) { idsFeitos[r.tarefa_id] = true; });

    var feitasDia = basicasMesada.filter(function (t) { return idsFeitos[t.id]; }).length;
    esperadas += basicasMesada.length;
    feitas += feitasDia;

    regsDia.forEach(function (r) {
      if (ehResgate_(r.tarefa_id)) return;
      if (r.pontos_ganhos > 0) { pontosExtra += r.pontos_ganhos; extrasFeitas++; }
    });

    porDia.push({
      data: dia,
      esperadas: basicasMesada.length,
      feitas: feitasDia,
      pct: basicasMesada.length ? Math.round((feitasDia / basicasMesada.length) * 100) : null
    });
    dia = somarDias_(dia, 1);
  }

  var pct = esperadas ? feitas / esperadas : 0;
  var base = Number(cfg.valor_mesada_base) || 0;
  var porPonto = Number(cfg.valor_por_ponto) || 0;
  var diasPeriodo = porDia.length;
  var baseProporcional = p.periodo === 'mes' ? base : base * (diasPeriodo / 30);

  return {
    ok: true,
    de: de, ate: ate,
    basicas_esperadas: esperadas,
    basicas_feitas: feitas,
    pct_basicas: Math.round(pct * 100),
    pontos_extra: pontosExtra,
    tarefas_extra_feitas: extrasFeitas,
    valor_mesada_base: base,
    valor_por_ponto: porPonto,
    valor_base_periodo: arred2_(baseProporcional),
    valor_parte_basicas: arred2_(baseProporcional * pct),
    valor_parte_extra: arred2_(pontosExtra * porPonto),
    valor_total: arred2_(baseProporcional * pct + pontosExtra * porPonto),
    por_dia: porDia,
    saldo: calcularSaldo_(registros)
  };
}

/* ============================================================
 *  REGRAS DE NEGÓCIO
 * ============================================================ */

function tarefaNoDia_(t, dow) {
  switch (t.recorrencia) {
    case 'diaria': return true;
    case 'semana': return dow >= 1 && dow <= 5;
    case 'fimdesemana': return dow === 0 || dow === 6;
    case 'dias':
      return String(t.dias || '').split(/[^0-9]+/).filter(String).map(Number).indexOf(dow) >= 0;
    default: return true;
  }
}

function calcularSaldo_(registros) {
  var s = 0;
  registros.forEach(function (r) {
    if (r.status === 'aprovada') s += Number(r.pontos_ganhos) || 0;
    else if (r.status === 'pendente_aprovacao' && ehResgate_(r.tarefa_id)) s += Number(r.pontos_ganhos) || 0; // reserva pontos do resgate pedido
  });
  return s;
}

/** Dias consecutivos (até hoje/ontem) em que todas as básicas do dia foram feitas. */
function calcularStreak_(tarefas, registros, hoje) {
  var feitosPorDia = {};
  registros.forEach(function (r) {
    if (r.status === 'rejeitada' || ehResgate_(r.tarefa_id)) return;
    (feitosPorDia[r.data] = feitosPorDia[r.data] || {})[r.tarefa_id] = true;
  });

  function diaCompleto(dia) {
    var dow = parseISO_(dia).getDay();
    var basicas = tarefas.filter(function (t) {
      return t.ativa === 'sim' && t.tipo === 'basica' && tarefaNoDia_(t, dow);
    });
    if (!basicas.length) return false;
    var feitos = feitosPorDia[dia] || {};
    return basicas.every(function (t) { return feitos[t.id]; });
  }

  var streak = 0;
  var cursor = diaCompleto(hoje) ? hoje : somarDias_(hoje, -1);
  var guard = 0;
  while (guard++ < 400 && diaCompleto(cursor)) {
    streak++;
    cursor = somarDias_(cursor, -1);
  }
  return streak;
}

function ehResgate_(tarefaId) {
  return String(tarefaId).indexOf(PREFIXO_RESGATE) === 0;
}

function enriquecerRegistro_(r, tarefas, recompensas) {
  var out = {
    id: r.id, data: r.data, tarefa_id: r.tarefa_id,
    status: r.status, pontos_ganhos: r.pontos_ganhos, aprovado_em: r.aprovado_em,
    foto_url: r.foto_url || ''
  };
  if (ehResgate_(r.tarefa_id)) {
    var recId = String(r.tarefa_id).slice(PREFIXO_RESGATE.length);
    var rec = recompensas.filter(function (x) { return x.id === recId; })[0];
    out.kind = 'resgate';
    out.titulo = rec ? rec.titulo : 'Recompensa removida';
    out.icone = rec ? rec.icone : '🎁';
    out.custo_pontos = rec ? rec.custo_pontos : Math.abs(r.pontos_ganhos);
  } else {
    var t = tarefas.filter(function (x) { return x.id === r.tarefa_id; })[0];
    out.kind = 'tarefa';
    out.titulo = t ? t.titulo : 'Tarefa removida';
    out.icone = t ? t.icone : '✅';
    out.pontos = t ? (t.tipo === 'extra' ? t.pontos : 0) : 0;
    out.tipo = t ? t.tipo : 'basica';
    out.precisa_foto = t ? t.precisa_foto : 'nao';
  }
  return out;
}

/* ============================================================
 *  FOTOS DE COMPROVAÇÃO (Google Drive)
 *  A planilha guarda só a URL; a imagem fica na pasta Fotos_Tarefas.
 * ============================================================ */

/**
 * Recebe a foto em Base64 (com ou sem o prefixo "data:image/jpeg;base64,"),
 * grava um .jpg na pasta Fotos_Tarefas e devolve a URL de visualização direta.
 * Devolve '' quando não vier foto — nunca derruba a conclusão da tarefa.
 */
function salvarFoto_(base64, tarefaId, data) {
  if (!base64) return '';
  try {
    var limpo = String(base64).replace(/^data:image\/[a-zA-Z+]+;base64,/, '').replace(/\s+/g, '');
    if (limpo.length < 32) return '';

    var nome = (data || hojeISO_()) + '_' + String(tarefaId || 'tarefa').replace(/[^A-Za-z0-9_-]/g, '') + '.jpg';
    var pasta = pastaFotos_();

    // Reenvio da mesma tarefa no mesmo dia substitui a foto anterior.
    var antigos = pasta.getFilesByName(nome);
    while (antigos.hasNext()) antigos.next().setTrashed(true);

    var arquivo = pasta.createFile(Utilities.newBlob(Utilities.base64Decode(limpo), 'image/jpeg', nome));
    try {
      arquivo.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (e) {
      // Contas com compartilhamento externo bloqueado: o link segue valendo
      // para quem tem acesso ao Drive do dono.
    }
    return 'https://drive.google.com/thumbnail?id=' + arquivo.getId() + '&sz=w800';
  } catch (err) {
    return '';
  }
}

function pastaFotos_() {
  var it = DriveApp.getFoldersByName(PASTA_FOTOS);
  while (it.hasNext()) {
    var f = it.next();
    if (!f.isTrashed()) return f;
  }
  return DriveApp.createFolder(PASTA_FOTOS);
}

/**
 * Manutenção: manda para a lixeira as fotos com mais de DIAS_RETENCAO_FOTOS dias.
 * Rode na mão de vez em quando ou use criarGatilhoLimpezaFotos() para automatizar.
 */
function limparFotosAntigas() {
  var limite = new Date().getTime() - DIAS_RETENCAO_FOTOS * 24 * 60 * 60 * 1000;
  var arquivos = pastaFotos_().getFiles();
  var apagadas = 0, mantidas = 0;
  while (arquivos.hasNext()) {
    var a = arquivos.next();
    if (a.getDateCreated().getTime() < limite) { a.setTrashed(true); apagadas++; }
    else mantidas++;
  }
  return 'Fotos apagadas: ' + apagadas + ' · mantidas: ' + mantidas +
         ' (retenção de ' + DIAS_RETENCAO_FOTOS + ' dias)';
}

/** Cria (uma única vez) o gatilho diário que roda limparFotosAntigas(). */
function criarGatilhoLimpezaFotos() {
  var existe = ScriptApp.getProjectTriggers().some(function (t) {
    return t.getHandlerFunction() === 'limparFotosAntigas';
  });
  if (existe) return 'O gatilho diário já existe.';
  ScriptApp.newTrigger('limparFotosAntigas').timeBased().atHour(3).everyDays(1).create();
  return 'Gatilho diário criado (roda por volta das 3h).';
}

/* ============================================================
 *  PIN
 * ============================================================ */

function pinValido_(pin) {
  var cfg = lerConfig_();
  var esperado = String(cfg.pin_pais || CONFIG_PADRAO.pin_pais).trim();
  return String(pin || '').trim() === esperado;
}

function exigirPin_(p) {
  if (!pinValido_(p && p.pin)) throw new Error('PIN inválido');
}

/* ============================================================
 *  ACESSO À PLANILHA
 * ============================================================ */

var _colunasConferidas = {};

function aba_(nome) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(nome);
  if (!sh) {
    setupPlanilha();
    sh = ss.getSheetByName(nome);
  }
  if (!sh) throw new Error('Aba não encontrada: ' + nome);
  garantirColunas_(nome, sh);
  return sh;
}

/**
 * Acrescenta ao final da aba qualquer coluna nova que o código espere
 * (ex.: `precisa_foto`, `foto_url`), sem mexer nas colunas já existentes
 * nem nos dados. Roda no máximo uma vez por execução, por aba.
 */
function garantirColunas_(nome, sh) {
  if (_colunasConferidas[nome]) return;
  _colunasConferidas[nome] = true;
  var esperadas = ABAS[nome];
  if (!esperadas) return;
  var atuais = cabecalhos_(sh);
  if (!atuais.length) {
    sh.getRange(1, 1, 1, esperadas.length).setValues([esperadas])
      .setFontWeight('bold').setBackground('#efeafc');
    sh.setFrozenRows(1);
    return;
  }
  var faltando = esperadas.filter(function (h) { return atuais.indexOf(h) < 0; });
  if (!faltando.length) return;
  sh.getRange(1, atuais.length + 1, 1, faltando.length).setValues([faltando])
    .setFontWeight('bold').setBackground('#efeafc');
}

function cabecalhos_(sh) {
  var n = sh.getLastColumn();
  if (!n) return [];
  return sh.getRange(1, 1, 1, n).getValues()[0].map(function (h) { return String(h).trim(); });
}

function lerTabela_(nome) {
  var sh = aba_(nome);
  var lin = sh.getLastRow();
  var col = sh.getLastColumn();
  if (lin < 2 || !col) return [];
  var headers = cabecalhos_(sh);
  var valores = sh.getRange(2, 1, lin - 1, col).getDisplayValues();
  var out = [];
  valores.forEach(function (row) {
    if (row.join('').trim() === '') return;
    var obj = {};
    headers.forEach(function (h, i) { if (h) obj[h] = row[i]; });
    if (String(obj.id || obj.chave || '').trim() === '') return;
    out.push(obj);
  });
  return out;
}

function inserirLinha_(nome, obj) {
  var sh = aba_(nome);
  var headers = cabecalhos_(sh);
  sh.appendRow(headers.map(function (h) {
    var v = obj[h];
    return v === undefined || v === null ? '' : v;
  }));
}

function atualizarPorId_(nome, id, patch) {
  var sh = aba_(nome);
  var headers = cabecalhos_(sh);
  var lin = sh.getLastRow();
  if (lin < 2) return false;
  var idCol = headers.indexOf('id');
  if (idCol < 0) return false;
  var ids = sh.getRange(2, idCol + 1, lin - 1, 1).getDisplayValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]).trim() === String(id).trim()) {
      var linha = i + 2;
      var atual = sh.getRange(linha, 1, 1, headers.length).getDisplayValues()[0];
      var nova = headers.map(function (h, j) {
        return patch[h] !== undefined ? patch[h] : atual[j];
      });
      sh.getRange(linha, 1, 1, headers.length).setValues([nova]);
      return true;
    }
  }
  return false;
}

function excluirPorId_(nome, id) {
  var sh = aba_(nome);
  var headers = cabecalhos_(sh);
  var lin = sh.getLastRow();
  if (lin < 2) return false;
  var idCol = headers.indexOf('id');
  if (idCol < 0) return false;
  var ids = sh.getRange(2, idCol + 1, lin - 1, 1).getDisplayValues();
  for (var i = ids.length - 1; i >= 0; i--) {
    if (String(ids[i][0]).trim() === String(id).trim()) {
      sh.deleteRow(i + 2);
      return true;
    }
  }
  return false;
}

function lerConfig_() {
  var cfg = {};
  Object.keys(CONFIG_PADRAO).forEach(function (k) { cfg[k] = CONFIG_PADRAO[k]; });
  lerTabela_('config').forEach(function (r) {
    var k = String(r.chave).trim();
    if (k) cfg[k] = r.valor;
  });
  return cfg;
}

/** Nunca devolve o PIN para o front-end. */
function configPublica_(cfg) {
  var out = {};
  Object.keys(cfg).forEach(function (k) {
    if (k === 'pin_pais') return;
    out[k] = cfg[k];
  });
  out.pin_definido = String(cfg.pin_pais || '').length > 0;
  return out;
}

/* ============================================================
 *  NORMALIZAÇÃO E UTILITÁRIOS
 * ============================================================ */

function normalizarTarefa_(r) {
  return {
    id: String(r.id).trim(),
    titulo: String(r.titulo || '').trim(),
    icone: String(r.icone || '⭐').trim(),
    tipo: String(r.tipo || 'basica').trim().toLowerCase() === 'extra' ? 'extra' : 'basica',
    pontos: Number(String(r.pontos || '0').replace(',', '.')) || 0,
    periodo: (String(r.periodo || 'qualquer').trim().toLowerCase()) || 'qualquer',
    recorrencia: (String(r.recorrencia || 'diaria').trim().toLowerCase()) || 'diaria',
    dias: String(r.dias || '').trim(),
    precisa_aprova: simNao_(r.precisa_aprova),
    conta_mesada: simNao_(r.conta_mesada),
    ativa: simNao_(r.ativa === undefined || r.ativa === '' ? 'sim' : r.ativa),
    criada_em: String(r.criada_em || ''),
    precisa_foto: simNao_(r.precisa_foto)
  };
}

function normalizarRecompensa_(r) {
  return {
    id: String(r.id).trim(),
    titulo: String(r.titulo || '').trim(),
    icone: String(r.icone || '🎁').trim(),
    custo_pontos: Number(String(r.custo_pontos || '0').replace(',', '.')) || 0,
    ativa: simNao_(r.ativa === undefined || r.ativa === '' ? 'sim' : r.ativa)
  };
}

function normalizarRegistro_(r) {
  return {
    id: String(r.id).trim(),
    data: normalizarData_(r.data),
    tarefa_id: String(r.tarefa_id || '').trim(),
    status: String(r.status || 'aprovada').trim().toLowerCase(),
    pontos_ganhos: Number(String(r.pontos_ganhos || '0').replace(',', '.')) || 0,
    aprovado_em: String(r.aprovado_em || ''),
    foto_url: String(r.foto_url || '')
  };
}

/** Aceita YYYY-MM-DD ou DD/MM/YYYY (formato padrão de data pt-BR da planilha). */
function normalizarData_(v) {
  var s = String(v || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  var m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return m[3] + '-' + pad2_(m[2]) + '-' + pad2_(m[1]);
  var d = new Date(s);
  if (!isNaN(d.getTime())) return Utilities.formatDate(d, TZ, 'yyyy-MM-dd');
  return s;
}

function simNao_(v) {
  var s = String(v === undefined || v === null ? '' : v).trim().toLowerCase();
  if (s === 'sim' || s === 's' || s === 'true' || s === 'verdadeiro' || s === '1' || s === 'x') return 'sim';
  return 'nao';
}

function novoId_() {
  return Utilities.getUuid().replace(/-/g, '').slice(0, 12);
}

function hojeISO_() {
  return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
}

function agoraISO_() {
  return Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd'T'HH:mm:ss");
}

function parseISO_(s) {
  var p = String(s).split('-');
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]), 12, 0, 0);
}

function somarDias_(iso, n) {
  var d = parseISO_(iso);
  d.setDate(d.getDate() + n);
  return d.getFullYear() + '-' + pad2_(d.getMonth() + 1) + '-' + pad2_(d.getDate());
}

function pad2_(n) { return ('0' + n).slice(-2); }

function arred2_(n) { return Math.round((Number(n) || 0) * 100) / 100; }
