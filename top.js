// top.js

document.addEventListener('DOMContentLoaded', () => {
    const top100TableBody = document.getElementById('top100TableBody');
    const refreshTop100Button = document.getElementById('refreshTop100');
    const globalLoader = document.getElementById('globalLoader');

    const COINGECKO_API_URL = 'https://api.coingecko.com/api/v3/coins/markets';
    const CACHE_KEY = 'top100CoinsCache';
    const CACHE_EXPIRATION_TIME = 5 * 60 * 1000; // 5 minutos em milissegundos

    // --- NOVA ADIÇÃO: LISTA DE SÍMBOLOS DE MOEDAS EMBRULHADAS A SEREM IGNORADAS ---
    const WRAPPED_COINS_SYMBOLS = ['wbtc', 'weth', 'seth' ,'wsteth', 'weeth', 'cbbtc' , 'reth', 'rseth' , 'meth' ,'lbtc', 'clbtc', 'ezeth' , 'wbnb', 'solvbtc' , 'oseth' , 'steth' , 'bsc-usd' , 'jitosol' , 'bnsol' , 'jupsol' , 'msol']; // Adicione outros símbolos conforme necessário, SEMPRE EM MINÚSCULAS
    // -------------------------------------------------------------------------

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
        if (value === null || value === undefined) return 'R$ N/A';
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
        row.dataset.coinId = coin.id;
        row.style.cursor = 'pointer';

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
                console.log('Dados Top 100 carregados do cache.');
                const coins = JSON.parse(cachedData);
                // --- NOVA CHAMADA: FILTRAR MOEDAS DO CACHE ---
                const filteredCoins = filterWrappedCoins(coins);
                renderTop100Table(filteredCoins);
                // ------------------------------------------
                return;
            }

            console.log('Buscando dados Top 100 da CoinGecko API...');
            const params = new URLSearchParams({
                vs_currency: 'brl',
                order: 'market_cap_desc',
                per_page: 250, // Aumentamos para buscar mais e garantir 100 moedas após a filtragem
                page: 1,
                sparkline: false,
                price_change_percentage: '24h'
            });

            const response = await fetch(`${COINGECKO_API_URL}?${params.toString()}`);
            if (!response.ok) {
                if (response.status === 429) {
                    throw new Error('Limite de taxa da CoinGecko excedido. Tente novamente mais tarde.');
                }
                throw new Error(`Erro ao buscar dados: ${response.statusText}`);
            }
            const coins = await response.json();

            // --- NOVA ADIÇÃO: FILTRAR MOEDAS DA API ANTES DE CACHE E RENDERIZAR ---
            const filteredCoins = filterWrappedCoins(coins);
            // -----------------------------------------------------------------

            // Armazenar no cache os dados **originais** (sem filtrar), para que se a lista de ignorados mudar, o cache ainda possa ser reprocessado
            localStorage.setItem(CACHE_KEY, JSON.stringify(coins));
            localStorage.setItem(CACHE_KEY + '_timestamp', Date.now().toString());

            renderTop100Table(filteredCoins);

        } catch (error) {
            console.error('Erro ao carregar Top 100 moedas:', error);
            top100TableBody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--danger-color);">${error.message}</td></tr>`;
            alert('Erro ao carregar dados das Top 100 moedas: ' + error.message);
        } finally {
            toggleLoader(false);
        }
    }

    // --- NOVA FUNÇÃO: FILTRA MOEDAS EMBRULHADAS ---
    /**
     * Filtra uma lista de moedas, removendo aquelas que são consideradas "embrulhadas".
     * @param {Array} coins - Array de objetos de moedas.
     * @returns {Array} - Array de moedas filtradas.
     */
    function filterWrappedCoins(coins) {
        const filtered = [];
        let count = 0;
        for (const coin of coins) {
            // Converte o símbolo para minúsculas para comparação
            const symbolLower = coin.symbol.toLowerCase();
            // Verifica se o símbolo está na lista de moedas embrulhadas
            if (!WRAPPED_COINS_SYMBOLS.includes(symbolLower)) {
                filtered.push(coin);
                count++;
            }
            // Parar quando tivermos 100 moedas válidas
            if (count >= 100) {
                break;
            }
        }
        return filtered;
    }
    // -----------------------------------------------------------------

    /**
     * Renderiza a tabela das Top 100 moedas.
     * @param {Array} coins - Array de objetos de moedas.
     */
    function renderTop100Table(coins) {
        top100TableBody.innerHTML = '';
        if (coins.length === 0) {
            top100TableBody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted);">Nenhuma moeda encontrada.</td></tr>`;
            return;
        }
        // Usamos um contador `rank` separado para manter a classificação correta após a filtragem
        let rank = 1;
        for (const coin of coins) {
            const row = createCoinTableRow(coin, rank);
            top100TableBody.appendChild(row);
            rank++;
        }
    }

    // Event Listener para redirecionar para a página de detalhes da moeda
    top100TableBody.addEventListener('click', (event) => {
        let targetRow = event.target.closest('tr');
        if (event.target.closest('.btn-action')) {
            const coinId = event.target.closest('.btn-action').dataset.coinId;
            window.location.href = `coin-details.html?id=${coinId}`;
        } else if (targetRow && targetRow.dataset.coinId) {
            const coinId = targetRow.dataset.coinId;
            window.location.href = `coin-details.html?id=${coinId}`;
        }
    });

    // Event Listeners
    refreshTop100Button.addEventListener('click', () => {
        localStorage.removeItem(CACHE_KEY);
        localStorage.removeItem(CACHE_KEY + '_timestamp');
        fetchTop100Coins();
    });

    // Função para inicializar a aba Top 100 quando ela se torna ativa
    window.initializeTop100Tab = function() {
        fetchTop100Coins();
    };

    if (document.getElementById('top100').classList.contains('active')) {
        window.initializeTop100Tab();
    }
});
