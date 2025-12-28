MAPA OPERACIONAL DE LOJAS – Igarapé Digital
================================

1. VISÃO GERAL
--------------
O Mapa Operacional de Lojas – Igarapé Digital é um projeto em HTML, CSS e JavaScript
desenvolvido para mapear lojas a partir de planilhas (CSV), enriquecer dados
de endereço via geocoding, permitir correções manuais de localização e
reaproveitar essas correções por meio de cache local.

O foco do projeto é eliminar retrabalho, reduzir erros de localização e
garantir consistência visual e operacional em análises territoriais,
expansão de lojas, operações e apresentações executivas.


2. PRINCIPAIS FUNCIONALIDADES
-----------------------------
- Importação de base CSV de lojas
- Enriquecimento automático de endereços (geocoding)
- Plotagem das lojas em mapa interativo
- Cache inteligente de coordenadas (localStorage)
- Exportação e importação do cache em JSON
- Importação de base já enriquecida (sem novo geocoding)
- Correção manual de localização:
  - Ajuste de endereço textual
  - Definição de coordenada por clique no mapa
- Atualização imediata dos marcadores após correção
- Operação totalmente local (sem backend)


3. PROBLEMAS QUE O PROJETO RESOLVE
---------------------------------
- Erros de geocoding padrão (CEP genérico, centro da cidade, bairro errado)
- Retrabalho ao reprocessar sempre as mesmas lojas
- Falta de controle sobre correções manuais
- Dificuldade de reaproveitar dados entre máquinas ou usuários
- Dependência de ferramentas externas para ajustes simples de localização


4. FLUXO DE USO RECOMENDADO
--------------------------
1. Importar o CSV original de lojas
2. Executar o enriquecimento automático
3. Validar visualmente os pontos no mapa
4. Corrigir manualmente os casos incorretos
5. Exportar o cache (JSON) para reaproveitamento futuro
6. Opcional: exportar a base enriquecida para uso em BI ou relatórios


5. FORMATOS DE ARQUIVO
---------------------
- CSV (entrada): base original ou base enriquecida
- JSON (cache): coordenadas, correções e endereços validados


6. TECNOLOGIAS UTILIZADAS
------------------------
- HTML5
- CSS3
- JavaScript (Vanilla JS)
- Leaflet.js (mapa)
- OpenStreetMap / Nominatim (geocoding)
- localStorage (cache local)


7. ESTRUTURA DO PROJETO
----------------------
- index.html      -> Interface principal
- style.css       -> Estilo visual
- app.js          -> Lógica de importação, mapa, cache e correções
- README.txt      -> Documentação do projeto


8. BOAS PRÁTICAS DE USO
----------------------
- Priorizar CEP + Cidade + UF na planilha de entrada
- Corrigir manualmente apenas os pontos realmente divergentes
- Exportar o cache sempre após uma rodada de correções
- Reutilizar o cache em novos projetos ou apresentações
- Evitar reprocessar bases já enriquecidas


9. PERFIL DE USO IDEAL
---------------------
- RH e People Analytics
- Operações e Expansão
- BI e Planejamento Territorial
- Apresentações gerenciais
- Projetos de padronização e governança de dados


10. AUTORIA E CONTEXTO
---------------------
Projeto desenvolvido para uso interno, com foco em operações, análise de dados
e ganho de eficiência operacional.

Autor: Anderson Marinho
Contexto: Automação, BI e Governança de Dados Operacionais


11. OBSERVAÇÃO FINAL
-------------------
Este projeto foi desenhado para ser simples, auditável e extensível.
Novas camadas podem ser adicionadas, como:
- classificação por status
- filtros por região
- integração com Power BI
- versionamento de correções
- indicadores territoriais
- XLSX:
- ID_LOJA
- NOME_LOJA
- ENDERECO
- NUMERO
- COMPLEMENTO
- BAIRRO
- CIDADE
- UF
- CEP
- LATITUDE
- LONGITUDE
- STATUS


Sempre priorizando clareza, controle e redução de retrabalho.
