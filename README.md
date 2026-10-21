# Mural

Busca de notícias em cards, no estilo Pinterest. Digite um assunto (ex.: "Flamengo futebol") e veja as notícias dos últimos 7 dias; a mais relevante aparece em destaque e cada card leva ao site de origem.

Site publicado: https://leonardoanselmo.github.io/mural/

## Como está montado

- `docs/` — o site (`index.html`, `style.css`, `app.js`), publicado pelo GitHub Pages a partir da pasta `docs` do branch `main`.
- `worker/worker.js` — Cloudflare Worker que faz a busca (`/api/busca?q=...`): junta os RSS do Bing Notícias (traz imagens e link direto) e do Google Notícias, remove repetidas e descarta o que tem mais de 7 dias. É necessário porque o navegador não pode ler esses RSS direto. Só aceita chamadas de `leonardoanselmo.github.io` e de `localhost`.
- `server.py` — a mesma busca em Python, para rodar tudo no computador.

O endereço do Worker fica na constante `API` no topo de `docs/app.js`.

## Rodar no computador

Só precisa de Python 3 (nenhuma dependência externa):

```bash
python server.py
```

Depois abra http://localhost:8765. A porta pode ser trocada com a variável `PORT`.

## Atualizar o Worker

No painel da Cloudflare: Workers & Pages → `mural` → Editar código → colar o conteúdo de `worker/worker.js` → Implantar.
