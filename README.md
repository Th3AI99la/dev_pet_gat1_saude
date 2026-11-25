# Clima em Goiás

Painel local do PET-Saúde Clima, GAT 1. O recorte vai de janeiro de 2017 a dezembro de 2026, com cobertura parcial em 2026. O menu lateral leva ao mapa, aos gráficos, à recorrência e à planilha completa. Os cinco botões abaixo do mapa trocam o indicador. A linha do tempo, os gráficos, a recorrência e os avisos estaduais têm períodos independentes. Ao trocar o recorte municipal, o mapa e o gráfico anual procuram o mês com valor mais próximo dentro do ano escolhido em cada seção. O tema é salvo no navegador.

Na linha do tempo, escolha um ano e clique em um mês com dados. **Reproduzir** começa no período escolhido e avança pelos anos da série. Trocar o ano durante a reprodução mantém a sequência ativa a partir do novo período. **Estado inteiro** inclui os meses em cinza. Na visão municipal, a reprodução avança pelos meses com valor. Um zero registrado continua selecionável. O explorador da planilha mantém os registros originais para conferência.

O mapa abre com **Estado de Goiás** no seletor e destaque no contorno estadual. Selecione um município no mapa, no seletor ou na lista do mês para aproximar seu limite. O botão **Estado inteiro** restaura o enquadramento geral e preserva o período de cada seção. Para chuva, umidade, queimadas e eventos, a visão geral indica a cobertura dos municípios da planilha. Os gráficos e a recorrência usam o último município selecionado, indicado em suas respectivas seções. As hachuras identificam lacunas e o Monitor de Secas usa a escala estadual. As transições respeitam a preferência de movimento reduzido do navegador.

O mapa usa uma base cartográfica neutra, com uma escala de cor para o indicador selecionado. Os marcadores quadrados indicam disponibilidade, com valor junto ao nome ou a indicação **Sem dados**. Em telas estreitas, o mapa prioriza o rótulo do município selecionado. Os botões **+**, **−** e **Estado inteiro** controlam o enquadramento.

