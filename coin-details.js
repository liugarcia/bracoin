document.addEventListener('DOMContentLoaded', () => {
    const coinDetailsLoader = document.getElementById('coinDetailsLoader');
    const coinDetailsContent = document.getElementById('coinDetailsContent');
    const priceChartLoader = document.getElementById('priceChartLoader'); // O novo loader do gráfico

    const coinImage = document.getElementById('coinImage');
    const coinName = document.getElementById('coinName');
    const coinSymbol = document.getElementById('coinSymbol');
    const coinPrice = document.getElementById('coinPrice');
    const coinPriceChange24h = document.getElementById('coinPriceChange24h');
    const marketCap = document.getElementById('marketCap');
    const totalVolume = document.getElementById('totalVolume');
    const circulatingSupply = document.getElementById('circulatingSupply');
    const totalSupply = document.getElementById('totalSupply');
    const marketCapRank = document.getElementById('marketCapRank');
    const ath = document.getElementById('ath');
    const athChange = document.getElementById('athChange');
    const descCoinName = document.getElementById('descCoinName');
    const descriptionText = document.getElementById('descriptionText');
    const socialLinksContainer = document.getElementById('socialLinksContainer');

    const chartControls = document.querySelector('.chart-controls');
    const priceChartContainer = document.getElementById('priceChart');
    let coinChart; // Variável para armazenar a instância do ApexCharts

    const COINGECKO_API_BASE_URL = 'https://api.coingecko.com/api/v3';
    const VS_CURRENCY = 'brl'; // Definindo a moeda de comparação globalmente para BRL
    const LOCALIZATION = 'pt'; // Definindo a localização globalmente para português
    
    const COIN_DETAILS_CACHE_PREFIX = 'coinDetailsCache_'; 
    const COIN_DETAILS_CACHE_EXPIRATION_TIME = 24 * 60 * 60 * 1000; // 24 horas em milissegundos

    const CHART_DATA_CACHE_PREFIX = 'chartDataCache_';
    const CHART_DATA_CACHE_EXPIRATION_TIME = 10 * 60 * 1000; // 10 minutos em milissegundos para o gráfico
    
    // Variável para controlar se há uma re-tentativa do gráfico agendada
    let chartRetryTimeout = null;

    /**
     * Exibe ou oculta o loader principal e o conteúdo.
     * @param {boolean} showLoader - true para mostrar o loader, false para mostrar o conteúdo.
     */
    function toggleContent(showLoader) {
        coinDetailsLoader.style.display = showLoader ? 'flex' : 'none';
        coinDetailsContent.style.display = showLoader ? 'none' : 'block';
    }

    /**
     * Exibe ou oculta o loader do gráfico.
     * @param {boolean} showLoader - true para mostrar o loader, false para ocultar.
     */
    function toggleChartLoader(showLoader) {
        priceChartLoader.style.display = showLoader ? 'block' : 'none';
        priceChartContainer.style.display = showLoader ? 'none' : 'block'; // Oculta/mostra o container do gráfico
    }

    /**
     * Formata um número para moeda (BRL).
     * @param {number} value - O valor a ser formatado.
     * @returns {string} - O valor formatado como moeda (R$).
     */
    function formatCurrency(value) {
        if (value === null || value === undefined) return 'R$ N/A';
        if (value === 0) return 'R$ 0,00';
        return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: value < 1 ? 8 : 2 });
    }

    /**
     * Formata um número para porcentagem com cor.
     * @param {number} value - O valor da porcentagem.
     * @returns {string} - O HTML formatado com a cor correta.
     */
    function formatPercentage(value) {
        if (value === null || value === undefined) return '<span class="price-change neutral">N/A</span>';
        const className = value >= 0 ? 'positive' : 'negative';
        return `<span class="price-change ${className}">${value > 0 ? '+' : ''}${value.toFixed(2)}%</span>`;
    }

    /**
     * Obtém o ID da moeda da URL.
     * @returns {string|null} O ID da moeda ou null se não encontrado.
     */
    function getCoinIdFromUrl() {
        const params = new URLSearchParams(window.location.search);
        return params.get('id');
    }

    /**
     * Desenha o gráfico de preços usando ApexCharts (Candlestick).
     * @param {Array<Array<number>>} ohlcData - Array de arrays, onde cada sub-array é [timestamp, open, high, low, close].
     */
    function renderPriceChart(ohlcData) {
        toggleChartLoader(true); // Sempre mostra o loader enquanto o gráfico está sendo processado

        if (!ohlcData || ohlcData.length === 0) {
            console.warn('Nenhum dado OHLC disponível para renderizar o gráfico.');
            // Deixa o loader ativo se não há dados, esperando a re-tentativa.
            // priceChartContainer.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding-top: 50px;">Carregando dados do gráfico...</p>'; // Ou uma mensagem se quiser
            if (coinChart) {
                coinChart.destroy(); // Destrói a instância anterior se existir
                coinChart = null;
            }
            return;
        }

        // Se houver dados, formata e renderiza o gráfico
        const seriesData = ohlcData.map(d => ({
            x: new Date(d[0]),
            y: [d[1], d[2], d[3], d[4]]
        }));

        const options = {
            series: [{
                data: seriesData
            }],
            chart: {
                type: 'candlestick',
                height: 480,
                background: 'transparent',
                toolbar: {
                    show: false
                },
                zoom: {
                    enabled: false
                },
                padding: {
                    top: 10,
                    right: 0,
                    bottom: 0,
                    left: 0
                },
            },
            title: {
                text: 'Preço da Moeda (OHLC)',
                align: 'left',
                style: {
                    color: 'var(--text-light)'
                }
            },
            xaxis: {
                type: 'datetime',
                labels: {
                    datetimeFormatter: {
                        year: 'yyyy',
                        month: 'MMM \'yy',
                        day: 'dd MMM',
                        hour: 'HH:mm'
                    },
                    style: {
                        colors: 'var(--text-light)',
                        fontSize: '12px'
                    },
                    offsetY: 15,
                },
                axisBorder: {
                    show: false
                },
                axisTicks: {
                    show: false
                },
                crosshairs: {
                    show: true,
                    stroke: {
                        color: 'var(--primary-color)',
                        width: 1,
                        dashArray: 0,
                    }
                },
                tooltip: {
                    enabled: true,
                    formatter: function(val) {
                        return new Date(val).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
                    }
                }
            },
            yaxis: {
                tooltip: {
                    enabled: true
                },
                labels: {
                    formatter: function(val) {
                        return formatCurrency(val);
                    },
                    style: {
                        colors: 'var(--text-light)',
                        fontSize: '12px'
                    }
                },
                axisBorder: {
                    show: false
                },
                axisTicks: {
                    show: false
                }
            },
            plotOptions: {
                candlestick: {
                    colors: {
                        upward: '#00B746',
                        downward: '#EF403C'
                    },
                    wick: {
                        useFillColor: true
                    }
                }
            },
            tooltip: {
                theme: 'dark',
                x: {
                    format: 'dd MMM HH:mm'
                },
                y: {
                    formatter: function(val) {
                        return formatCurrency(val);
                    }
                }
            },
            grid: {
                show: true,
                borderColor: 'var(--border-color)',
                strokeDashArray: 2,
                xaxis: {
                    lines: {
                        show: false
                    }
                },
                yaxis: {
                    lines: {
                        show: true
                    }
                }
            }
        };

        if (coinChart) {
            coinChart.updateOptions(options);
            coinChart.updateSeries([{ data: seriesData }]);
        } else {
            coinChart = new ApexCharts(priceChartContainer, options);
            coinChart.render();
        }
        toggleChartLoader(false); // Esconde o loader do gráfico e mostra o gráfico
    }

    /**
     * Busca os dados históricos de preços OHLC de uma moeda, com cache e re-tentativa silenciosa.
     * @param {string} coinId - O ID da moeda.
     * @param {string} days - O período de tempo (e.g., '1', '7', '30', '365', 'max').
     * @param {boolean} isRetry - Indica se esta é uma tentativa de re-execução.
     * @returns {Array} - Array de dados OHLC. Retorna array vazio se não houver dados.
     */
    async function fetchChartData(coinId, days, isRetry = false) {
        const cacheKey = CHART_DATA_CACHE_PREFIX + coinId + '_' + days;
        let chartDataFromLocalCache = null;

        // Limpa qualquer re-tentativa anterior se esta não for uma re-tentativa
        if (!isRetry && chartRetryTimeout) {
            clearTimeout(chartRetryTimeout);
            chartRetryTimeout = null;
        }

        const cachedDataRaw = localStorage.getItem(cacheKey);
        if (cachedDataRaw) {
            const { data, timestamp } = JSON.parse(cachedDataRaw);
            chartDataFromLocalCache = data;

            if (Date.now() - timestamp < CHART_DATA_CACHE_EXPIRATION_TIME) {
                console.log(`Dados do gráfico para '${coinId}' (${days} dias) carregados do cache válido.`);
                toggleChartLoader(false); // Se carregou do cache, esconde o loader do gráfico
                return data;
            } else {
                console.log(`Cache do gráfico para '${coinId}' (${days} dias) expirado. Tentando buscar da API.`);
            }
        }
        
        // Se ainda não carregou do cache válido, mostra o loader
        toggleChartLoader(true);

        try {
            let validDays = days;
            if (days === '1') validDays = '7';
            if (days === 'max') validDays = '365'; 

            const url = `${COINGECKO_API_BASE_URL}/coins/${coinId}/ohlc?vs_currency=${VS_CURRENCY}&days=${validDays}`;
            const response = await fetch(url);
            
            if (!response.ok) {
                console.warn(`API do gráfico para '${coinId}' (${days} dias) falhou com status: ${response.status}.`);
                console.warn(`Tentando carregar dados do cache ou agendando re-tentativa.`);
                
                if (chartDataFromLocalCache) {
                    toggleChartLoader(false); // Se tem cache, mostra o gráfico e esconde o loader
                    return chartDataFromLocalCache;
                } else {
                    // Não tem dados nem da API nem do cache. Agenda re-tentativa silenciosa.
                    if (!chartRetryTimeout) { // Para evitar múltiplas re-tentativas
                        chartRetryTimeout = setTimeout(async () => {
                            console.log('Tentando re-carregar dados do gráfico após 1 minuto...');
                            const retryOhlcData = await fetchChartData(coinId, days, true); // Chame novamente como re-tentativa
                            renderPriceChart(retryOhlcData);
                        }, 60 * 1000); // 1 minuto
                    }
                    return []; // Retorna vazio, o loader permanece
                }
            }

            const data = await response.json();
            
            localStorage.setItem(cacheKey, JSON.stringify({ data: data, timestamp: Date.now() }));
            console.log(`Dados do gráfico para '${coinId}' (${days} dias) atualizados da API e salvos no cache.`);
            toggleChartLoader(false); // Esconde o loader e mostra o gráfico
            return data;
        } catch (error) {
            console.error('Erro de rede ou outro erro ao chamar API do gráfico:', error);
            console.warn(`Não foi possível buscar dados do gráfico da API para '${coinId}' (${days} dias). Tentando usar cache ou agendando re-tentativa.`);
            
            if (chartDataFromLocalCache) {
                toggleChartLoader(false); // Se tem cache, mostra o gráfico e esconde o loader
                return chartDataFromLocalCache;
            } else {
                // Não tem dados nem da API nem do cache. Agenda re-tentativa silenciosa.
                if (!chartRetryTimeout) { // Para evitar múltiplas re-tentativas
                    chartRetryTimeout = setTimeout(async () => {
                        console.log('Tentando re-carregar dados do gráfico após 1 minuto...');
                        const retryOhlcData = await fetchChartData(coinId, days, true); // Chame novamente como re-tentativa
                        renderPriceChart(retryOhlcData);
                    }, 60 * 1000); // 1 minuto
                }
                return []; // Retorna vazio, o loader permanece
            }
        }
    }

    /**
     * Preenche os elementos HTML com os detalhes da moeda.
     * @param {Object} coin - Objeto de dados da moeda completo da API /coins/{id}.
     */
    function renderCoinDetails(coin) {
        coinImage.src = coin.image.large;
        coinName.textContent = coin.name;
        coinSymbol.textContent = coin.symbol.toUpperCase();
        coinPrice.textContent = formatCurrency(coin.market_data.current_price.brl);
        coinPriceChange24h.innerHTML = `24h: ${formatPercentage(coin.market_data.price_change_percentage_24h_in_currency ? coin.market_data.price_change_percentage_24h_in_currency.brl : coin.market_data.price_change_percentage_24h)}`;

        marketCap.textContent = formatCurrency(coin.market_data.market_cap.brl);
        totalVolume.textContent = formatCurrency(coin.market_data.total_volume.brl);
        circulatingSupply.textContent = coin.market_data.circulating_supply ? coin.market_data.circulating_supply.toLocaleString('pt-BR') : 'N/A';
        totalSupply.textContent = coin.market_data.total_supply ? coin.market_data.total_supply.toLocaleString('pt-BR') : 'N/A';
        marketCapRank.textContent = coin.market_data.market_cap_rank || 'N/A';
        ath.textContent = formatCurrency(coin.market_data.ath.brl);
        athChange.innerHTML = formatPercentage(coin.market_data.ath_data.brl.percentage);

        descCoinName.textContent = coin.name;
        // Usa `coin.description.pt` se existir, caso contrário `coin.description.en`
        // Se ambos não existirem ou estiverem vazios, usa um fallback padrão
        const descriptionContent = coin.description[LOCALIZATION] || coin.description.en || '';
        descriptionText.innerHTML = descriptionContent || 'Nenhuma descrição disponível.';


        socialLinksContainer.innerHTML = '';
        if (coin.links) {
            if (coin.links.homepage && coin.links.homepage[0]) {
                socialLinksContainer.innerHTML += `<a href="${coin.links.homepage[0]}" target="_blank"><i class="fas fa-globe"></i> Website</a>`;
            }
            if (coin.links.twitter_screen_name) {
                socialLinksContainer.innerHTML += `<a href="https://twitter.com/${coin.links.twitter_screen_name}" target="_blank"><i class="fab fa-twitter"></i> Twitter</a>`;
            }
            if (coin.links.subreddit_url) {
                socialLinksContainer.innerHTML += `<a href="${coin.links.subreddit_url}" target="_blank"><i class="fab fa-reddit"></i> Reddit</a>`;
            }
            if (coin.links.telegram_channel_identifier) {
                socialLinksContainer.innerHTML += `<a href="https://t.me/${coin.links.telegram_channel_identifier}" target="_blank"><i class="fab fa-telegram-plane"></i> Telegram</a>`;
            }
            if (coin.links.repos_url && coin.links.repos_url.github && coin.links.repos_url.github.length > 0) {
                socialLinksContainer.innerHTML += `<a href="${coin.links.repos_url.github[0]}" target="_blank"><i class="fab fa-github"></i> GitHub</a>`;
            }
        }
    }

    /**
     * Carrega os detalhes de uma moeda, usando cache para dados completos e sempre buscando o gráfico.
     * @param {string} coinId - O ID da moeda.
     * @param {string} chartDays - O período de tempo inicial para o gráfico (padrão '1').
     */
    async function loadCoinDetails(coinId, chartDays = '1') {
        toggleContent(true); // Mostra o loader principal
        let coinDetailsFromCache = null;
        const detailsCacheKey = COIN_DETAILS_CACHE_PREFIX + coinId;

        try {
            // 1. Tenta carregar os detalhes completos do cache de 24h
            const cachedDetails = localStorage.getItem(detailsCacheKey);
            if (cachedDetails) {
                const { data, timestamp } = JSON.parse(cachedDetails);
                if (Date.now() - timestamp < COIN_DETAILS_CACHE_EXPIRATION_TIME) {
                    coinDetailsFromCache = data;
                    console.log(`Detalhes completos de '${coinId}' carregados do cache (24h).`);
                    renderCoinDetails(coinDetailsFromCache); // Renderiza rapidamente os dados do cache
                } else {
                    console.log(`Cache de detalhes para '${coinId}' expirado. Buscando da API.`);
                }
            }

            // 2. Tenta buscar os dados mais atualizados da API para os detalhes completos
            let coinApiData = null;
            try {
                console.log(`Buscando detalhes mais atualizados de '${coinId}' da API CoinGecko.`);
                const coinDetailsResponse = await fetch(`${COINGECKO_API_BASE_URL}/coins/${coinId}?localization=true&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false`);

                if (!coinDetailsResponse.ok) {
                    // Se a API falhar, não lança erro fatal aqui para os detalhes,
                    // mas verifica se há cache para renderizar.
                    console.warn(`API de detalhes para '${coinId}' falhou com status: ${coinDetailsResponse.status}.`);
                    if (!coinDetailsFromCache) {
                        // Se não tinha cache e a API falhou, aí sim é um erro visível
                        coinDetailsContent.innerHTML = `<p style="text-align: center; color: var(--danger-color);">Erro ao carregar detalhes da moeda: Não foi possível obter dados da API nem do cache.</p>`;
                        toggleContent(false);
                        return; // Sai da função
                    }
                    // Se tinha cache, continua usando ele
                } else {
                    coinApiData = await coinDetailsResponse.json();
                    console.log('Dados completos atualizados da moeda:', coinApiData);
                    // Armazena os dados atualizados no cache de detalhes
                    localStorage.setItem(detailsCacheKey, JSON.stringify({ data: coinApiData, timestamp: Date.now() }));
                    renderCoinDetails(coinApiData); // Atualiza a interface com os dados mais recentes
                }
            } catch (apiError) {
                console.error('Erro de rede ou outro erro ao chamar API de detalhes:', apiError);
                if (!coinDetailsFromCache) {
                    // Se não tinha cache e a API falhou, mostre um erro crítico
                    coinDetailsContent.innerHTML = `<p style="text-align: center; color: var(--danger-color);">Erro ao carregar detalhes da moeda: ${apiError.message}. Tente novamente mais tarde.</p>`;
                    toggleContent(false);
                    return; // Sai da função se não houver dados para exibir
                } else {
                    // Se havia cache e a API falhou, apenas loga e usa o cache existente
                    console.warn('Não foi possível atualizar os dados da moeda. Exibindo informações do cache. Erro: ', apiError.message);
                }
            }
            
            // 3. Sempre busca e renderiza os dados do gráfico (com sua própria lógica de cache/fallback silencioso)
            console.log(`Buscando dados do gráfico OHLC para '${coinId}'.`);
            const ohlcData = await fetchChartData(coinId, chartDays);
            renderPriceChart(ohlcData); // Essa função lida com o loader do gráfico e o estado sem dados

            toggleContent(false); // Esconde o loader principal quando todos os dados estiverem prontos
        } catch (error) { 
            console.error('Erro geral ao carregar detalhes da moeda:', error);
            coinDetailsContent.innerHTML = `<p style="text-align: center; color: var(--danger-color);">Erro ao carregar detalhes da moeda: ${error.message}</p>`;
            toggleContent(false);
        }
    }

    // Event listener para os botões de controle do gráfico
    chartControls.addEventListener('click', async (event) => {
        if (event.target.tagName === 'BUTTON') {
            chartControls.querySelectorAll('button').forEach(button => {
                button.classList.remove('active');
            });
            event.target.classList.add('active');

            const coinId = getCoinIdFromUrl();
            const days = event.target.dataset.days;

            if (coinId && days) {
                // Ao clicar em um botão do gráfico, limpa qualquer re-tentativa pendente
                if (chartRetryTimeout) {
                    clearTimeout(chartRetryTimeout);
                    chartRetryTimeout = null;
                }
                toggleChartLoader(true); // Mostra o loader do gráfico imediatamente ao mudar o período
                const ohlcData = await fetchChartData(coinId, days);
                renderPriceChart(ohlcData);
            }
        }
    });

    // Inicializa a página de detalhes quando o DOM estiver completamente carregado
    const coinId = getCoinIdFromUrl();
    if (coinId) {
        loadCoinDetails(coinId);
    } else {
        coinDetailsContent.innerHTML = `<p style="text-align: center; color: var(--danger-color);">ID da moeda não encontrado na URL.</p>`;
        toggleContent(false); // Esconde o loader e exibe a mensagem de erro
    }
});
