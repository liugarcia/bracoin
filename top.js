// top.js

document.addEventListener('DOMContentLoaded', () => {
    const top100TableBody = document.getElementById('top100TableBody');
    const refreshTop100Button = document.getElementById('refreshTop100');
    const globalLoader = document.getElementById('globalLoader');

    const COINGECKO_API_URL = 'https://api.coingecko.com/api/v3/coins/markets';
    const CACHE_KEY = 'top100CoinsCache'; // Cache para os dados brutos da API de Top 100
    const CACHE_EXPIRATION_TIME = 5 * 60 * 1000; // 5 minutos em milissegundos

    // --- CHAVE DE CACHE PARA A LISTA FILTRADA DE MOEDAS (usada por coin-details.js) ---
    const FILTERED_COIN_LIST_CACHE_KEY = 'cachedCoinList'; 
    // --------------------------------------------------------------------------------

    // --- NOVA ADIÇÃO: LISTA DE SÍMBOLOS DE MOEDAS EMBRULHADAS A SEREM IGNORADAS ---
    const WRAPPED_COINS_SYMBOLS = ['wbtc', 'weth', 'seth', 'wsteth', 'weeth', 'cbbtc', 'reth', 'rseth', 'meth', 'lbtc', 'clbtc', 'ezeth', 'wbnb', 'solvbtc', 'oseth', 'steth', 'bsc-usd', 'jitosol', 'bnsol', 'jupsol', 'msol', 'lseth', 'syrupusdc', 'usdt0', 'usdtb', 'jlp', 'susds', 'buidl', 'susde', 'usde', 'usds', 'usdx', 'usdy', 'whype']; // Adicione outros símbolos conforme necessário, SEMPRE EM MINÚSCULAS
    // -------------------------------------------------------------------------

    // Variável para armazenar os dados das moedas em memória para acesso rápido
    let cachedCoinsData = null; // Isto ainda guarda os dados brutos, antes da filtragem

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
                console.log('Dados Top 100 carregados do cache (localStorage).');
                const coinsFromCache = JSON.parse(cachedData);
                cachedCoinsData = coinsFromCache; // Armazena também em memória
                const filteredCoins = filterWrappedCoins(coinsFromCache);
                renderTop100Table(filteredCoins);
                // --- NOVA ADIÇÃO: SALVAR A LISTA FILTRADA PARA FALLBACK DO coin-details.js ---
                localStorage.setItem(FILTERED_COIN_LIST_CACHE_KEY, JSON.stringify(filteredCoins));
                // ---------------------------------------------------------------------------
                return;
            }

            console.log('Buscando dados Top 100 da CoinGecko API...');
            const params = new URLSearchParams({
                vs_currency: 'brl',
                order: 'market_cap_desc',
                per_page: 250, 
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

            localStorage.setItem(CACHE_KEY, JSON.stringify(coins));
            localStorage.setItem(CACHE_KEY + '_timestamp', Date.now().toString());

            cachedCoinsData = coins; // Armazena os dados brutos da API em memória

            const filteredCoins = filterWrappedCoins(coins);
            renderTop100Table(filteredCoins);
            // --- NOVA ADIÇÃO: SALVAR A LISTA FILTRADA PARA FALLBACK DO coin-details.js ---
            localStorage.setItem(FILTERED_COIN_LIST_CACHE_KEY, JSON.stringify(filteredCoins));
            // ---------------------------------------------------------------------------

        } catch (error) {
            console.error('Erro ao carregar Top 100 moedas:', error);
            top100TableBody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--danger-color);">Erro ao carregar dados: ${error.message}</td></tr>`;
            // Não usamos alert aqui para evitar interromper o usuário. O erro no console é suficiente.
        } finally {
            toggleLoader(false);
        }
    }

    /**
     * Filtra uma lista de moedas, removendo aquelas que são consideradas "embrulhadas".
     * @param {Array} coins - Array de objetos de moedas.
     * @returns {Array} - Array de moedas filtradas (até 100).
     */
    function filterWrappedCoins(coins) {
        const filtered = [];
        let count = 0;
        for (const coin of coins) {
            const symbolLower = coin.symbol.toLowerCase();
            if (!WRAPPED_COINS_SYMBOLS.includes(symbolLower)) {
                filtered.push(coin);
                count++;
            }
            if (count >= 100) {
                break;
            }
        }
        return filtered;
    }

    /**
     * Renderiza a tabela das Top 100 moedas.
     * @param {Array} coins - Array de objetos de moedas.
     */
    function renderTop100Table(coins) {
        top100TableBody.innerHTML = '';
        if (coins.length === 0) {
            top100TableBody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted);">Nenhuma moeda encontrada após a filtragem.</td></tr>`;
            return;
        }
        let rank = 1;
        for (const coin of coins) {
            const row = createCoinTableRow(coin, rank);
            top100TableBody.appendChild(row);
            rank++;
        }
    }

    top100TableBody.addEventListener('click', (event) => {
        let targetElement = event.target.closest('tr') || event.target.closest('.btn-action');
        const coinId = targetElement?.dataset.coinId;

        if (coinId) {
            window.location.href = `coin-details.html?id=${coinId}`;
        }
    });

    refreshTop100Button.addEventListener('click', () => {
        localStorage.removeItem(CACHE_KEY);
        localStorage.removeItem(CACHE_KEY + '_timestamp');
        localStorage.removeItem(FILTERED_COIN_LIST_CACHE_KEY); // Limpa também o cache da lista filtrada
        cachedCoinsData = null;
        fetchTop100Coins();
    });

    window.initializeTop100Tab = function() {
        fetchTop100Coins();
    };

    if (document.getElementById('top100').classList.contains('active')) {
        window.initializeTop100Tab();
    }
});
