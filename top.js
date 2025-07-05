// top.js

document.addEventListener('DOMContentLoaded', () => {
    const top100TableBody = document.getElementById('top100TableBody');
    const refreshTop100Button = document.getElementById('refreshTop100');
    const globalLoader = document.getElementById('globalLoader');

    const COINGECKO_API_URL = 'https://api.coingecko.com/api/v3/coins/markets';
    const CACHE_KEY = 'top100CoinsCache';
    const CACHE_EXPIRATION_TIME = 5 * 60 * 1000; // 5 minutos em milissegundos

    /**
     * Exibe ou oculta o loader global.
     * @param {boolean} show - true para mostrar, false para ocultar.
     */
    function toggleLoader(show) {
        if (globalLoader) {
            globalLoader.style.display = show ? 'flex' : 'none';
        }
    }

    /**
     * Formata um número para moeda.
     * @param {number} value - O valor a ser formatado.
     * @returns {string} - O valor formatado como moeda.
     */
    function formatCurrency(value) {
        if (value === null || value === undefined) return 'R$ N/A'; // Mudado de '$ N/A' para 'R$ N/A'
        // Mudado de '$' + para usar o formato completo do Intl.NumberFormat
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL',
            minimumFractionDigits: 2,
            maximumFractionDigits: 6
        }).format(value);
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
     * Cria uma linha da tabela para uma criptomoeda.
     * @param {Object} coin - Objeto com os dados da moeda.
     * @param {number} rank - A classificação da moeda.
     * @returns {HTMLTableRowElement} - A linha da tabela.
     */
    function createCoinTableRow(coin, rank) {
        const row = document.createElement('tr');
        // Adicionar um atributo data-id para facilitar o acesso aos detalhes
        row.dataset.coinId = coin.id;
        row.style.cursor = 'pointer'; // Adiciona um cursor de ponteiro para indicar clicável

        row.innerHTML = `
            <td>${rank}</td>
            <td class="coin-cell">
                <img src="${coin.image}" alt="${coin.name} logo" class="coin-logo">
                <div>
                    <span class="coin-name">${coin.name}</span>
                    <span class="coin-symbol">${coin.symbol}</span>
                </div>
            </td>
            <td>${formatCurrency(coin.current_price)}</td>
            <td>${formatPercentage(coin.price_change_percentage_24h)}</td>
            <td>${formatCurrency(coin.market_cap)}</td>
            <td>${formatCurrency(coin.total_volume)}</td>
            <td>
                <button class="btn-action" data-coin-id="${coin.id}"><i class="fas fa-info-circle"></i> Detalhes</button>
            </td>
        `;
        return row;
    }

    /**
     * Busca os dados das Top 100 moedas da CoinGecko API.
     * Implementa um mecanismo de cache simples.
     */
    async function fetchTop100Coins() {
        toggleLoader(true);
        try {
            const cachedData = localStorage.getItem(CACHE_KEY);
            const cacheTimestamp = localStorage.getItem(CACHE_KEY + '_timestamp');

            if (cachedData && cacheTimestamp && (Date.now() - cacheTimestamp < CACHE_EXPIRATION_TIME)) {
                // Usar dados do cache se não expirou
                console.log('Dados Top 100 carregados do cache.');
                const coins = JSON.parse(cachedData);
                renderTop100Table(coins);
                return;
            }

            // Se o cache expirou ou não existe, buscar da API
            console.log('Buscando dados Top 100 da CoinGecko API...');
            const params = new URLSearchParams({
                vs_currency: 'brl', // JÁ ESTÁ CORRETO AQUI!
                order: 'market_cap_desc', // Ordem por capitalização de mercado decrescente
                per_page: 100,             // Apenas 100 moedas
                page: 1,                   // Primeira página
                sparkline: false,          // Não precisamos de dados de sparkline agora
                price_change_percentage: '24h' // Para a variação de 24h
            });

            const response = await fetch(`${COINGECKO_API_URL}?${params.toString()}`);
            if (!response.ok) {
                // Lidar com rate limit ou outros erros da API
                if (response.status === 429) {
                    throw new Error('Limite de taxa da CoinGecko excedido. Tente novamente mais tarde.');
                }
                throw new Error(`Erro ao buscar dados: ${response.statusText}`);
            }
            const coins = await response.json();

            // Armazenar no cache
            localStorage.setItem(CACHE_KEY, JSON.stringify(coins));
            localStorage.setItem(CACHE_KEY + '_timestamp', Date.now().toString());

            renderTop100Table(coins);

        } catch (error) {
            console.error('Erro ao carregar Top 100 moedas:', error);
            top100TableBody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--danger-color);">${error.message}</td></tr>`;
            alert('Erro ao carregar dados das Top 100 moedas: ' + error.message);
        } finally {
            toggleLoader(false);
        }
    }

    /**
     * Renderiza a tabela das Top 100 moedas.
     * @param {Array} coins - Array de objetos de moedas.
     */
    function renderTop100Table(coins) {
        top100TableBody.innerHTML = ''; // Limpa o corpo da tabela
        if (coins.length === 0) {
            top100TableBody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted);">Nenhuma moeda encontrada.</td></tr>`;
            return;
        }
        coins.forEach((coin, index) => {
            const row = createCoinTableRow(coin, index + 1);
            top100TableBody.appendChild(row);
        });
    }

    // Event Listener para redirecionar para a página de detalhes da moeda
    top100TableBody.addEventListener('click', (event) => {
        let targetRow = event.target.closest('tr'); // Pega a linha clicada
        // Se o clique foi no botão "Detalhes"
        if (event.target.closest('.btn-action')) {
            const coinId = event.target.closest('.btn-action').dataset.coinId;
            window.location.href = `coin-details.html?id=${coinId}`;
        } else if (targetRow && targetRow.dataset.coinId) { // Se o clique foi na linha da moeda
            const coinId = targetRow.dataset.coinId;
            window.location.href = `coin-details.html?id=${coinId}`;
        }
    });

    // Event Listeners
    refreshTop100Button.addEventListener('click', () => {
        // Forçar a busca de novos dados (ignorando o cache por um momento)
        localStorage.removeItem(CACHE_KEY);
        localStorage.removeItem(CACHE_KEY + '_timestamp');
        fetchTop100Coins();
    });

    // Função para inicializar a aba Top 100 quando ela se torna ativa
    // Esta função será chamada pelo script.js principal
    window.initializeTop100Tab = function() {
        fetchTop100Coins();
        // Opcional: configurar um refresh automático a cada X minutos para esta aba
        // setInterval(fetchTop100Coins, CACHE_EXPIRATION_TIME);
    };

    // Chamar a inicialização se a aba Top 100 for a ativa no carregamento inicial
    // Ou, se você gerencia as abas no script.js, ele chamará initializeTop100Tab
    if (document.getElementById('top100').classList.contains('active')) {
        window.initializeTop100Tab();
    }
});
