# 🧒 Meu Quadrinho — Tarefas, Recompensas e Mesada

PWA mobile-first (HTML/CSS/JS puro) para o quadro de tarefas da criança, com
**Google Planilhas + Google Apps Script** como banco de dados e API.
O app responde **instantaneamente** (Optimistic UI + cache em `localStorage` +
fila de sincronização em segundo plano): marcar uma tarefa nunca espera o Google Sheets.

```
index.html · style.css · app.js · manifest.json · sw.js · icons/ · Code.gs
```

---

## 1. Preparar a planilha (2 min)

1. Abra a sua planilha do Google (a que já tem a aba **`tarefas`**).
2. Menu **Extensões → Apps Script**.
3. Apague o conteúdo de `Código.gs` e **cole todo o arquivo `Code.gs`** deste projeto. Salve (💾).
4. No seletor de funções escolha **`setupPlanilha`** e clique em **Executar**.
   - Autorize o acesso quando o Google pedir (*Revisar permissões → Avançado → Acessar o projeto*).
   - Isso cria as abas que faltarem (`registros`, `recompensas`, `config`) com os cabeçalhos certos,
     preenche a `config` com valores padrão e, se as abas estiverem vazias, insere alguns exemplos.
5. Na aba **`config`**, ajuste:

   | chave | exemplo | o que é |
   |---|---|---|
   | `pin_pais` | `1234` | PIN de 4 dígitos da área dos pais |
   | `valor_mesada_base` | `40` | mesada cheia por mês (R$) |
   | `valor_por_ponto` | `0.10` | quanto vale cada ponto extra (R$) |
   | `nome_crianca` | `Alice` | nome exibido na tela |

## 2. Publicar a API (2 min)

1. Ainda no Apps Script: **Implantar → Nova implantação**.
2. Engrenagem **⚙ → App da Web**.
3. Preencha:
   - **Executar como:** `Eu (seu e-mail)`
   - **Quem pode acessar:** `Qualquer pessoa`  ← obrigatório, senão o GitHub Pages não consegue ler
4. **Implantar** e **copie a URL** que termina em `/exec`.

> Toda vez que você alterar o `Code.gs`, use **Implantar → Gerenciar implantações → ✏️ → Versão: Nova versão**
> para que a mesma URL passe a servir o código novo.

## 3. Conectar o front-end

Abra `app.js` e troque a primeira linha de configuração:

```js
const API_URL = 'https://script.google.com/macros/s/SEU_ID_AQUI/exec';
```

## 4. Publicar no GitHub Pages

```bash
git init && git add . && git commit -m "Quadro de tarefas"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/SEU_REPO.git
git push -u origin main
```

No GitHub: **Settings → Pages → Source: Deploy from a branch → `main` / `/ (root)` → Save**.
Em ~1 minuto o app estará em `https://SEU_USUARIO.github.io/SEU_REPO/`.

No celular, abra esse endereço no Chrome/Safari e use **“Adicionar à tela de início”** —
ele instala como aplicativo (ícone, tela cheia, funciona offline).

---

## Como funciona a velocidade (Optimistic UI)

1. A tela é desenhada **na hora** com o que está no `localStorage` (`qt.cache.v1`) — zero espera no abrir.
2. Ao tocar numa tarefa, o app **já atualiza a interface** (confete, pontos, barra de progresso)
   e empilha a ação numa **fila** (`qt.fila.v1`).
3. Um processo em segundo plano envia a fila ao Apps Script, um item por vez, com
   *retry* e *backoff* exponencial. Sem internet, tudo fica salvo no aparelho e é enviado sozinho
   quando a conexão volta (evento `online`, ao reabrir o app e a cada 60 s).
4. Cada registro tem um `id` gerado no celular → reenvio nunca duplica (idempotência no servidor).
5. Se o servidor recusar uma ação (ex.: saldo insuficiente), o app mostra um aviso e **ressincroniza**,
   voltando ao estado real da planilha.

O indicador no topo mostra `🔄 Sincronizando (n)` ou `📴 Offline — salvo no aparelho`.

## Estrutura das abas

**`tarefas`** — `id | titulo | icone | tipo | pontos | periodo | recorrencia | dias | precisa_aprova | conta_mesada | ativa | criada_em | precisa_foto`

- `tipo`: `basica` (obrigação, 0 pontos) · `extra` (gera pontos)
- `periodo`: `manha` · `tarde` · `noite` · `qualquer`
- `recorrencia`: `diaria` · `semana` (seg–sex) · `fimdesemana` (sáb–dom) · `dias` (usa a coluna `dias`, ex.: `1,3,5`, com 0=Dom e 6=Sáb)
- `precisa_aprova`, `conta_mesada`, `ativa`, `precisa_foto`: `sim` / `nao`

