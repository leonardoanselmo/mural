# Mural

Busca de notícias em cards, no estilo Pinterest. Digite um assunto (ex.: "Flamengo futebol") e veja as notícias dos últimos 7 dias; a mais relevante aparece em destaque e cada card leva ao site de origem.

## Como rodar

Só precisa de Python 3 (nenhuma dependência externa):

```bash
python server.py
```

Depois abra http://localhost:8765. A porta pode ser trocada com a variável `PORT`.

## Como funciona

- `server.py` serve o front-end e expõe `/api/busca?q=...`, que junta os RSS do Bing Notícias (traz imagens e link direto) e do Google Notícias, remove repetidas e descarta o que tem mais de 7 dias.
- `static/` tem a interface: `index.html`, `style.css` e `app.js` (mural em colunas, card de destaque, ordenação por relevância ou data).
