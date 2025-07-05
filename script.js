document.addEventListener('DOMContentLoaded', function() {
    // --- CONFIGURAÇÕES GLOBAIS ---
    const CONFIG = {
        apiBaseUrl: 'https://api.geckoterminal.com/api/v2',
        cacheExpiration: 5 * 60 * 1000, // 5 minutos de cache para os dados da API
        requestInterval: 2000, // Atraso de 2000ms (2 segundos) por requisição
        maxRetries: 3,
        defaultLogo: 'https://via.placeholder.com/64?text=LOGO'
    };

    // --- MAPEAMENTO DE REDES E SUAS PROPRIEDADES DE CONTRATO ---
    const NETWORK_MAPPING = {
        'eth': { apiPath: 'eth', name: 'Ethereum', contractLength: 42, prefix: '0x' },
        'bsc': { apiPath: 'bsc', name: 'Binance Smart Chain', contractLength: 42, prefix: '0x' },
        'polygon': { apiPath: 'polygon', name: 'Polygon', contractLength: 42, prefix: '0x' },
        'avax': { apiPath: 'avalanche', name: 'Avalanche', contractLength: 42, prefix: '0x' },
        'arbitrum': { apiPath: 'arbitrum', name: 'Arbitrum', contractLength: 42, prefix: '0x' },
        'optimism': { apiPath: 'optimism', name: 'Optimism', contractLength: 42, prefix: '0x' },
        'solana': { apiPath: 'solana', name: 'Solana', contractLength: 44, prefix: '' }
    };

    // --- ELEMENTOS DO DOM ---
    const DOM = {
        mainTabs: document.getElementById('mainTabs'),
        tabContents: document.querySelectorAll('.tab-content'),
        tabLinks: document.querySelectorAll('.tab-link'),
        coinForm: document.getElementById('coinForm'),
        coinDetailModal: document.getElementById('coinDetailModal'),
        coinDetailContent: document.getElementById('coinDetailContent'),
        refreshTrending: document.getElementById('refreshTrending'),
        globalSearch: document.getElementById('globalSearch'),
        trendingTableBody: document.getElementById('trendingTableBody'),
        newListingsTableBody: document.getElementById('newListingsTableBody'),
        coinName: document.getElementById('coinName'),
        coinSymbol: document.getElementById('coinSymbol'),
        coinContract: document.getElementById('coinContract'),
        coinNetwork: document.getElementById('coinNetwork'),
        coinWebsite: document.getElementById('coinWebsite'),
        coinDescription: document.getElementById('coinDescription'),
        coinLogo: document.getElementById('coinLogo'),
        // Campos de redes sociais
        coinTwitter: document.getElementById('coinTwitter'),
        coinTelegram: document.getElementById('coinTelegram'),
        coinDiscord: document.getElementById('coinDiscord'),
        coinReddit: document.getElementById('coinReddit'),
        coinFacebook: document.getElementById('coinFacebook'),
        coinBitcointalk: document.getElementById('coinBitcointalk'),
        coinGithub: document.getElementById('coinGithub'),
        coinMedium: document.getElementById('coinMedium'),
        coinYoutube: document.getElementById('coinYoutube'),
        // ---
        globalLoader: document.getElementById('globalLoader')
    };

    // --- ESTADO DA APLICAÇÃO ---
    const STATE = {
        coinsData: [],
        priceChart: null,
        isUpdating: false,
        currentTab: 'trending'
    };

    // --- VARIÁVEIS PARA O GERENCIAMENTO DA FILA DE REQUISIÇÕES ---
    let requestQueue = [];
    let isProcessingQueue = false;
    let lastRequestTime = 0;

    // --- INICIALIZAÇÃO ---
    init();

    async function init() {
        showLoader(true);
        try {
            await loadCoinsFromJSON();
            setupEventListeners();
            showTab(STATE.currentTab);
        } catch (error) {
            console.error('Erro na inicialização:', error);
            showToast('Erro ao carregar a aplicação. Tente recarregar a página.', 'error');
            loadSampleData(); // Carrega dados de exemplo se o JSON falhar
        } finally {
            showLoader(false);
        }
    }

    async function loadCoinsFromJSON() {
        try {
            const response = await fetch('coins.json');
            if (!response.ok) {
                throw new Error(`Erro ao carregar coins.json: ${response.statusText}`);
            }

            const data = await response.json();

            if (!data.coins || !Array.isArray(data.coins)) {
                throw new Error('Formato inválido do arquivo JSON: esperado "coins" como um array.');
            }

            STATE.coinsData = data.coins.map(coin => ({
                ...coin,
                contract: coin.contract ? coin.contract.toLowerCase() : '',
                lastUpdated: null,
                price: 0,
                priceChange24h: 0,
                priceChange7d: 0,
                volume24h: 0,
                liquidity: 0,
                // Revertendo para holders
                holders: 0,
                // Removendo campos de liquidez bloqueada
                // isLiquidityLocked: null,
                // liquidityUnlockDate: null,
                socials: {
                    twitter: coin.socials?.twitter || '',
                    telegram: coin.socials?.telegram || '',
                    discord: coin.socials?.discord || '',
                    reddit: coin.socials?.reddit || '',
                    facebook: coin.socials?.facebook || '',
                    bitcointalk: coin.socials?.bitcointalk || '',
                    github: coin.socials?.github || '',
                    medium: coin.socials?.medium || '',
                    youtube: coin.socials?.youtube || ''
                }
            }));

            await refreshAllCoinsData();
        } catch (error) {
            console.error('Falha ao carregar dados do JSON:', error);
            showToast('Erro ao carregar dados das moedas do arquivo.', 'error');
            throw error;
        }
    }

    function setupEventListeners() {
        DOM.tabLinks.forEach(link => {
            link.addEventListener('click', function(e) {
                e.preventDefault();
                const tabId = this.getAttribute('data-tab');
                STATE.currentTab = tabId;
                showTab(tabId);
            });
        });

        DOM.coinForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            await addNewCoin();
        });

        DOM.refreshTrending.addEventListener('click', async function() {
            await refreshAllCoinsData();
        });

        DOM.globalSearch.addEventListener('input', debounce(filterCoins, 300));

        document.querySelector('.close').addEventListener('click', closeModal);
        window.addEventListener('click', function(e) {
            if (e.target === DOM.coinDetailModal) closeModal();
        });
    }

    function enqueueRequest(requestFunction, description = 'API request') {
        return new Promise((resolve, reject) => {
            requestQueue.push({ requestFunction, resolve, reject, description });
            processQueue();
        });
    }

    async function processQueue() {
        if (isProcessingQueue || requestQueue.length === 0) {
            isProcessingQueue = false;
            return;
        }

        isProcessingQueue = true;

        const now = Date.now();
        const timeSinceLastRequest = now - lastRequestTime;
        const timeToWait = CONFIG.requestInterval - timeSinceLastRequest;

        if (timeToWait > 0) {
            await new Promise(resolve => setTimeout(resolve, timeToWait));
        }

        const { requestFunction, resolve, reject, description } = requestQueue.shift();
        console.log(`Processando: ${description} (Restantes na fila: ${requestQueue.length})`);

        try {
            const result = await requestFunction();
            lastRequestTime = Date.now();
            resolve(result);
        } catch (error) {
            console.error(`Erro ao processar ${description}:`, error);
            reject(error);
        } finally {
            isProcessingQueue = false;
            if (requestQueue.length > 0) {
                setTimeout(processQueue, 10);
            }
        }
    }

    async function refreshAllCoinsData() {
        if (STATE.isUpdating) {
            showToast('Atualização já em andamento. Aguarde.', 'info');
            return;
        }

        STATE.isUpdating = true;
        DOM.refreshTrending.disabled = true;
        DOM.refreshTrending.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Atualizando...';

        try {
            const coinsToUpdate = [...STATE.coinsData]
                .sort((a, b) => (new Date(a.lastUpdated || 0)) - (new Date(b.lastUpdated || 0)));

            let successCount = 0;
            let pendingRequests = [];

            for (const coin of coinsToUpdate) {
                pendingRequests.push(
                    fetchCoinData(coin)
                        .then(apiData => {
                            if (apiData && !apiData.error) {
                                Object.assign(coin, apiData);
                                successCount++;
                            } else {
                                console.warn(`Dados de API incompletos ou com erro para ${coin.symbol}: ${apiData?.error || 'N/A'}`);
                            }
                        })
                        .catch(error => {
                            console.error(`Erro ao atualizar dados para ${coin.symbol}:`, error);
                            showToast(`Falha ao atualizar ${coin.symbol}: ${error.message}`, 'error');
                        })
                );
            }

            await Promise.allSettled(pendingRequests);

            STATE.coinsData.sort((a, b) => b.volume24h - a.volume24h);
            updateTrendingTable();
            updateNewListingsTable();
            showToast(`Dados atualizados: ${successCount}/${coinsToUpdate.length} moedas`, 'success');

        } catch (error) {
            console.error('Erro geral ao atualizar dados:', error);
            showToast('Erro ao atualizar alguns dados. Verifique o console.', 'error');
        } finally {
            STATE.isUpdating = false;
            DOM.refreshTrending.disabled = false;
            DOM.refreshTrending.innerHTML = '<i class="fas fa-sync-alt"></i> Atualizar';
        }
    }

    /**
     * MODIFICAÇÃO PRINCIPAL AQUI:
     * Agora busca dados do endpoint /info para obter holders e outros detalhes,
     * e os dados de pool para preço/volume.
     * @param {object} coin - O objeto moeda.
     * @param {number} retryCount - Contador de tentativas para recursão.
     * @returns {Promise<object>} Um objeto contendo os dados da API ou um objeto de erro.
     */
    async function fetchCoinData(coin, retryCount = 0) {
        const cachedData = getCachedCoinData(coin);
        if (cachedData) {
            return { ...cachedData, fromCache: true };
        }

        const networkInfo = NETWORK_MAPPING[coin.network];
        if (!networkInfo) {
            return { error: `Rede "${coin.network}" não suportada`, lastUpdated: new Date().toISOString() };
        }

        return enqueueRequest(async () => {
            try {
                let finalData = {};

                // 1. Fetch info data (for holders, description, social links etc.)
                const infoResponse = await fetch(
                    `${CONFIG.apiBaseUrl}/networks/${networkInfo.apiPath}/tokens/${coin.contract}/info`
                );
                if (!infoResponse.ok) {
                    throw new Error(`HTTP ${infoResponse.status} ao buscar info para o contrato ${coin.contract}`);
                }
                const infoData = await infoResponse.json();
                if (infoData.data?.attributes) {
                    const infoAttributes = infoData.data.attributes;
                    finalData.holders = infoAttributes.holders?.count || 0;
                    finalData.description = infoAttributes.description || '';
                    finalData.website = infoAttributes.websites?.[0] || ''; // Pega o primeiro website
                    finalData.logo = infoAttributes.image_url || infoAttributes.image?.large || CONFIG.defaultLogo;
                    finalData.socials = {
                        twitter: infoAttributes.twitter_handle ? `https://twitter.com/${infoAttributes.twitter_handle}` : '',
                        telegram: infoAttributes.telegram_handle ? `https://t.me/${infoAttributes.telegram_handle}` : '',
                        discord: infoAttributes.discord_url || '',
                        reddit: infoAttributes.reddit_url || '', // Assumindo que a API pode ter reddit_url
                        facebook: infoAttributes.facebook_url || '', // Assumindo
                        bitcointalk: infoAttributes.bitcointalk_url || '', // Assumindo
                        github: infoAttributes.github_url || '', // Assumindo
                        medium: infoAttributes.medium_url || '', // Assumindo
                        youtube: infoAttributes.youtube_url || '' // Assumindo
                    };
                }

                // 2. Fetch pools data (for price, volume, liquidity)
                const poolsResponse = await fetch(
                    `${CONFIG.apiBaseUrl}/networks/${networkInfo.apiPath}/tokens/${coin.contract}/pools`
                );

                if (!poolsResponse.ok) {
                    throw new Error(`HTTP ${poolsResponse.status} ao buscar pools para o contrato ${coin.contract}`);
                }

                const poolsData = await poolsResponse.json();
                const relevantPool = poolsData.data?.length > 0 ? poolsData.data[0] : null;

                if (relevantPool?.attributes) {
                    const attributes = relevantPool.attributes;
                    finalData.price = parseFloat(attributes.base_token_price_usd) || 0;
                    finalData.priceChange24h = parseFloat(attributes.price_change_percentage?.h24) || 0;
                    finalData.priceChange7d = parseFloat(attributes.price_change_percentage?.d7 || attributes.price_change_percentage?.h7) || 0;
                    finalData.volume24h = parseFloat(attributes.volume_usd?.h24) || 0;
                    finalData.liquidity = parseFloat(attributes.reserve_in_usd || attributes.total_reserve_in_usd) || 0;
                } else {
                     console.warn(`Nenhuma pool encontrada ou dados insuficientes para preço/volume do token ${coin.symbol}.`);
                }

                finalData.lastUpdated = new Date().toISOString();
                cacheCoinData(coin, finalData);
                return finalData;

            } catch (error) {
                console.error(`Erro na requisição da API para ${coin.symbol} (interna):`, error.message);
                if (error.message.includes('HTTP 429') && retryCount < CONFIG.maxRetries) {
                    console.warn(`Tentando novamente para ${coin.symbol} após 429. Tentativa ${retryCount + 1}`);
                    return await fetchCoinData(coin, retryCount + 1);
                }
                throw error;
            }
        }, `busca de dados para ${coin.symbol}`);
    }

    async function fetchHistoricalData(coin, retryCount = 0) {
        const networkInfo = NETWORK_MAPPING[coin.network];
        if (!networkInfo) return null;

        return enqueueRequest(async () => {
            try {
                const poolsResponse = await fetch(
                    `${CONFIG.apiBaseUrl}/networks/${networkInfo.apiPath}/tokens/${coin.contract}/pools`
                );

                if (!poolsResponse.ok) {
                    throw new Error(`HTTP ${poolsResponse.status} ao buscar pools para dados históricos do contrato ${coin.contract}`);
                }

                const poolsData = await poolsResponse.json();
                const relevantPool = poolsData.data?.length > 0 ? poolsData.data[0] : null;

                if (relevantPool?.id) {
                    const poolId = relevantPool.id.split('_')[1];
                    const ohlcvResponse = await fetch(
                        `${CONFIG.apiBaseUrl}/networks/${networkInfo.apiPath}/pools/${poolId}/ohlcv/day?aggregate=1&limit=30`
                    );

                    if (ohlcvResponse.ok) {
                        const ohlcvData = await ohlcvResponse.json();
                        if (ohlcvData?.data?.attributes?.ohlcv) {
                            return ohlcvData.data.attributes.ohlcv.map(item => ({
                                date: new Date(item[0] * 1000),
                                price: parseFloat(item[4])
                            })).filter(item => !isNaN(item.price));
                        }
                    }
                }

                return null;
            } catch (error) {
                console.error(`Erro na requisição da API para histórico de ${coin.symbol} (interna):`, error.message);
                if (error.message.includes('HTTP 429') && retryCount < CONFIG.maxRetries) {
                    console.warn(`Tentando novamente para histórico de ${coin.symbol} após 429. Tentativa ${retryCount + 1}`);
                    return await fetchHistoricalData(coin, retryCount + 1);
                }
                throw error;
            }
        }, `busca histórica para ${coin.symbol}`);
    }

    window.showCoinDetail = async function(coinId, event) {
        if (event) event.stopPropagation();

        const coin = STATE.coinsData.find(c => c.id == coinId);
        if (!coin) {
            showToast('Moeda não encontrada nos dados.', 'error');
            return;
        }

        showModalLoading(true);

        try {
            // Garante que os dados mais recentes sejam carregados para o modal
            const apiData = await fetchCoinData(coin);
            if (apiData && !apiData.error) {
                Object.assign(coin, apiData);
            }

            const historicalData = await fetchHistoricalData(coin);
            renderCoinDetail(coin, historicalData);
            DOM.coinDetailModal.style.display = 'block';
        } catch (error) {
            console.error('Erro ao carregar detalhes da moeda:', error);
            showToast('Erro ao carregar detalhes da moeda. Tente novamente.', 'error');
            closeModal();
        } finally {
            showModalLoading(false);
        }
    };

    window.refreshSingleCoin = async function(coinId) {
        const coin = STATE.coinsData.find(c => c.id == coinId);
        if (!coin) {
            showToast('Moeda não encontrada para atualização.', 'error');
            return;
        }

        const refreshBtn = document.querySelector('.coin-detail-actions .btn-submit');
        const originalText = refreshBtn.innerHTML;
        refreshBtn.disabled = true;
        refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Atualizando...';

        try {
            const apiData = await fetchCoinData(coin);

            if (!apiData || apiData.error) {
                throw new Error(apiData?.error || 'Erro desconhecido ao buscar dados da API.');
            }

            Object.assign(coin, apiData);

            const historicalData = await fetchHistoricalData(coin);
            renderCoinDetail(coin, historicalData);

            updateTrendingTable();
            updateNewListingsTable();
            showToast('Dados da moeda atualizados com sucesso!', 'success');
        } catch (error) {
            console.error('Erro ao atualizar moeda individual:', error);
            showToast(`Erro ao atualizar moeda: ${error.message}`, 'error');
        } finally {
            refreshBtn.disabled = false;
            refreshBtn.innerHTML = originalText;
        }
    };

    async function addNewCoin() {
        const formData = getFormData();

        if (!validateCoinData(formData)) {
            return;
        }

        const exists = STATE.coinsData.some(c =>
            c.contract === formData.contract.toLowerCase() &&
            c.network === formData.network
        );

        if (exists) {
            showToast('Esta moeda já está cadastrada!', 'warning');
            return;
        }

        const newCoin = {
            id: Date.now(),
            ...formData,
            contract: formData.contract.toLowerCase(),
            dateAdded: new Date().toISOString(),
            price: 0,
            priceChange24h: 0,
            priceChange7d: 0,
            volume24h: 0,
            liquidity: 0,
            holders: 0, // Inicializa com 0
            lastUpdated: null
        };

        STATE.coinsData.unshift(newCoin);
        DOM.coinForm.reset();

        showToast('Moeda adicionada localmente. Buscando dados da API...', 'info');

        try {
            const apiData = await fetchCoinData(newCoin);
            if (apiData && !apiData.error) {
                Object.assign(newCoin, apiData);
                showToast('Moeda adicionada e dados da API carregados com sucesso!', 'success');
            } else {
                const errorMsg = apiData?.error || 'Sem dados da API ou erro desconhecido.';
                showToast(`Moeda adicionada, mas houve um problema ao buscar dados da API: ${errorMsg}`, 'warning');
            }

            updateTrendingTable();
            updateNewListingsTable();
            showCoinDetail(newCoin.id);
        } catch (error) {
            console.error('Erro ao adicionar moeda e buscar dados da API:', error);
            showToast('Erro crítico ao buscar dados da API para a nova moeda.', 'error');
        }
    }

    function isValidContract(contract, network) {
        const networkInfo = NETWORK_MAPPING[network];
        if (!networkInfo) {
            return false;
        }

        if (networkInfo.prefix && !contract.startsWith(networkInfo.prefix)) {
            return false;
        }

        if (contract.length !== networkInfo.contractLength) {
            return false;
        }

        if (networkInfo.prefix === '0x') {
            const hexRegex = /^0x[0-9a-fA-F]{40}$/;
            if (!hexRegex.test(contract)) {
                return false;
            }
        } else if (network === 'solana') {
            const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
            if (!base58Regex.test(contract)) {
                return false;
            }
        }
        return true;
    }

    function validateCoinData(data) {
        if (!data.name || data.name.trim().length < 2) {
            showToast('Nome da moeda deve ter pelo menos 2 caracteres.', 'error');
            return false;
        }

        if (!data.symbol || data.symbol.trim().length < 2 || data.symbol.trim().length > 10) {
            showToast('Símbolo deve ter entre 2 e 10 caracteres.', 'error');
            return false;
        }

        if (!data.contract || !isValidContract(data.contract, data.network)) {
            showToast('Contrato inválido ou formato incorreto para a rede selecionada.', 'error');
            return false;
        }

        if (!data.network || !NETWORK_MAPPING[data.network]) {
            showToast('Rede blockchain inválida ou não selecionada.', 'error');
            return false;
        }

        if (data.website && !isValidUrl(data.website)) {
            showToast('URL do website inválida.', 'error');
            return false;
        }

        if (data.logo && !isValidUrl(data.logo)) {
            showToast('URL do logo inválida.', 'error');
            return false;
        }

        if (data.socials) {
            if (data.socials.twitter && !isValidUrl(data.socials.twitter)) {
                showToast('URL do Twitter inválida.', 'error');
                return false;
            }
            if (data.socials.telegram && !isValidUrl(data.socials.telegram)) {
                showToast('URL do Telegram inválida.', 'error');
                return false;
            }
            if (data.socials.discord && data.socials.discord !== '' && !isValidUrl(data.socials.discord)) { // Permite string vazia
                showToast('URL do Discord inválida.', 'error');
                return false;
            }
            if (data.socials.reddit && data.socials.reddit !== '' && !isValidUrl(data.socials.reddit)) {
                showToast('URL do Reddit inválida.', 'error');
                return false;
            }
            if (data.socials.facebook && data.socials.facebook !== '' && !isValidUrl(data.socials.facebook)) {
                showToast('URL do Facebook inválida.', 'error');
                return false;
            }
            if (data.socials.bitcointalk && data.socials.bitcointalk !== '' && !isValidUrl(data.socials.bitcointalk)) {
                showToast('URL do Bitcointalk inválida.', 'error');
                return false;
            }
            if (data.socials.github && data.socials.github !== '' && !isValidUrl(data.socials.github)) {
                showToast('URL do GitHub inválida.', 'error');
                return false;
            }
            if (data.socials.medium && data.socials.medium !== '' && !isValidUrl(data.socials.medium)) {
                showToast('URL do Medium inválida.', 'error');
                return false;
            }
            if (data.socials.youtube && data.socials.youtube !== '' && !isValidUrl(data.socials.youtube)) {
                showToast('URL do YouTube inválida.', 'error');
                return false;
            }
        }
        return true;
    }

    function isValidUrl(urlString) {
        try {
            new URL(urlString);
            return true;
        } catch {
            return false;
        }
    }

    function updateTrendingTable() {
        const trendingCoins = [...STATE.coinsData]
            .filter(coin => coin.volume24h > 0)
            .sort((a, b) => b.volume24h - a.volume24h)
            .slice(0, 50);

        renderTable(DOM.trendingTableBody, trendingCoins, (coin, index) => `
            <td>${index + 1}</td>
            <td>
                <div class="coin-cell" onclick="showCoinDetail(${coin.id}, event)">
                    <img src="${safeImageSource(coin.logo)}" alt="${coin.name}" class="coin-logo"
                         onerror="this.src='${CONFIG.defaultLogo}'">
                    <div>
                        <span class="coin-name">${coin.name}</span>
                        <span class="coin-symbol">${coin.symbol}</span>
                    </div>
                </div>
            </td>
            <td>${formatCurrency(coin.price)}</td>
            <td><span class="price-change ${getPriceChangeClass(coin.priceChange24h)}">${formatPercentage(coin.priceChange24h)}</span></td>
            <td>${formatCurrency(coin.volume24h)}</td>
            <td>${formatCurrency(coin.liquidity)}</td>
            <td>
                <button class="btn-action" onclick="showCoinDetail(${coin.id}, event)">
                    <i class="fas fa-eye"></i> Detalhes
                </button>
            </td>
        `);
    }

    function updateNewListingsTable() {
        const newCoins = [...STATE.coinsData]
            .sort((a, b) => new Date(b.dateAdded) - new Date(a.dateAdded))
            .slice(0, 20);

        renderTable(DOM.newListingsTableBody, newCoins, (coin, index) => `
            <td>${index + 1}</td>
            <td>
                <div class="coin-cell" onclick="showCoinDetail(${coin.id}, event)">
                    <img src="${safeImageSource(coin.logo)}" alt="${coin.name}" class="coin-logo"
                         onerror="this.src='${CONFIG.defaultLogo}'">
                    <div>
                        <span class="coin-name">${coin.name}</span>
                        <span class="coin-symbol">${coin.symbol}</span>
                    </div>
                </div>
            </td>
            <td>${formatCurrency(coin.price)}</td>
            <td><span class="price-change ${getPriceChangeClass(coin.priceChange24h)}">${formatPercentage(coin.priceChange24h)}</span></td>
            <td>${new Date(coin.dateAdded).toLocaleDateString()}</td>
            <td>
                <button class="btn-action" onclick="showCoinDetail(${coin.id}, event)">
                    <i class="fas fa-eye"></i> Detalhes
                </button>
            </td>
        `);
    }

    /**
     * MODIFICAÇÃO PRINCIPAL AQUI:
     * Retornando a exibição do número de holders.
     * Renderiza o conteúdo do modal de detalhes da moeda.
     * @param {object} coin - O objeto da moeda com todos os dados.
     * @param {Array<object>|null} historicalData - Dados históricos para o gráfico.
     */
    function renderCoinDetail(coin, historicalData) {
        const priceFormatted = formatCurrency(coin.price);
        const volumeFormatted = formatCurrency(coin.volume24h);
        const liquidityFormatted = formatCurrency(coin.liquidity);
        const dateAdded = new Date(coin.dateAdded).toLocaleString();
        const lastUpdated = coin.lastUpdated ? new Date(coin.lastUpdated).toLocaleString() : 'Nunca atualizado';
        const networkInfo = NETWORK_MAPPING[coin.network] || { name: coin.network };

        DOM.coinDetailContent.innerHTML = `
            <div class="coin-detail-header">
                <img src="${safeImageSource(coin.logo)}" alt="${coin.name}" class="coin-detail-logo"
                     onerror="this.src='${CONFIG.defaultLogo}'">
                <div>
                    <h3 class="coin-detail-name">${coin.name} <span class="coin-detail-symbol">${coin.symbol}</span></h3>
                    <div class="coin-detail-price">${priceFormatted}</div>
                    <div class="coin-detail-change">
                        <span class="price-change ${getPriceChangeClass(coin.priceChange24h)}">24h: ${formatPercentage(coin.priceChange24h)}</span>
                        <span class="price-change ${getPriceChangeClass(coin.priceChange7d)}">7d: ${formatPercentage(coin.priceChange7d)}</span>
                    </div>
                </div>
            </div>

            <p>${coin.description || 'Nenhuma descrição fornecida para esta moeda.'}</p>

            <div class="chart-container">
                <canvas id="priceChart"></canvas>
            </div>

            <div class="coin-detail-stats">
                <div class="stat-card">
                    <div class="stat-label">Volume (24h)</div>
                    <div class="stat-value">${volumeFormatted}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">Liquidez (Pool)</div>
                    <div class="stat-value">${liquidityFormatted}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">Holders</div>
                    <div class="stat-value">${coin.holders.toLocaleString()}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">Blockchain</div>
                    <div class="stat-value">${networkInfo.name}</div>
                </div>
            </div>

            <div class="coin-detail-info">
                <h4>Informações</h4>
                <table>
                    <tr>
                        <td>Contrato:</td>
                        <td><code>${coin.contract}</code></td>
                    </tr>
                    <tr>
                        <td>Website:</td>
                        <td>${coin.website ? `<a href="${ensureHttp(coin.website)}" target="_blank" rel="noopener noreferrer">${coin.website}</a>` : 'N/A'}</td>
                    </tr>
                    <tr>
                        <td>Adicionada em:</td>
                        <td>${dateAdded}</td>
                    </tr>
                    <tr>
                        <td>Última atualização:</td>
                        <td>${lastUpdated}</td>
                    </tr>
                </table>
            </div>

            ${renderSocialLinks(coin)}

            <div class="coin-detail-actions">
                <button class="btn-submit" onclick="refreshSingleCoin(${coin.id})">
                    <i class="fas fa-sync-alt"></i> Atualizar Dados
                </button>
                <a href="${getGeckoTerminalLink(coin)}"
                   target="_blank"
                   class="btn-submit"
                   style="background-color: var(--secondary-color);">
                    <i class="fas fa-external-link-alt"></i> Ver no GeckoTerminal
                </a>
            </div>
        `;

        createPriceChart(coin, historicalData);
    }

    function renderTable(tbody, coins, rowTemplate) {
        tbody.innerHTML = '';

        if (coins.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="no-results">
                        Nenhuma moeda encontrada com os critérios atuais.
                    </td>
                </tr>
            `;
            return;
        }

        coins.forEach((coin, index) => {
            const tr = document.createElement('tr');
            tr.dataset.id = coin.id;
            tr.innerHTML = rowTemplate(coin, index);
            tbody.appendChild(tr);
        });
    }

    function renderSocialLinks(coin) {
        const socialLinks = [];

        if (coin.socials?.twitter && isValidUrl(coin.socials.twitter)) {
            socialLinks.push(`
                <a href="${ensureHttp(coin.socials.twitter)}" target="_blank" class="social-link" rel="noopener noreferrer">
                    <i class="fab fa-twitter"></i> Twitter
                </a>
            `);
        }
        if (coin.socials?.telegram && isValidUrl(coin.socials.telegram)) {
            socialLinks.push(`
                <a href="${ensureHttp(coin.socials.telegram)}" target="_blank" class="social-link" rel="noopener noreferrer">
                    <i class="fab fa-telegram-plane"></i> Telegram
                </a>
            `);
        }
        if (coin.socials?.discord && isValidUrl(coin.socials.discord)) { // Discord URLs podem não ser sempre HTTP, mas é bom validar se forem
            socialLinks.push(`
                <a href="${ensureHttp(coin.socials.discord)}" target="_blank" class="social-link" rel="noopener noreferrer">
                    <i class="fab fa-discord"></i> Discord
                </a>
            `);
        }
        if (coin.socials?.reddit && isValidUrl(coin.socials.reddit)) {
            socialLinks.push(`
                <a href="${ensureHttp(coin.socials.reddit)}" target="_blank" class="social-link" rel="noopener noreferrer">
                    <i class="fab fa-reddit"></i> Reddit
                </a>
            `);
        }
        if (coin.socials?.facebook && isValidUrl(coin.socials.facebook)) {
            socialLinks.push(`
                <a href="${ensureHttp(coin.socials.facebook)}" target="_blank" class="social-link" rel="noopener noreferrer">
                    <i class="fab fa-facebook"></i> Facebook
                </a>
            `);
        }
        if (coin.socials?.bitcointalk && isValidUrl(coin.socials.bitcointalk)) {
            socialLinks.push(`
                <a href="${ensureHttp(coin.socials.bitcointalk)}" target="_blank" class="social-link" rel="noopener noreferrer">
                    <i class="fab fa-bitcoin"></i> Bitcointalk
                </a>
            `);
        }
        if (coin.socials?.github && isValidUrl(coin.socials.github)) {
            socialLinks.push(`
                <a href="${ensureHttp(coin.socials.github)}" target="_blank" class="social-link" rel="noopener noreferrer">
                    <i class="fab fa-github"></i> GitHub
                </a>
            `);
        }
        if (coin.socials?.medium && isValidUrl(coin.socials.medium)) {
            socialLinks.push(`
                <a href="${ensureHttp(coin.socials.medium)}" target="_blank" class="social-link" rel="noopener noreferrer">
                    <i class="fab fa-medium"></i> Medium
                </a>
            `);
        }
         if (coin.socials?.youtube && isValidUrl(coin.socials.youtube)) {
            socialLinks.push(`
                <a href="${ensureHttp(coin.socials.youtube)}" target="_blank" class="social-link" rel="noopener noreferrer">
                    <i class="fab fa-youtube"></i> YouTube
                </a>
            `);
        }

        if (socialLinks.length === 0) {
            return '';
        }

        return `
            <div class="social-links-container">
                <h4>Redes Sociais</h4>
                <div class="social-links-list">
                    ${socialLinks.join('')}
                </div>
            </div>
        `;
    }

    function createPriceChart(coin, historicalData) {
        const ctx = document.getElementById('priceChart')?.getContext('2d');
        if (!ctx) {
            console.warn('Canvas para o gráfico não encontrado.');
            return;
        }

        const chartData = historicalData && historicalData.length > 0 ? historicalData : generateSimulatedData(coin);

        if (STATE.priceChart) {
            STATE.priceChart.destroy();
        }

        STATE.priceChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: chartData.map(item => item.date.toLocaleDateString()),
                datasets: [{
                    label: `Preço ${coin.symbol} (USD)`,
                    data: chartData.map(item => item.price),
                    borderColor: 'rgba(39, 121, 255, 1)',
                    backgroundColor: 'rgba(39, 121, 255, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        labels: {
                            color: 'var(--text-color)'
                        }
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        callbacks: {
                            label: function(context) {
                                return ` ${context.dataset.label}: ${formatCurrency(context.raw)}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: {
                            color: 'var(--text-color-secondary)'
                        }
                    },
                    y: {
                        beginAtZero: false,
                        ticks: {
                            callback: function(value) {
                                return formatCurrency(value);
                            },
                            color: 'var(--text-color-secondary)'
                        },
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        }
                    }
                }
            }
        });
    }

    function generateSimulatedData(coin) {
        const data = [];
        let currentPrice = coin.price > 0 ? coin.price : 0.01;

        for (let i = 6; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);

            const change = (Math.random() * 0.1 - 0.05) * (1 + Math.abs(coin.priceChange24h / 100));
            currentPrice = currentPrice * (1 + change);
            if (currentPrice <= 0) currentPrice = 0.000001;

            data.push({
                date,
                price: currentPrice
            });
        }
        return data;
    }

    function getCachedCoinData(coin) {
        const cacheKey = `coin-${coin.network}-${coin.contract}`;
        const cached = localStorage.getItem(cacheKey);
        if (!cached) return null;

        const data = JSON.parse(cached);
        if (new Date() - new Date(data.lastUpdated) > CONFIG.cacheExpiration) {
            localStorage.removeItem(cacheKey);
            return null;
        }
        return data;
    }

    function cacheCoinData(coin, data) {
        const cacheKey = `coin-${coin.network}-${coin.contract}`;
        localStorage.setItem(cacheKey, JSON.stringify(data));
    }

    function getFormData() {
        return {
            name: DOM.coinName.value.trim(),
            symbol: DOM.coinSymbol.value.trim().toUpperCase(),
            contract: DOM.coinContract.value.trim(),
            network: DOM.coinNetwork.value,
            website: DOM.coinWebsite.value.trim(),
            description: DOM.coinDescription.value.trim(),
            logo: DOM.coinLogo.value.trim(),
            socials: {
                twitter: DOM.coinTwitter.value.trim(),
                telegram: DOM.coinTelegram.value.trim(),
                discord: DOM.coinDiscord.value.trim(),
                reddit: DOM.coinReddit.value.trim(),
                facebook: DOM.coinFacebook.value.trim(),
                bitcointalk: DOM.coinBitcointalk.value.trim(),
                github: DOM.coinGithub.value.trim(),
                medium: DOM.coinMedium.value.trim(),
                youtube: DOM.coinYoutube.value.trim()
            }
        };
    }

    function showTab(tabId) {
        DOM.tabContents.forEach(content => content.classList.remove('active'));
        DOM.tabLinks.forEach(link => link.classList.remove('active'));

        document.getElementById(tabId).classList.add('active');
        document.querySelector(`.tab-link[data-tab="${tabId}"]`).classList.add('active');

        if (tabId === 'trending') {
            updateTrendingTable();
        } else if (tabId === 'new-listings') {
            updateNewListingsTable();
        }
    }

    function showModalLoading(show) {
        if (show) {
            DOM.coinDetailContent.innerHTML = `
                <div style="display: flex; justify-content: center; align-items: center; height: 300px; color: var(--text-color);">
                    <i class="fas fa-spinner fa-spin" style="font-size: 2rem;"></i>
                </div>
            `;
            DOM.coinDetailModal.style.display = 'block';
        }
    }

    function showLoader(show) {
        if (DOM.globalLoader) {
            DOM.globalLoader.style.display = show ? 'flex' : 'none';
        }
    }

    function closeModal() {
        DOM.coinDetailModal.style.display = 'none';
        if (STATE.priceChart) {
            STATE.priceChart.destroy();
            STATE.priceChart = null;
        }
    }

    function showToast(message, type = 'info') {
        let toastContainer = document.getElementById('toast-container');
        if (!toastContainer) {
            toastContainer = document.createElement('div');
            toastContainer.id = 'toast-container';
            document.body.appendChild(toastContainer);
            toastContainer.style.position = 'fixed';
            toastContainer.style.bottom = '20px';
            toastContainer.style.left = '50%';
            toastContainer.style.transform = 'translateX(-50%)';
            toastContainer.style.zIndex = '1000';
            toastContainer.style.display = 'flex';
            toastContainer.style.flexDirection = 'column-reverse';
            toastContainer.style.alignItems = 'center';
        }

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <div class="toast-message">${message}</div>
            <button class="toast-close-btn" onclick="this.parentElement.remove()">
                ×
            </button>
        `;

        toastContainer.appendChild(toast);

        setTimeout(() => {
            if (toast.parentElement) {
                toast.remove();
            }
        }, 5000);
    }

    function formatCurrency(value) {
        if (typeof value !== 'number' || isNaN(value)) return 'N/A';
        let minimumFractionDigits = 2;
        let maximumFractionDigits = 2;
        if (value < 0.01 && value !== 0) {
            minimumFractionDigits = 2;
            maximumFractionDigits = Math.max(2, String(value).split('.')[1]?.length || 2);
            if (value < 0.000001) maximumFractionDigits = 8;
            if (value < 0.000000001) maximumFractionDigits = 12;
        }
        return `$${value.toLocaleString('en-US', {
            minimumFractionDigits: minimumFractionDigits,
            maximumFractionDigits: maximumFractionDigits
        })}`;
    }

    function formatPercentage(value) {
        if (typeof value !== 'number' || isNaN(value)) return 'N/A';
        const sign = value >= 0 ? '+' : '';
        return `${sign}${value.toFixed(2)}%`;
    }

    function getPriceChangeClass(value) {
        if (typeof value !== 'number' || isNaN(value)) return '';
        return value >= 0 ? 'positive' : 'negative';
    }

    function safeImageSource(url) {
        if (url && isValidUrl(url)) {
            return url;
        }
        return CONFIG.defaultLogo;
    }

    function ensureHttp(url) {
        if (url && !url.startsWith('http://') && !url.startsWith('https://')) {
            return `https://${url}`;
        }
        return url;
    }

    function getGeckoTerminalLink(coin) {
        const networkInfo = NETWORK_MAPPING[coin.network];
        if (networkInfo && coin.contract) {
            // Link para a página do token no GeckoTerminal
            return `https://www.geckoterminal.com/${networkInfo.apiPath}/tokens/${coin.contract}`;
        }
        return '#';
    }

    function filterCoins() {
        const searchTerm = DOM.globalSearch.value.toLowerCase();
        const filteredCoins = STATE.coinsData.filter(coin =>
            coin.name.toLowerCase().includes(searchTerm) ||
            coin.symbol.toLowerCase().includes(searchTerm) ||
            coin.contract.toLowerCase().includes(searchTerm)
        );

        updateTrendingTableWithFilteredData(filteredCoins);
        updateNewListingsTableWithFilteredData(filteredCoins);
    }

    function updateTrendingTableWithFilteredData(filteredData) {
        const trendingCoins = [...filteredData]
            .filter(coin => coin.volume24h > 0)
            .sort((a, b) => b.volume24h - a.volume24h)
            .slice(0, 50);
        renderTable(DOM.trendingTableBody, trendingCoins, (coin, index) => `
            <td>${index + 1}</td>
            <td>
                <div class="coin-cell" onclick="showCoinDetail(${coin.id}, event)">
                    <img src="${safeImageSource(coin.logo)}" alt="${coin.name}" class="coin-logo"
                         onerror="this.src='${CONFIG.defaultLogo}'">
                    <div>
                        <span class="coin-name">${coin.name}</span>
                        <span class="coin-symbol">${coin.symbol}</span>
                    </div>
                </div>
            </td>
            <td>${formatCurrency(coin.price)}</td>
            <td><span class="price-change ${getPriceChangeClass(coin.priceChange24h)}">${formatPercentage(coin.priceChange24h)}</span></td>
            <td>${formatCurrency(coin.volume24h)}</td>
            <td>${formatCurrency(coin.liquidity)}</td>
            <td>
                <button class="btn-action" onclick="showCoinDetail(${coin.id}, event)">
                    <i class="fas fa-eye"></i> Detalhes
                </button>
            </td>
        `);
    }

    function updateNewListingsTableWithFilteredData(filteredData) {
        const newCoins = [...filteredData]
            .sort((a, b) => new Date(b.dateAdded) - new Date(a.dateAdded))
            .slice(0, 20);
        renderTable(DOM.newListingsTableBody, newCoins, (coin, index) => `
            <td>${index + 1}</td>
            <td>
                <div class="coin-cell" onclick="showCoinDetail(${coin.id}, event)">
                    <img src="${safeImageSource(coin.logo)}" alt="${coin.name}" class="coin-logo"
                         onerror="this.src='${CONFIG.defaultLogo}'">
                    <div>
                        <span class="coin-name">${coin.name}</span>
                        <span class="coin-symbol">${coin.symbol}</span>
                    </div>
                </div>
            </td>
            <td>${formatCurrency(coin.price)}</td>
            <td><span class="price-change ${getPriceChangeClass(coin.priceChange24h)}">${formatPercentage(coin.priceChange24h)}</span></td>
            <td>${new Date(coin.dateAdded).toLocaleDateString()}</td>
            <td>
                <button class="btn-action" onclick="showCoinDetail(${coin.id}, event)">
                    <i class="fas fa-eye"></i> Detalhes
                </button>
            </td>
        `);
    }

    function debounce(func, delay) {
        let timeout;
        return function(...args) {
            const context = this;
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(context, args), delay);
        };
    }

    function loadSampleData() {
        STATE.coinsData = [
            {
                id: 998, name: "Wrapped BTC", symbol: "WBTC", contract: "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599", network: "eth",
                website: "https://wbtc.network", description: "Wrapped Bitcoin (WBTC) is an ERC-20 token representing Bitcoin on the Ethereum blockchain.", logo: "https://cryptologos.cc/logos/wrapped-bitcoin-wbtc-logo.png?v=025",
                socials: { twitter: "https://twitter.com/WrappedBTC", telegram: "https://t.me/wbtc", discord: "", reddit: "https://reddit.com/r/wbtc", facebook: "", bitcointalk: "", github: "https://github.com/wbtc", medium: "", youtube: "" },
                dateAdded: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
                price: 107787.65, priceChange24h: -1.26, priceChange7d: -5.0, volume24h: 50000000, liquidity: 800000000,
                holders: 15000, // Exemplo de holders
                lastUpdated: new Date().toISOString()
            },
            {
                id: 999, name: "Binance Coin", symbol: "BNB", contract: "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c", network: "bsc",
                website: "https://www.bnbchain.org/", description: "Binance Coin (BNB) is the cryptocurrency issued by the Binance exchange.", logo: "https://cryptologos.cc/logos/bnb-bnb-logo.png?v=025",
                socials: { twitter: "https://twitter.com/binance", telegram: "https://t.me/BinanceExchange", discord: "https://discord.gg/binance", reddit: "https://reddit.com/r/binance", facebook: "https://facebook.com/binanceexchange", bitcointalk: "", github: "https://github.com/binance-chain", medium: "https://medium.com/binance", youtube: "https://www.youtube.com/binance" },
                dateAdded: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
                price: 600.50, priceChange24h: 2.8, priceChange7d: 7.5, volume24h: 150000000, liquidity: 1200000000,
                holders: 2500000, // Exemplo de holders
                lastUpdated: new Date().toISOString()
            },
            {
                id: 1000, name: "Solana", symbol: "SOL", contract: "So11111111111111111111111111111111111111112", network: "solana",
                website: "https://solana.com", description: "Solana is a decentralized computing platform that uses SOL to pay for transactions.", logo: "https://cryptologos.cc/logos/solana-sol-logo.png?v=025",
                socials: { twitter: "https://twitter.com/solana", telegram: "https://t.me/solana", discord: "https://discord.com/invite/solana", reddit: "https://reddit.com/r/solana", facebook: "", bitcointalk: "", github: "https://github.com/solana-labs", medium: "https://medium.com/solana-labs", youtube: "https://www.youtube.com/solana" },
                dateAdded: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
                price: 150.75, priceChange24h: 1.5, priceChange7d: 8.9, volume24h: 80000000, liquidity: 2000000000,
                holders: 1800000, // Exemplo de holders
                lastUpdated: new Date().toISOString()
            }
        ];
        updateTrendingTable();
        updateNewListingsTable();
        showToast('Dados de exemplo carregados, pois o arquivo coins.json não foi encontrado ou é inválido.', 'warning');
    }

}); // Fim do DOMContentLoaded