**`registros`** — `id | data | tarefa_id | status | pontos_ganhos | aprovado_em | foto_url`
`status`: `pendente_aprovacao` · `aprovada` · `rejeitada`

**`recompensas`** — `id | titulo | icone | custo_pontos | ativa`

**`config`** — `chave | valor`

> **Resgates da lojinha** também vivem na aba `registros`, com `tarefa_id = "rec:<id_da_recompensa>"`
> e `pontos_ganhos` negativo — assim o sistema mantém exatamente as 4 abas e o extrato de pontos
> fica todo num lugar só. Os pontos saem do saldo já no pedido (ficam reservados) e voltam se os pais recusarem.

## Foto de comprovação

Marque **Exigir foto? → Sim** na tarefa (área dos pais) e ela passa a pedir uma foto para ser concluída.

Como funciona:

1. A criança toca na tarefa (que mostra o selo **📷 foto**) e o celular abre direto a câmera traseira.
2. O navegador **comprime a imagem num `<canvas>`**: no máximo **640 px** no maior lado, JPEG qualidade **0.6**
   — na prática entre 25 KB e 60 KB (uma foto de 2400×1600 e 332 KB vira 640×427 e 24 KB).
3. Aparece a prévia com **Enviar comprovação** / **Tirar outra**.
4. Ao enviar, a tarefa **já fica concluída na tela** com a prévia local, e o upload vai para a fila de sincronização.
5. O `Code.gs` recebe o Base64, salva o `.jpg` na pasta **`Fotos_Tarefas`** do seu Google Drive
   (nome `AAAA-MM-DD_tarefaId.jpg`, compartilhado como “qualquer pessoa com o link pode ver”)
   e grava **só a URL** na coluna `foto_url`. **Base64 nunca vai para a célula da planilha.**
6. Na área dos pais, a fila de aprovações e o bloco **Comprovações recentes** mostram a miniatura;
   toque nela para ampliar antes de Aprovar ou Recusar.

### Limpeza automática

A função **`limparFotosAntigas()`** manda para a lixeira as fotos com mais de 30 dias
(constante `DIAS_RETENCAO_FOTOS` no topo do `Code.gs`). Rode na mão quando quiser, ou execute uma vez
**`criarGatilhoLimpezaFotos()`** para criar o gatilho diário que faz isso sozinho de madrugada.

### “Não tem permissão para chamar DriveApp” e o Google não pede autorização

O editor só pede os escopos declarados no manifesto. Se o `appsscript.json` do projeto não listar o
Drive, a tela de permissões nunca aparece e o `DriveApp` falha para sempre. Para resolver:

1. No Apps Script: **⚙ Configurações do projeto** → marque **“Mostrar o arquivo de manifesto
   `appsscript.json` no editor”**.
2. Abra o `appsscript.json` que apareceu na lista de arquivos e deixe o bloco `oauthScopes` assim
   (há uma cópia pronta em `appsscript.json` neste repositório — **mantenha o seu `timeZone` atual**):

   ```json
   "oauthScopes": [
     "https://www.googleapis.com/auth/spreadsheets",
     "https://www.googleapis.com/auth/drive",
     "https://www.googleapis.com/auth/script.scriptapp"
   ]
   ```

   Se preferir, apague o `oauthScopes` inteiro: sem ele, o Apps Script deduz os escopos do código.
3. Salve, rode **`testarDrive`** e **agora** a tela de permissões aparece → *Revisar permissões →
   Avançado → Acessar o projeto (não seguro) → Permitir*.
4. Rode `testarDrive` de novo (deve dizer **TUDO CERTO**) e publique **Nova versão** da implantação.

Se mesmo assim não pedir, revogue o acesso em
[myaccount.google.com/permissions](https://myaccount.google.com/permissions) (procure o nome do
projeto do Apps Script) e rode `testarDrive` outra vez.

### Se a foto não aparecer na aprovação

Rode **`testarDrive()`** no editor do Apps Script (menu de funções → Executar). Ele diz em português
se a pasta, a gravação, o compartilhamento e a remoção estão funcionando — e, quando falha, mostra o
motivo e o que fazer. O caso mais comum é a autorização do Drive não ter sido concedida: basta
executar a função, aceitar a tela de permissões e publicar **Nova versão** da implantação.

Quando o servidor recebe a tarefa mas não consegue guardar a imagem, a tarefa **não se perde**: ela
é concluída normalmente e a área dos pais mostra o aviso *“Fotos não estão sendo salvas”* com o motivo.

> ⚠️ **Ao atualizar o `Code.gs`, rode `setupPlanilha()` de novo.** Isso acrescenta as colunas
> `precisa_foto` e `foto_url` ao fim das abas existentes (sem tocar nos dados) e pede a nova
> autorização de acesso ao Google Drive. Depois publique **Nova versão** da implantação.

