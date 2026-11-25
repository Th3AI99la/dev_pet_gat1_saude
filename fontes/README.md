# Fontes do painel

`originais/` guarda a planilha, a exportação HTML em ZIP, o PDF recebido e as respostas cartográficas do IBGE. A pasta está no `.gitignore` e fora do diretório servido pelo painel. Os três arquivos fornecidos em Downloads são preservados.

O site usa os dados derivados e a exportação integral por célula em `site/assets`. A planilha XLSX é a entrada dos dois processamentos. O ZIP contém a exportação HTML das abas e o PDF é a referência do Monitor de Secas de abril de 2025.

`verificacao-integral.json` registra a comparação de 25/11/2026 entre a exportação online, a cópia recebida e os dados do explorador. O conteúdo das nove abas coincide, embora os arquivos XLSX sejam binariamente diferentes.

## Série climática estadual

Extraída em 25/11/2026 dos dois NetCDF anuais **CRU TS 4.09**, variáveis `tas` (temperatura média, °C) e `pr` (precipitação acumulada, mm), distribuídos pelo Climate Change Knowledge Portal. A série cobre os 124 anos de 1901 a 2024. São dados em grade de 0,5°, produzidos por interpolação de observações. [Catálogo CRU/CEDA](https://catalogue.ceda.ac.uk/uuid/9cf07e92afaa405da4f40b6733f362d3) · [Distribuição CCKP consultada em 25/11/2026](https://registry.opendata.aws/wbg-cckp/)

O Python intersecta as células da grade com a malha estadual do IBGE. A média de cada ano pondera as **149 células** pelas áreas de interseção em projeção equivalente EPSG:6933. O cálculo conferiu a cobertura da malha e a disponibilidade dos valores em todos os anos. A temperatura anual é uma média no tempo. A chuva anual é um acumulado no tempo e uma média no espaço. O gráfico usa o desvio em relação à média estadual de 1991–2020. A diferença entre duas médias de 30 anos é uma comparação descritiva, com variabilidade entre anos.

O [JSON derivado com a série, os endereços, tamanhos e SHA-256 dos NetCDF](../site/assets/clima-goias.json) acompanha o painel. Os NetCDF globais ocupam cerca de 257 MB no total. O script usa o cache em `tmp/clima-goias/` e obtém os arquivos ausentes do repositório público. O cálculo espera a malha `originais/ibge-goias.geojson` registrada no manifesto. O catálogo CEDA indica Open Government Licence v3.0 para o acervo CRU TS 4.09 e o registro AWS indica ODbL para a distribuição CCKP.

```powershell
python -m pip install netCDF4 numpy pyproj "shapely>=2.1"
python scripts/preparar_clima_goias.py
```

O panorama liga ainda o [estudo do IMB sobre 1990–2023](https://goias.gov.br/imb/wp-content/uploads/sites/29/2025/12/Texto_para_discussao_003_2025_mudancas_climaticas_e_atividade_economica_em_goias.pdf), figuras 2 e 3, como leitura complementar. As observações mensais de seca vêm da planilha do GAT 1. Para consultar avisos atuais, o painel aponta para os canais consultados em 25/11/2026. [CIMEHGO](https://goias.gov.br/meioambiente/srh/cimehgo-3/cimehgo-alertas-e-boletins/) · [INMET](https://avisos.inmet.gov.br/)
