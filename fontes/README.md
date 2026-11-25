# Fontes do painel

`originais/` guarda a planilha, a exportação HTML em ZIP, o PDF recebido e as respostas cartográficas do IBGE. A pasta está no `.gitignore` e fora do diretório servido pelo painel. Os três arquivos fornecidos em Downloads são preservados.

O site usa os dados derivados e a exportação integral por célula em `site/assets`. A planilha XLSX é a entrada dos dois processamentos. O ZIP contém a exportação HTML das abas e o PDF é a referência do Monitor de Secas de abril de 2025.

`verificacao-integral.json` registra a comparação de 25/11/2026 entre a exportação online, a cópia recebida e os dados do explorador. O conteúdo das nove abas coincide, embora os arquivos XLSX sejam binariamente diferentes.
