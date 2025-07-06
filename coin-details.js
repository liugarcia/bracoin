document.addEventListener('DOMContentLoaded', () => {
    const coinDetailsLoader = document.getElementById('coinDetailsLoader');
    const coinDetailsContent = document.getElementById('coinDetailsContent');

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
    
    // Nova chave de cache para os detalhes completos da moeda (uma por moeda)
    const COIN_DETAILS_CACHE_PREFIX = 'coinDetailsCache_'; 
    const COIN_DETAILS_CACHE_EXPIRATION_TIME = 24 * 60 * 60 * 1000; // 24 horas em milissegundos

    // Nova chave de cache para os dados do gráfico (por moeda e por período)
    const CHART_DATA_CACHE_PREFIX = 'chartDataCache_';
    const CHART_DATA_CACHE_EXPIRATION_TIME = 10 * 60 * 1000; // 10 minutos em milissegundos para o gráfico

    /**
     * Exibe ou oculta o loader e o conteúdo.
     * @param {boolean} showLoader - true para mostrar o loader, false para mostrar o conteúdo.
     */
    function toggleContent(showLoader) {
        coinDetailsLoader.style.display = showLoader ? 'flex' : 'none';
        coinDetailsContent.style.display = showLoader ? 'none' : 'block';
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
        // Se não houver dados, exibe uma mensagem no container do gráfico
        if (!ohlcData || ohlcData.length === 0) {
            priceChartContainer.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding-top: 50px;">Dados do gráfico indisponíveis.</p>';
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
    }

    /**
     * Busca os dados históricos de preços OHLC de uma moeda, com cache e fallback.
     * @param {string} coinId - O ID da moeda.
     * @param {string} days - O período de tempo (e.g., '1', '7', '30', '365', 'max').
     * @returns {Array} - Array de dados OHLC.
     */
    async function fetchChartData(coinId, days) {
        const cacheKey = CHART_DATA_CACHE_PREFIX + coinId + '_' + days;
        let chartDataFromCache = null;

        // Tenta carregar do cache do gráfico primeiro
        const cachedData = localStorage.getItem(cacheKey);
        if (cachedData) {
            const { data, timestamp } = JSON.parse(cachedData);
            if (Date.now() - timestamp < CHART_DATA_CACHE_EXPIRATION_TIME) {
                chartDataFromCache = data;
                console.log(`Dados do gráfico para '${coinId}' (${days} dias) carregados do cache.`);
                return chartDataFromCache; // Retorna imediatamente se o cache for válido
            } else {
                console.log(`Cache do gráfico para '${coinId}' (${days} dias) expirado. Buscando da API.`);
            }
        }

        // Se o cache estiver expirado ou não existir, tenta buscar da API
        try {
            let validDays = days;
            if (days === '1') validDays = '7'; // Para granularidade horária para 24h
            if (days === 'max') validDays = '365'; // Ou ajuste para 'max' se o endpoint suportar

            const url = `${COINGECKO_API_BASE_URL}/coins/${coinId}/ohlc?vs_currency=${VS_CURRENCY}&days=${validDays}`;
            const response = await fetch(url);
            if (!response.ok) {
                if (response.status === 429) {
                    throw new Error('Limite de taxa excedido para dados de gráfico. Tentando carregar do cache antigo.');
                }
                throw new Error(`Erro ao buscar dados do gráfico OHLC: ${response.statusText}. Tentando carregar do cache antigo.`);
            }
            const data = await response.json();
            
            // Armazena os novos dados no cache
            localStorage.setItem(cacheKey, JSON.stringify({ data: data, timestamp: Date.now() }));
            console.log(`Dados do gráfico para '${coinId}' (${days} dias) atualizados da API e salvos no cache.`);
            return data;
        } catch (error) {
            console.error('Erro ao buscar dados do gráfico OHLC da API:', error);
            // Se a busca da API falhar, tente usar o cache (mesmo que expirado) como fallback
            if (chartDataFromCache) {
                alert('Erro ao atualizar dados do gráfico. Exibindo dados do cache antigo. Erro: ' + error.message);
                return chartDataFromCache;
            } else if (cachedData) { // Tenta usar o cache expirado se não houver um 'chartDataFromCache' já carregado
                const { data } = JSON.parse(cachedData);
                alert('Erro ao atualizar dados do gráfico. Exibindo dados do cache expirado. Erro: ' + error.message);
                return data;
            }
            // Se não houver cache algum, retorna vazio
            alert('Não foi possível carregar os dados do gráfico: ' + error.message);
            return [];
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
        athChange.innerHTML = formatPercentage(coin.market_data.ath_change_percentage.brl);

        descCoinName.textContent = coin.name;
        descriptionText.innerHTML = coin.description[LOCALIZATION] || coin.description.en || 'Nenhuma descrição disponível.';

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
        toggleContent(true); // Mostra o loader
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
            // Se o cache foi usado, esta chamada serve para atualizar os dados dinâmicos e o próprio cache.
            // Se o cache estava expirado ou não existia, esta é a busca primária.
            let coinApiData = null;
            try {
                console.log(`Buscando detalhes mais atualizados de '${coinId}' da API CoinGecko.`);
                const coinDetailsResponse = await fetch(`${COINGECKO_API_BASE_URL}/coins/${coinId}?localization=true&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false`);

                if (!coinDetailsResponse.ok) {
                    if (coinDetailsResponse.status === 429) {
                        throw new Error('Limite de taxa da CoinGecko excedido. Exibindo dados do cache, se disponível.');
                    }
                    throw new Error(`Erro ao buscar dados completos: ${coinDetailsResponse.statusText}. Exibindo dados do cache, se disponível.`);
                }
                coinApiData = await coinDetailsResponse.json();
                console.log('Dados completos atualizados da moeda:', coinApiData);

                // Armazena os dados atualizados no cache de detalhes
                localStorage.setItem(detailsCacheKey, JSON.stringify({ data: coinApiData, timestamp: Date.now() }));
                renderCoinDetails(coinApiData); // Atualiza a interface com os dados mais recentes
            } catch (apiError) {
                console.error('Erro na chamada da API de detalhes completos:', apiError);
                if (!coinDetailsFromCache) {
                    // Se não havia cache e a API falhou, mostre um erro crítico
                    coinDetailsContent.innerHTML = `<p style="text-align: center; color: var(--danger-color);">Erro ao carregar detalhes da moeda: ${apiError.message}</p>`;
                    toggleContent(false);
                    return; // Sai da função se não houver dados para exibir
                } else {
                    // Se havia cache e a API falhou, alerte mas continue com o cache
                    alert('Atenção: Não foi possível atualizar os dados da moeda. Exibindo informações do cache. Erro: ' + apiError.message);
                }
            }
            
            // 3. Sempre busca e renderiza os dados do gráfico (com sua própria lógica de cache/fallback)
            console.log(`Buscando dados do gráfico OHLC para '${coinId}'.`);
            const ohlcData = await fetchChartData(coinId, chartDays);
            renderPriceChart(ohlcData);

            toggleContent(false); // Esconde o loader quando todos os dados estiverem prontos
        } catch (error) { // Captura erros gerais que podem ter escapado (ex: coinId não encontrado)
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
                // Apenas busca e renderiza o gráfico, não mexe com os detalhes da moeda
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
