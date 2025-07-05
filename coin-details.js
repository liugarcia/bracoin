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
    let coinChart;

    const COINGECKO_API_BASE_URL = 'https://api.coingecko.com/api/v3';
    const VS_CURRENCY = 'brl';
    const LOCALIZATION = 'pt';

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
                height: 350,
                background: 'transparent',
                toolbar: {
                    show: true
                },
                zoom: {
                    enabled: false
                },
                // AJUSTE CRÍTICO AQUI: padding para o gráfico
                padding: {
                    top: 8,   // Diminua este valor para mover o gráfico mais para cima
                    right: 0,
                    bottom: 10, // Diminua ou ajuste conforme a necessidade para a parte inferior
                    left: 0
                }
            },
            title: {
                text: 'Preço da Moeda (OHLC)',
                align: 'left',
                style: {
                    color: 'var(--text-light)' // Correção: use a variável CSS correta
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
                        colors: 'var(--text-light)' // Correção: use a variável CSS correta
                    }
                },
                axisBorder: {
                    show: false
                },
                axisTicks: {
                    show: false
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
                        colors: 'var(--text-light)' // Correção: use a variável CSS correta
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
            coinChart.updateOptions(options); // Usar updateOptions para atualizar settings como padding
            coinChart.updateSeries([{ data: seriesData }]);
        } else {
            coinChart = new ApexCharts(priceChartContainer, options);
            coinChart.render();
        }
    }

    /**
     * Busca os dados históricos de preços OHLC de uma moeda.
     * @param {string} coinId - O ID da moeda.
     * @param {string} days - O período de tempo (e.g., '1', '7', '30', '365', 'max').
     */
    async function fetchChartData(coinId, days) {
        try {
            let validDays = days;
            // A CoinGecko API /ohlc tem granularidades específicas para dias
            // Para "1 dia" (24h), é melhor buscar um período um pouco maior para ter 30min de granularidade.
            // Para 'max', '365' dias é um bom fallback para /ohlc.
            if (days === '1') validDays = '7'; // Pegar 7 dias para ter granularidade de 30min para 24h
            if (days === 'max') validDays = '365'; // 'max' não é suportado diretamente por /ohlc

            const url = `${COINGECKO_API_BASE_URL}/coins/${coinId}/ohlc?vs_currency=${VS_CURRENCY}&days=${validDays}`;
            const response = await fetch(url);
            if (!response.ok) {
                if (response.status === 429) {
                    throw new Error('Limite de taxa da CoinGecko excedido para dados de gráfico. Tente novamente mais tarde.');
                }
                throw new Error(`Erro ao buscar dados do gráfico OHLC: ${response.statusText}`);
            }
            const data = await response.json();
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
        toggleContent(true);
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

    chartControls.addEventListener('click', async (event) => {
        if (event.target.tagName === 'BUTTON') {
            chartControls.querySelectorAll('button').forEach(button => {
                button.classList.remove('active');
            });
            event.target.classList.add('active');

            const coinId = getCoinIdFromUrl();
            const days = event.target.dataset.days;

            if (coinId && days) {
                const ohlcData = await fetchChartData(coinId, days);
                renderPriceChart(ohlcData);
            }
        }
    });

    const coinId = getCoinIdFromUrl();
    if (coinId) {
        fetchCoinDetails(coinId);
    } else {
        coinDetailsContent.innerHTML = `<p style="text-align: center; color: var(--danger-color);">ID da moeda não encontrado na URL.</p>`;
        toggleContent(false);
    }
});
