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
    const priceChartContainer = document.getElementById('priceChart'); // Alterado para ser o contêiner do gráfico
    let coinChart; // Variável para armazenar a instância do ApexCharts

    const COINGECKO_API_BASE_URL = 'https://api.coingecko.com/api/v3';
    const VS_CURRENCY = 'brl'; // Definindo a moeda de comparação globalmente para BRL
    const LOCALIZATION = 'pt'; // Definindo a localização globalmente para português

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
        return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 6 });
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
        // Formatar dados para ApexCharts
        // ApexCharts espera um array de objetos { x: timestamp, y: [open, high, low, close] }
        const seriesData = ohlcData.map(d => ({
            x: new Date(d[0]),
            y: [d[1], d[2], d[3], d[4]]
        }));

        const options = {
            chart: {
                type: 'candlestick',
                height: 350,
                background: 'transparent', // Para integrar com o tema CSS
                toolbar: {
                    show: false // Oculta a barra de ferramentas padrão
                },
                zoom: {
                    enabled: true // Habilita zoom
                }
            },
            series: [{
                data: seriesData
            }],
            title: {
                text: 'Preço da Moeda (OHLC)',
                align: 'left',
                style: {
                    color: 'var(--text-color)' // Usa cor do tema CSS
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
                        colors: 'var(--text-color)' // Usa cor do tema CSS
                    }
                },
                axisBorder: {
                    show: false // Oculta a borda do eixo X
                },
                axisTicks: {
                    show: false // Oculta os ticks do eixo X
                }
            },
            yaxis: {
                tooltip: {
                    enabled: true
                },
                labels: {
                    formatter: function(val) {
                        return formatCurrency(val); // Formata rótulos do eixo Y como BRL
                    },
                    style: {
                        colors: 'var(--text-color)' // Usa cor do tema CSS
                    }
                },
                axisBorder: {
                    show: false // Oculta a borda do eixo Y
                },
                axisTicks: {
                    show: false // Oculta os ticks do eixo Y
                }
            },
            plotOptions: {
                candlestick: {
                    colors: {
                        // Cores para velas de alta e baixa
                        // Você pode ajustar estas cores no seu CSS para variáveis, se desejar
                        // Ex: 'var(--positive-color)', 'var(--negative-color)'
                        upward: '#00B746', // Verde para alta
                        downward: '#EF403C' // Vermelho para baixa
                    },
                    wick: {
                        useFillColor: true // Fio (wick) da vela usa a cor de preenchimento
                    }
                }
            },
            tooltip: {
                theme: 'dark', // Tema escuro para o tooltip
                x: {
                    format: 'dd MMM HH:mm' // Formato da data no tooltip
                },
                y: {
                    formatter: function(val) {
                        return formatCurrency(val); // Formata valores do tooltip
                    }
                }
            },
            grid: {
                show: true,
                borderColor: 'var(--border-color)', // Cor das linhas de grade do tema
                strokeDashArray: 2, // Linhas pontilhadas para as grades
                xaxis: {
                    lines: {
                        show: false // Oculta linhas de grade verticais
                    }
                },
                yaxis: {
                    lines: {
                        show: true // Mostra linhas de grade horizontais
                    }
                }
            }
        };

        // Se o gráfico já existe, ele é atualizado. Senão, é criado.
        if (coinChart) {
            coinChart.updateSeries([{ data: seriesData }]);
        } else {
            coinChart = new ApexCharts(priceChartContainer, options);
            coinChart.render();
        }
    }

    /**
     * Busca os dados históricos de preços OHLC de uma moeda.
     * A API CoinGecko para Candlestick tem um limite de dias diferente (e.g., 1, 7, 14, 30, 90, 180, 365, "max").
     * @param {string} coinId - O ID da moeda.
     * @param {string} days - O período de tempo (e.g., '1', '7', '30', '365', 'max').
     */
    async function fetchChartData(coinId, days) {
        try {
            // Para candlestick, usamos o endpoint /ohlc e precisamos mapear os dias corretamente.
            // A API de OHLC não aceita '1' ou 'max' da mesma forma que market_chart.
            // Para "1 dia" talvez seja melhor usar "7" e filtrar ou adaptar a granularidade.
            // Vamos manter os botões atuais, mas teremos que considerar a granularidade da API /ohlc
            // API CoinGecko /ohlc granularidade: 1-2 dias = 30min, 3-30 dias = 4h, >30 dias = 4d
            let validDays = days;
            if (days === '1') validDays = '7'; // Pegar 7 dias para ter granularidade de 30min
            if (days === 'max') validDays = '365'; // 'max' não é suportado pelo /ohlc, usar 365 como fallback

            const url = `${COINGECKO_API_BASE_URL}/coins/${coinId}/ohlc?vs_currency=${VS_CURRENCY}&days=${validDays}`;
            const response = await fetch(url);
            if (!response.ok) {
                if (response.status === 429) {
                    throw new Error('Limite de taxa da CoinGecko excedido para dados de gráfico. Tente novamente mais tarde.');
                }
                throw new Error(`Erro ao buscar dados do gráfico OHLC: ${response.statusText}`);
            }
            const data = await response.json();
            // data é um array de [timestamp, open, high, low, close]
            return data;
        } catch (error) {
            console.error('Erro ao buscar dados do gráfico OHLC:', error);
            alert('Erro ao carregar dados do gráfico: ' + error.message);
            return [];
        }
    }

    /**
     * Busca e exibe os detalhes de uma moeda.
     * @param {string} coinId - O ID da moeda (e.g., "bitcoin", "ethereum").
     * @param {string} chartDays - O período de tempo inicial para o gráfico (padrão '1').
     */
    async function fetchCoinDetails(coinId, chartDays = '1') {
        toggleContent(true); // Mostra o loader
        try {
            const coinDetailsResponse = await fetch(`${COINGECKO_API_BASE_URL}/coins/${coinId}?localization=true&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false`);

            if (!coinDetailsResponse.ok) {
                if (coinDetailsResponse.status === 429) {
                    throw new Error('Limite de taxa da CoinGecko excedido. Tente novamente mais tarde.');
                }
                throw new Error(`Erro ao buscar dados: ${coinDetailsResponse.statusText}`);
            }
            const coin = await coinDetailsResponse.json();
            console.log('Dados da moeda:', coin);

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

            const ohlcData = await fetchChartData(coinId, chartDays);
            renderPriceChart(ohlcData);

            toggleContent(false);

        } catch (error) {
            console.error('Erro ao carregar detalhes da moeda:', error);
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
            const days = event.target.dataset.days; // '1', '7', '30', etc.

            if (coinId && days) {
                // A CoinGecko API /ohlc tem granularidades específicas para dias
                // Ajustamos o 'days' aqui para pegar a granularidade correta para o Candlestick
                // Por exemplo, para "1 dia", a API só dá granularidade de 30min se o período for até 2 dias.
                // Para períodos maiores, a granularidade diminui.
                // Vamos passar o valor de 'days' e deixar a função fetchChartData ajustar se necessário.
                const ohlcData = await fetchChartData(coinId, days);
                renderPriceChart(ohlcData);
            }
        }
    });

    // Inicializa a página de detalhes
    const coinId = getCoinIdFromUrl();
    if (coinId) {
        // Ativa o botão de 24h por padrão, mas para OHLC, usaremos 7 dias inicialmente
        // para garantir dados OHLC com granularidade adequada (30min).
        // Se a API permitir 1 dia de OHLC, use '1'
        // Para este exemplo, manteremos os botões como estão e a função fetchChartData
        // fará o ajuste de 'days' para o endpoint /ohlc
        fetchCoinDetails(coinId);
    } else {
        coinDetailsContent.innerHTML = `<p style="text-align: center; color: var(--danger-color);">ID da moeda não encontrado na URL.</p>`;
        toggleContent(false);
    }
});