O link **Histórico climático** abre a evolução anual de temperatura média e precipitação acumulada de 1901 a 2024. Clique em uma barra do gráfico ou use as setas para escolher o ano. O gráfico mostra o desvio de cada ano ante a média 1991–2020 e compara os períodos 1961–1990 e 1991–2020. As estimativas estaduais usam a grade CRU TS 4.09. Em **Sinais e avisos**, as setas mudam o ano e os botões dos meses abrem os boletins da planilha. A seção destaca avanço ou agravamento, inclusive quando acompanhado de recuo em outras áreas. Os links do CIMEHGO e do INMET levam às publicações vigentes. [Procedimento de cálculo e fontes](fontes/README.md#série-climática-estadual)

Os gráficos oferecem linha, colunas, faixas mensais e pizza. O botão **Ver série 2017–2026** amplia o intervalo do gráfico. No modo linha anual, a mediana do mesmo mês em outros anos aparece como referência quando há pelo menos dois valores comparáveis.

**Origem conferida em 25/11/2026.** O XLSX recebido, a exportação atual do Google Sheets e o JSON do painel coincidiram nas nove abas, nos valores tipados das 12.504 células preenchidas e na nota de Posse A2. O endereço com `gid=1626095015` abre a aba de recorrência de Goiânia, com 52 células preenchidas. [Conferência registrada](fontes/verificacao-integral.json) · [Aba de Goiânia](https://docs.google.com/spreadsheets/d/1BZH6Bnt79nS3wh1PDnRto2QGe8bb5wJNgu5nefpjFF0/edit?gid=1626095015#gid=1626095015)

Na seção **Planilha completa**, use o seletor de abas, a busca e a paginação para consultar os valores originais. O botão **Abrir linha na planilha** leva da visualização à linha que a originou. O JSON integral inclui as notas e as coordenadas originais das células. Células vazias são representadas por um traço na interface. A cópia local é a versão usada pelo site, com atualização manual.

## Executar no Visual Studio

No terminal aberto nesta pasta, rode:

```powershell
python app.py
```

Abra [http://127.0.0.1:8000/](http://127.0.0.1:8000/). Use `Ctrl+C` no terminal para parar. Se a porta estiver ocupada, execute `python app.py --port 8001` e abra o endereço impresso. O servidor usa a biblioteca padrão do Python e só expõe `site/`. O CSS e os dados já estão compilados.

## Onde editar

| Caminho | Conteúdo |
| --- | --- |
| `site/index.html` | Página e informações de metodologia |
| `site/js/` | Mapa, gráficos, filtros, recorrência, CSV, explorador da planilha e tema |
| `css/tailwind.css` | Fonte da folha de estilos. A saída compilada fica em `site/css/painel.css` |
| `site/assets/` | Dados JSON tratados, malha projetada e ícone |
| `fontes/originais/` | Cópias locais dos anexos e das malhas de origem |
| `fontes/auditoria.json` | Contagens do processamento e linhas com divergência de estação |
| `scripts/preparar_dados.py` | Leitura, validação e construção dos JSON analíticos |
| `scripts/exportar_planilha.py` | Exportação integral por célula para consulta e download |

Para regenerar os dados após conferir uma nova versão da planilha:

```powershell
python -m pip install -r requirements.txt
python scripts/preparar_dados.py --planilha 'C:\caminho\mapeamento por região.xlsx'
python scripts/exportar_planilha.py --planilha 'C:\caminho\mapeamento por região.xlsx'
```

Sem `--planilha`, os dois scripts usam `fontes/originais/mapeamento por região.xlsx`. Rode ambos com o mesmo arquivo porque o painel verifica o SHA-256 da base antes de relacionar os gráficos às linhas. A opção `--baixar-mapa` do primeiro script atualiza a cartografia. Para editar os estilos, use `npm.cmd ci` uma vez e `npm.cmd run build:css` após as alterações. A fonte Poppins é servida localmente com a [licença SIL Open Font License](site/assets/poppins-OFL.txt).

## Origem e critérios

- A base é o XLSX fornecido, com **1.656 linhas datadas** na aba global. O ZIP contém a exportação HTML das mesmas nove abas. Foi conferida a estrutura do ZIP e uma amostra da aba global. Os dois formatos não foram somados.
- São sete municípios distribuídos pelos cinco rótulos de região da planilha. Goiânia é Centro, Luziânia é Leste, Posse é Nordeste e São Miguel do Araguaia é Noroeste. O Sul tem Catalão, Mineiros e Rio Verde. Os limites das regiões de estudo não foram definidos, então o mapa mostra os municípios.
- O processamento extrai números de precipitação acumulada em mm e umidade relativa **média** em %. Lê padrões explícitos nas descrições das colunas E e F, priorizando E. Mínimas e limiares de umidade ficam no texto. Se a linha registra insuficiência geral ou cobertura quantitativa inferior a 80% para a variável, o valor fica ausente. O limiar de 80% foi adotado para a visualização e aparece na própria planilha em parte das linhas. A cobertura pode estar sem informação. Meses cuja descrição é apenas qualitativa ficam em **Eventos**.
- Códigos de estação conflitantes e registros meteorológicos duplicados ficam fora das séries numéricas. O relatório registra as linhas a revisar. Na planilha recebida, há 61 linhas com códigos divergentes e 12 meses duplicados após normalização dos nomes. Os IDs cartográficos e as referências de estação são explícitos no script.
- A coluna I contém **médias de queimadas** de Posse, Rio Verde e São Miguel do Araguaia. Os valores são preservados, inclusive zeros. O significado da escala e a forma de cálculo não constam na planilha. Campos em branco, `NÃO CONSTA` e linhas sem município identificado ficam fora das séries numéricas. A coluna de quantidade estadual não tem valores numéricos aproveitáveis. A página não usa essas médias para calcular totais ou afirmar tendência de focos.
- Os 68 registros do Monitor de Secas vão de janeiro de 2021 a outubro de 2026. As categorias do painel resumem o movimento descrito para Goiás. O boletim da SEMAD/CIMEHGO de **abril de 2025** tem 12 páginas e foi recebido como referência, com a página 5 física conferida no mapa estadual. O boletim não preenche as lacunas da série e seus polígonos de seca não foram vetorizados.
- Em **Recorrência mês a mês**, escolha um mês para ver uma linha por ano. As barras comparam os valores do mesmo mês. Seca e Eventos têm rótulos no lugar de barras. Clique na linha de um ano com dados para abrir o detalhe e acessar a síntese da aba original. O período consultado é independente das outras seções. O CSV exporta os 120 meses do indicador e local selecionados, com valor, situação, linha e fonte informada.
- A cartografia usa a API de Malhas do IBGE, qualidade mínima e os 246 municípios de Goiás. Os marcadores indicam posições aproximadas calculadas das geometrias, com ajuste visual de rótulo. As fontes meteorológicas foram identificadas na planilha, sem recomputar as séries a partir das observações horárias.

## Publicação futura

`site/` é a saída estática. O navegador usa HTML, CSS, JavaScript e JSON locais com caminhos relativos. O Python prepara os dados antes da publicação e serve a versão de desenvolvimento. O GitHub Pages pode receber o conteúdo de `site/` como artefato de uma futura ação de publicação. O plano da conta precisa aceitar Pages para o repositório privado e a visibilidade do site deve ser conferida separadamente da visibilidade do repositório. Para publicação com acesso restrito, confirme a opção disponível na conta antes de enviar os dados.

O SharePoint fica como possível origem de arquivos para a equipe em uma etapa posterior. Nesta etapa, a importação usa o XLSX local e funciona sem conta ou plugin de armazenamento.

## Referências

- [Planilha de mapeamento do GAT 1](https://docs.google.com/spreadsheets/d/1BZH6Bnt79nS3wh1PDnRto2QGe8bb5wJNgu5nefpjFF0/edit?gid=0#gid=0), cuja exportação XLSX foi conferida por coordenada e conteúdo em 25/11/2026.
- [INMET](https://portal.inmet.gov.br/dadoshistoricos), [BDQueimadas/INPE](https://terrabrasilis.dpi.inpe.br/queimadas/bdqueimadas/), [Monitor de Secas/ANA](https://monitordesecas.ana.gov.br/) e [Boletins SEMAD/CIMEHGO](https://goias.gov.br/meioambiente/srh/cimehgo-3/cimehgo-alertas-e-boletins/), conforme fontes indicadas no material recebido.
- [Malha municipal do IBGE](https://www.ibge.gov.br/geociencias/organizacao-do-territorio/malhas-territoriais/15774-malhas.html). Dados de estado e municípios obtidos em 25/11/2026 e registrados em `fontes/manifesto.json`.
- [Tailwind CLI](https://tailwindcss.com/docs/installation/tailwind-cli) e [configuração do GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site), consultados em 25/11/2026.

## Referências para a revisão visual

- [Dengue em Goiás, painel em Power BI](https://github.com/valdivinoaquino/dengue_em_goias) orientou o uso de indicadores no topo, filtros compartilhados e mapa ao lado dos detalhes. Os dados do painel de dengue pertencem ao projeto de referência.
- [Mapa de incêndios em Goiás](https://github.com/lucassoa13/mapa-incendios-goias) e [Grafos em Python](https://github.com/sidsidoso/grafos-python) foram consultados como exemplos de visualização territorial. O segundo demonstra representação rodoviária e algoritmos de grafos.
- [ClimaX](https://github.com/microsoft/ClimaX) é um modelo de pesquisa meteorológica e climática. Esta revisão visual trabalha com observações da planilha.
- [Google Maps JavaScript](https://developers.google.com/maps/documentation/javascript/get-api-key?hl=pt-br) oferece chave de demonstração para protótipos e requer configuração de faturamento para a chave padrão de produção. O mapa atual é renderizado a partir da malha do IBGE já armazenada no projeto.
