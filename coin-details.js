document.addEventListener('DOMContentLoaded', () => {
    const coinDetailsLoader = document.getElementById('coinDetailsLoader');
    const coinDetailsContent = document.getElementById('coinDetailsContent');
    const priceChartLoader = document.getElementById('priceChartLoader');

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
    let coinChart;

    const COINGECKO_API_BASE_URL = 'https://api.coingecko.com/api/v3';
    const VS_CURRENCY = 'brl';
    const LOCALIZATION = 'pt';
    
    const COIN_DETAILS_CACHE_PREFIX = 'coinDetailsCache_'; 
    const COIN_DETAILS_CACHE_EXPIRATION_TIME = 24 * 60 * 60 * 1000;

    const CHART_DATA_CACHE_PREFIX = 'chartDataCache_';
    const CHART_DATA_CACHE_EXPIRATION_TIME = 10 * 60 * 1000;
    
    let chartRetryTimeout = null;

    function toggleContent(showLoader) {
        coinDetailsLoader.style.display = showLoader ? 'flex' : 'none';
        coinDetailsContent.style.display = showLoader ? 'none' : 'block';
    }

    function toggleChartLoader(showLoader) {
        priceChartLoader.style.display = showLoader ? 'block' : 'none';
        priceChartContainer.style.display = showLoader ? 'none' : 'block';
    }

    function formatCurrency(value) {
        if (value === null || value === undefined || isNaN(value)) return 'R$ N/A';
        if (value === 0) return 'R$ 0,00';
        return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: value < 1 ? 8 : 2 });
    }

    function formatPercentage(value) {
        if (value === null || value === undefined || isNaN(value)) return '<span class="price-change neutral">N/A</span>';
        const className = value >= 0 ? 'positive' : 'negative';
        return `<span class="price-change ${className}">${value > 0 ? '+' : ''}${value.toFixed(2)}%</span>`;
    }

    function getCoinIdFromUrl() {
        const params = new URLSearchParams(window.location.search);
        return params.get('id');
    }

    /**
     * Renderiza o gráfico. Lida com o loader do gráfico.
     */
    function renderPriceChart(ohlcData) {
        toggleChartLoader(true); // Sempre mostra o loader enquanto o gráfico está sendo processado

        if (!ohlcData || ohlcData.length === 0) {
            console.warn('Nenhum dado OHLC disponível para renderizar o gráfico. Mantendo loader ativo.');
            if (coinChart) {
                coinChart.destroy();
                coinChart = null;
            }
            return; // Retorna, deixando o loader visível
        }

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
                toolbar: { show: false },
                zoom: { enabled: false },
                padding: { top: 10, right: 0, bottom: 0, left: 0 },
            },
            title: {
                text: 'Preço da Moeda (OHLC)',
                align: 'left',
                style: { color: 'var(--text-light)' }
            },
            xaxis: {
                type: 'datetime',
                labels: {
                    datetimeFormatter: { year: 'yyyy', month: 'MMM \'yy', day: 'dd MMM', hour: 'HH:mm' },
                    style: { colors: 'var(--text-light)', fontSize: '12px' },
                    offsetY: 15,
                },
                axisBorder: { show: false },
                axisTicks: { show: false },
                crosshairs: {
                    show: true,
                    stroke: { color: 'var(--primary-color)', width: 1, dashArray: 0 }
                },
                tooltip: { enabled: true, formatter: val => new Date(val).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }) }
            },
            yaxis: {
                tooltip: { enabled: true },
                labels: {
                    formatter: val => formatCurrency(val),
                    style: { colors: 'var(--text-light)', fontSize: '12px' }
                },
                axisBorder: { show: false },
                axisTicks: { show: false }
            },
            plotOptions: {
                candlestick: {
                    colors: { upward: '#00B746', downward: '#EF403C' },
                    wick: { useFillColor: true }
                }
            },
            tooltip: {
                theme: 'dark',
                x: { format: 'dd MMM HH:mm' },
                y: { formatter: val => formatCurrency(val) }
            },
            grid: {
                show: true,
                borderColor: 'var(--border-color)',
                strokeDashArray: 2,
                xaxis: { lines: { show: false } },
                yaxis: { lines: { show: true } }
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

    async function fetchChartData(coinId, days, isRetry = false) {
        const cacheKey = CHART_DATA_CACHE_PREFIX + coinId + '_' + days;
        let chartDataFromLocalCache = null;

        if (!isRetry && chartRetryTimeout) {
            clearTimeout(chartRetryTimeout);
            chartRetryTimeout = null;
        }

        const cachedDataRaw = localStorage.getItem(cacheKey);
        if (cachedDataRaw) {
            try {
                const { data, timestamp } = JSON.parse(cachedDataRaw);
                chartDataFromLocalCache = data;

                if (Date.now() - timestamp < CHART_DATA_CACHE_EXPIRATION_TIME) {
                    console.log(`Dados do gráfico para '${coinId}' (${days} dias) carregados do cache válido.`);
                    toggleChartLoader(false);
                    return data;
                } else {
                    console.log(`Cache do gráfico para '${coinId}' (${days} dias) expirado. Tentando buscar da API.`);
                }
            } catch (e) {
                console.error('Erro ao parsear cache do gráfico:', e);
                localStorage.removeItem(cacheKey); // Remove cache corrompido
            }
        }
        
        toggleChartLoader(true); // Mostra o loader enquanto tenta buscar ou re-tentar

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
                    toggleChartLoader(false);
                    return chartDataFromLocalCache;
                } else {
                    if (!chartRetryTimeout) {
                        chartRetryTimeout = setTimeout(async () => {
                            console.log('Tentando re-carregar dados do gráfico após 1 minuto...');
                            const retryOhlcData = await fetchChartData(coinId, days, true);
                            renderPriceChart(retryOhlcData);
                        }, 60 * 1000); // 1 minuto
                    }
                    return []; // Mantém o loader visível
                }
            }

            const data = await response.json();
            
            localStorage.setItem(cacheKey, JSON.stringify({ data: data, timestamp: Date.now() }));
            console.log(`Dados do gráfico para '${coinId}' (${days} dias) atualizados da API e salvos no cache.`);
            toggleChartLoader(false);
            return data;
        } catch (error) {
            console.error('Erro de rede ou outro erro ao chamar API do gráfico:', error);
            console.warn(`Não foi possível buscar dados do gráfico da API para '${coinId}' (${days} dias). Tentando usar cache ou agendando re-tentativa.`);
            
            if (chartDataFromLocalCache) {
                toggleChartLoader(false);
                return chartDataFromLocalCache;
            } else {
                if (!chartRetryTimeout) {
                    chartRetryTimeout = setTimeout(async () => {
                        console.log('Tentando re-carregar dados do gráfico após 1 minuto...');
                        const retryOhlcData = await fetchChartData(coinId, days, true);
                        renderPriceChart(retryOhlcData);
                    }, 60 * 1000);
                }
                return []; // Mantém o loader visível
            }
        }
    }

    /**
     * Preenche os elementos HTML com os detalhes da moeda.
     * @param {Object} coin - Objeto de dados da moeda. Pode ser completo da API, do cache completo ou um objeto simplificado do cache de lista.
     * @param {boolean} isFallbackData - Indica se os dados são do fallback (para ajustar a exibição).
     */
    function renderCoinDetails(coin, isFallbackData = false) {
        // Usa optional chaining e operadores OR para garantir que nada seja undefined/null
        coinImage.src = coin?.image?.large || coin?.image?.thumb || 'placeholder.png'; // fallback para imagem
        coinName.textContent = coin?.name || 'Moeda Desconhecida';
        coinSymbol.textContent = (coin?.symbol || 'N/A').toUpperCase();

        // Dados de preço e variação (presentes em ambos os tipos de dados)
        coinPrice.textContent = formatCurrency(coin?.market_data?.current_price?.brl || coin?.current_price);
        
        const priceChange24h = coin?.market_data?.price_change_percentage_24h_in_currency?.brl || coin?.price_change_percentage_24h;
        coinPriceChange24h.innerHTML = `24h: ${formatPercentage(priceChange24h)}`;

        // Dados completos (podem ser undefined se vierem do cache de lista)
        marketCap.textContent = formatCurrency(coin?.market_data?.market_cap?.brl);
        totalVolume.textContent = formatCurrency(coin?.market_data?.total_volume?.brl);
        circulatingSupply.textContent = coin?.market_data?.circulating_supply?.toLocaleString('pt-BR') || 'N/A';
        totalSupply.textContent = coin?.market_data?.total_supply?.toLocaleString('pt-BR') || 'N/A';
        marketCapRank.textContent = coin?.market_data?.market_cap_rank || 'N/A';
        ath.textContent = formatCurrency(coin?.market_data?.ath?.brl);
        athChange.innerHTML = formatPercentage(coin?.market_data?.ath_change_percentage?.brl);

        descCoinName.textContent = coin?.name || 'Moeda';
        // A descrição pode ser longa, usar pt ou en. Se não houver, "Nenhuma descrição".
        const descriptionContent = coin?.description?.[LOCALIZATION] || coin?.description?.en || 'Nenhuma descrição disponível.';
        descriptionText.innerHTML = descriptionContent;

        // Links sociais (somente presentes em dados completos)
        socialLinksContainer.innerHTML = '';
        if (!isFallbackData && coin.links) { // Só tenta renderizar links se não for dado de fallback (e se existirem)
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
        } else if (isFallbackData) {
            // Se for dado de fallback, você pode adicionar uma mensagem ou manter vazio
            socialLinksContainer.innerHTML = '<p class="text-muted">Links sociais serão carregados com os dados completos.</p>';
        }
    }

    async function loadCoinDetails(coinId, chartDays = '1') {
        toggleContent(true); // Mostra o loader principal
        let coinDetailsToRender = null; // O objeto final de detalhes que será usado para renderizar
        const detailsCacheKey = COIN_DETAILS_CACHE_PREFIX + coinId;
        let isFallbackRendering = false;

        // 1. Tenta carregar os detalhes completos do cache de 24h
        const cachedDetails = localStorage.getItem(detailsCacheKey);
        if (cachedDetails) {
            try {
                const { data, timestamp } = JSON.parse(cachedDetails);
                if (Date.now() - timestamp < COIN_DETAILS_CACHE_EXPIRATION_TIME) {
                    coinDetailsToRender = data;
                    console.log(`Detalhes completos de '${coinId}' carregados do cache (24h).`);
                    renderCoinDetails(coinDetailsToRender); // Renderiza rapidamente os dados do cache
                } else {
                    console.log(`Cache de detalhes para '${coinId}' expirado. Tentando buscar da API.`);
                }
            } catch (e) {
                console.error('Erro ao parsear cache de detalhes:', e);
                localStorage.removeItem(detailsCacheKey); // Remove cache corrompido
            }
        }

        // 2. Tenta buscar os dados mais atualizados da API para os detalhes completos
        try {
            console.log(`Buscando detalhes mais atualizados de '${coinId}' da API CoinGecko.`);
            const coinDetailsResponse = await fetch(`${COINGECKO_API_BASE_URL}/coins/${coinId}?localization=true&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false`);

            if (!coinDetailsResponse.ok) {
                console.warn(`API de detalhes para '${coinId}' falhou com status: ${coinDetailsResponse.status}.`);
                // Não lança erro fatal aqui. Continua para o fallback se necessário.
            } else {
                const coinApiData = await coinDetailsResponse.json();
                console.log('Dados completos atualizados da moeda:', coinApiData);
                localStorage.setItem(detailsCacheKey, JSON.stringify({ data: coinApiData, timestamp: Date.now() }));
                coinDetailsToRender = coinApiData; // Define para os dados mais frescos
                renderCoinDetails(coinDetailsToRender); // Atualiza a interface com os dados mais recentes
            }
        } catch (apiError) {
            console.error('Erro de rede ou outro erro ao chamar API de detalhes:', apiError);
            // Continua para o fallback se a API falhar
        }

        // 3. Fallback: Se ainda não tivermos dados completos, tente usar os dados da lista principal
        if (!coinDetailsToRender) {
            console.log(`Não foi possível obter dados completos para '${coinId}'. Tentando usar dados de fallback da lista principal.`);
            const cachedCoinListRaw = localStorage.getItem('cachedCoinList');
            if (cachedCoinListRaw) {
                try {
                    const cachedCoinList = JSON.parse(cachedCoinListRaw);
                    const fallbackCoin = cachedCoinList.find(coin => coin.id === coinId);
                    if (fallbackCoin) {
                        coinDetailsToRender = fallbackCoin;
                        isFallbackRendering = true;
                        console.log(`Detalhes de '${coinId}' carregados do cache da lista principal.`);
                        renderCoinDetails(coinDetailsToRender, isFallbackRendering); // Renderiza com os dados básicos
                    }
                } catch (e) {
                    console.error('Erro ao parsear cache da lista de moedas:', e);
                    localStorage.removeItem('cachedCoinList'); // Remove cache corrompido
                }
            }

            if (!coinDetailsToRender) {
                console.error(`ID da moeda '${coinId}' não encontrado em nenhum cache ou API.`);
                coinDetailsContent.innerHTML = `<p style="text-align: center; color: var(--danger-color);">Não foi possível carregar detalhes para esta moeda. Verifique o ID.</p>`;
                toggleContent(false);
                return; // Sai se não houver dados de forma alguma
            }
        }
        
        // Renderiza o gráfico independentemente do fallback dos detalhes
        console.log(`Buscando dados do gráfico OHLC para '${coinId}'.`);
        const ohlcData = await fetchChartData(coinId, chartDays);
        renderPriceChart(ohlcData);

        toggleContent(false); // Esconde o loader principal quando tudo estiver pronto
    }

    chartControls.addEventListener('click', async (event) => {
        if (event.target.tagName === 'BUTTON') {
            chartControls.querySelectorAll('button').forEach(button => {
                button.classList.remove('active');
            });
            event.target.classList.add('active');

            const coinId = getCoinIdFromUrl();
            const days = event.target.dataset.days;

            if (coinId && days) {
                if (chartRetryTimeout) {
                    clearTimeout(chartRetryTimeout);
                    chartRetryTimeout = null;
                }
                toggleChartLoader(true);
                const ohlcData = await fetchChartData(coinId, days);
                renderPriceChart(ohlcData);
            }
        }
    });

    const coinId = getCoinIdFromUrl();
    if (coinId) {
        loadCoinDetails(coinId);
    } else {
        coinDetailsContent.innerHTML = `<p style="text-align: center; color: var(--danger-color);">ID da moeda não encontrado na URL.</p>`;
        toggleContent(false);
    }
});
