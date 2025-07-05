// coin-details.js

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
    const priceChartCanvas = document.getElementById('priceChart');
    let coinChart; // Variável para armazenar a instância do gráfico Chart.js

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
        // Usar 'pt-BR' para localização e 'BRL' para a moeda
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
     * Desenha o gráfico de preços usando Chart.js.
     * @param {Array<Array<number>>} prices - Array de arrays, onde cada sub-array é [timestamp, price].
     * @param {string} coinId - O ID da moeda para determinar a cor da linha.
     */
    function renderPriceChart(prices, coinId) {
        // Formatar dados para Chart.js
        // Ajustar a formatação da data/hora para português
        const labels = prices.map(p => new Date(p[0]).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }));
        const data = prices.map(p => p[1]);

        // Destruir gráfico anterior se existir
        if (coinChart) {
            coinChart.destroy();
        }

        const ctx = priceChartCanvas.getContext('2d');
        coinChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: `Preço (${VS_CURRENCY.toUpperCase()})`, // Rótulo do gráfico em BRL
                    data: data,
                    borderColor: 'rgb(75, 192, 192)', // Cor da linha padrão
                    backgroundColor: 'rgba(75, 192, 192, 0.2)', // Cor de fundo abaixo da linha
                    fill: true,
                    tension: 0.1, // Suavidade da linha
                    pointRadius: 0, // Remover pontos individuais
                    pointHoverRadius: 5,
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false // Oculta a legenda
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        callbacks: {
                            label: function(context) {
                                // Formatar o valor do tooltip em BRL
                                return `Preço: ${formatCurrency(context.raw)}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        type: 'category',
                        ticks: {
                            maxRotation: 45,
                            minRotation: 45,
                            color: 'var(--text-color)', // Cor dos rótulos do eixo X
                            autoSkip: true,
                            maxTicksLimit: 10
                        },
                        grid: {
                            color: 'var(--border-color)' // Cor das linhas de grade do eixo X
                        }
                    },
                    y: {
                        ticks: {
                            callback: function(value, index, values) {
                                // Formatar os rótulos do eixo Y como moeda BRL
                                return formatCurrency(value);
                            },
                            color: 'var(--text-color)' // Cor dos rótulos do eixo Y
                        },
                        grid: {
                            color: 'var(--border-color)' // Cor das linhas de grade do eixo Y
                        }
                    }
                }
            }
        });
    }

    /**
     * Busca os dados históricos de preços de uma moeda.
     * @param {string} coinId - O ID da moeda.
     * @param {string} days - O período de tempo (e.g., '1', '7', '30', '365', 'max').
     */
    async function fetchChartData(coinId, days) {
        try {
            // Alterar vs_currency para BRL
            const url = `${COINGECKO_API_BASE_URL}/coins/${coinId}/market_chart?vs_currency=${VS_CURRENCY}&days=${days}`;
            const response = await fetch(url);
            if (!response.ok) {
                if (response.status === 429) {
                    throw new Error('Limite de taxa da CoinGecko excedido para dados de gráfico. Tente novamente mais tarde.');
                }
                throw new Error(`Erro ao buscar dados do gráfico: ${response.statusText}`);
            }
            const data = await response.json();
            return data.prices; // Retorna um array de [timestamp, price]
        } catch (error) {
            console.error('Erro ao buscar dados do gráfico:', error);
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
            // Busca dados detalhados da moeda
            // *** AJUSTE AQUI: localization=true para obter a descrição em português ***
            const coinDetailsResponse = await fetch(`${COINGECKO_API_BASE_URL}/coins/${coinId}?localization=true&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false`);

            if (!coinDetailsResponse.ok) {
                if (coinDetailsResponse.status === 429) {
                    throw new Error('Limite de taxa da CoinGecko excedido. Tente novamente mais tarde.');
                }
                throw new Error(`Erro ao buscar dados: ${coinDetailsResponse.statusText}`);
            }
            const coin = await coinDetailsResponse.json();
            console.log('Dados da moeda:', coin); // Para depuração, verifique o objeto 'coin' no console

            // Preencher o cabeçalho e informações básicas
            coinImage.src = coin.image.large;
            coinName.textContent = coin.name;
            coinSymbol.textContent = coin.symbol.toUpperCase();
            // Acessar dados em BRL
            coinPrice.textContent = formatCurrency(coin.market_data.current_price.brl);
            // Usar price_change_percentage_24h_in_currency.brl, se disponível, senão usar o global price_change_percentage_24h
            coinPriceChange24h.innerHTML = `24h: ${formatPercentage(coin.market_data.price_change_percentage_24h_in_currency ? coin.market_data.price_change_percentage_24h_in_currency.brl : coin.market_data.price_change_percentage_24h)}`;

            // Preencher estatísticas, acessando dados em BRL
            marketCap.textContent = formatCurrency(coin.market_data.market_cap.brl);
            totalVolume.textContent = formatCurrency(coin.market_data.total_volume.brl);
            // .toLocaleString('pt-BR') para formatar números grandes
            circulatingSupply.textContent = coin.market_data.circulating_supply ? coin.market_data.circulating_supply.toLocaleString('pt-BR') : 'N/A';
            totalSupply.textContent = coin.market_data.total_supply ? coin.market_data.total_supply.toLocaleString('pt-BR') : 'N/A';
            marketCapRank.textContent = coin.market_data.market_cap_rank || 'N/A';
            ath.textContent = formatCurrency(coin.market_data.ath.brl);
            // Usar ath_change_percentage.brl, se disponível, senão usar o global ath_change_percentage
            athChange.innerHTML = formatPercentage(coin.market_data.ath_change_percentage.brl);

            // Descrição em português - Acessa .pt ou .en como fallback
            descCoinName.textContent = coin.name;
            // Verifica se a descrição em português existe, caso contrário, usa a versão em inglês ou um fallback genérico.
            descriptionText.innerHTML = coin.description[LOCALIZATION] || coin.description.en || 'Nenhuma descrição disponível.';

            // Links sociais e outros (textos dos links não vêm da API com localização, então são estáticos)
            socialLinksContainer.innerHTML = ''; // Limpa links anteriores
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

            // Busca e renderiza dados do gráfico
            const prices = await fetchChartData(coinId, chartDays);
            renderPriceChart(prices, coinId);

            toggleContent(false); // Esconde o loader, mostra o conteúdo

        } catch (error) {
            console.error('Erro ao carregar detalhes da moeda:', error);
            coinDetailsContent.innerHTML = `<p style="text-align: center; color: var(--danger-color);">Erro ao carregar detalhes da moeda: ${error.message}</p>`;
            toggleContent(false); // Esconde o loader mesmo em caso de erro
        }
    }

    // Event listener para os botões de controle do gráfico
    chartControls.addEventListener('click', async (event) => {
        if (event.target.tagName === 'BUTTON') {
            // Remove a classe 'active' de todos os botões
            chartControls.querySelectorAll('button').forEach(button => {
                button.classList.remove('active');
            });
            // Adiciona a classe 'active' ao botão clicado
            event.target.classList.add('active');

            const coinId = getCoinIdFromUrl();
            const days = event.target.dataset.days;

            if (coinId && days) {
                // Ao invés de recarregar TUDO, só recarregar o gráfico
                const prices = await fetchChartData(coinId, days);
                renderPriceChart(prices, coinId);
            }
        }
    });

    // Inicializa a página de detalhes
    const coinId = getCoinIdFromUrl();
    if (coinId) {
        fetchCoinDetails(coinId); // Carrega detalhes e o gráfico de 24h por padrão
    } else {
        coinDetailsContent.innerHTML = `<p style="text-align: center; color: var(--danger-color);">ID da moeda não encontrado na URL.</p>`;
        toggleContent(false);
    }
});