## Relatório semanal por e-mail

Toda segunda-feira de manhã chega um resumo da **semana fechada anterior** (segunda a domingo) no
e-mail configurado — com a semanada a pagar, o cumprimento das obrigatórias, as faltas (com data) e
os extras da semana.

**Ligar (uma vez):**

1. Na área dos pais → aba **Mesada** → bloco *Relatório semanal por e-mail*: preencha o e-mail,
   a semanada base, o desconto por falta e como descontar. Salve.
2. Toque em **📧 Enviar relatório semanal agora** para testar na hora.
3. No Apps Script, rode uma vez **`configurarGatilhoRelatorioSemanal()`** — ele remove gatilhos
   antigos da mesma função e cria o agendamento de segunda às 8h.

**Chaves novas na aba `config`:**

| chave | padrão | o que faz |
|---|---|---|
| `email_relatorio` | *(vazio)* | destinatário do relatório |
| `valor_semanada_base` | `12.50` | valor cheio da semana |
| `modo_desconto` | `fixo` | `fixo` (R$ por falta) · `proporcional` (fração da base) · `nenhum` |
| `valor_desconto_falta` | `1.00` | usado quando `modo_desconto = fixo` |

**Como a semanada é apurada:** contam as tarefas `basica` com `ativa = sim` e `conta_mesada = sim`,
previstas dia a dia pela recorrência. Cada ocorrência sem registro `aprovada` é uma falta.
O desconto nunca passa do valor base — a semanada não fica negativa.

> O envio usa `MailApp`, que exige o escopo `script.send_mail` no `appsscript.json`
> (já incluído no arquivo deste repositório). Contas gratuitas do Gmail enviam até 100 e-mails por dia,
> de sobra para um relatório semanal.

## Regras de cálculo

- **Saldo de pontos** = soma de `pontos_ganhos` dos registros `aprovada`, menos os resgates (pedidos ou aprovados).
- **Streak** = dias consecutivos (contando de hoje para trás) em que **todas** as tarefas básicas previstas para aquele dia foram concluídas.
- **Mesada do período**
  `base_do_periodo × % de tarefas básicas com conta_mesada = sim` **+** `pontos extras × valor_por_ponto`
  (na visão semanal, a base é proporcional: `valor_mesada_base × 7/30`).

## Modo pais

Toque no cadeado 🔒 no canto superior direito e digite o PIN. A área abre num **painel-resumo**
(tarefas de hoje, pontos, streak, quantos pedidos esperam você e a mesada da semana) seguido da
fila de aprovações. As outras abas trazem CRUD de tarefas, CRUD de recompensas, mesada (semana/mês) e configurações.

### Link direto para os pais

Cada tela tem endereço próprio, então dá para salvar um atalho que já abre no painel:

| link | abre em |
|---|---|
| `.../quadro-tarefas/#pais` | painel + aprovações |
| `.../quadro-tarefas/#pais/tarefas` | CRUD de tarefas |
| `.../quadro-tarefas/#pais/premios` | CRUD de recompensas |
| `.../quadro-tarefas/#pais/mesada` | painel de mesada |
| `.../quadro-tarefas/#loja` | lojinha (criança) |

O link sempre pede o PIN. Marcando **“Manter conectado neste aparelho por 30 dias”** na tela do PIN,
o celular dos pais passa a abrir direto — e o botão **“🔒 Bloquear e esquecer este aparelho”**,
no fim das Configurações, desfaz isso na hora. O PWA também instala um atalho
**“Área dos pais”** (segure o ícone do app na tela inicial).

Essa “memória” fica só no aparelho (`localStorage`); use-a no seu celular, nunca no que a criança usa.

> O PIN é uma trava **para evitar que a criança mexa**, não um sistema de segurança:
> ele é validado no servidor e guardado no aparelho para funcionar offline.
> Como o Web App é público, não coloque dados sensíveis na planilha.

## Problemas comuns

| Sintoma | Causa provável |
|---|---|
| App abre vazio e mostra “⚙️ API não configurada” | `API_URL` ainda está com o texto de exemplo no `app.js` |
| “Não deu para atualizar agora” | implantação não está como **Qualquer pessoa**, ou a URL não é a `/exec` |
| Alterei o `Code.gs` e nada mudou | é preciso publicar uma **nova versão** da implantação |
| Mudei o CSS/JS e o celular mostra o antigo | PWA em cache: troque `VERSAO` no `sw.js` e recarregue |
| Datas aparecem trocadas | a coluna `data` pode estar formatada como data pt-BR — o backend aceita `YYYY-MM-DD` e `DD/MM/AAAA` |
