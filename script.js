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
        currentTab: 'add-coin' // <--- AJUSTE AQUI: Abre na aba de adicionar moeda por padrão
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
            showTab(STATE.currentTab); // Exibe a aba inicial definida
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
            isProcessingQueue = false; // Reset para garantir que não fique travado
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
                setTimeout(processQueue, 10); // Processa o próximo item quase que imediatamente
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

            await Promise.allSettled(pendingRequests); // Espera todas as promessas, mesmo que algumas falhem

            // Reordena e atualiza as tabelas após todas as atualizações
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
                <button class="btn-delete" onclick="deleteCoin(${coin.id})">
                    <i class="fas fa-trash-alt"></i> Excluir Moeda
                </button>
            </div>
        `;

        if (historicalData) {
            renderPriceChart(historicalData);
        } else {
            document.getElementById('priceChart').style.display = 'none';
            DOM.coinDetailContent.querySelector('.chart-container').innerHTML = '<p class="text-center">Dados históricos não disponíveis.</p>';
        }
    }

    function renderSocialLinks(coin) {
        const socials = coin.socials || {};
        const links = [
            { key: 'twitter', icon: 'fab fa-twitter', label: 'Twitter' },
            { key: 'telegram', icon: 'fab fa-telegram-plane', label: 'Telegram' },
            { key: 'discord', icon: 'fab fa-discord', label: 'Discord' },
            { key: 'reddit', icon: 'fab fa-reddit-alien', label: 'Reddit' },
            { key: 'facebook', icon: 'fab fa-facebook-f', label: 'Facebook' },
            { key: 'bitcointalk', icon: 'fab fa-bitcoin', label: 'Bitcointalk' },
            { key: 'github', icon: 'fab fa-github', label: 'GitHub' },
            { key: 'medium', icon: 'fab fa-medium', label: 'Medium' },
            { key: 'youtube', icon: 'fab fa-youtube', label: 'YouTube' }
        ];

        let socialHtml = `<h4>Redes Sociais</h4><div class="social-links">`;
        let hasSocials = false;

        links.forEach(link => {
            if (socials[link.key]) {
                socialHtml += `
                    <a href="${ensureHttp(socials[link.key])}" target="_blank" rel="noopener noreferrer" class="social-link">
                        <i class="${link.icon}"></i> ${link.label}
                    </a>
                `;
                hasSocials = true;
            }
        });

        socialHtml += `</div>`;
        return hasSocials ? socialHtml : '<p>Nenhuma rede social disponível.</p>';
    }

    function renderPriceChart(data) {
        const ctx = document.getElementById('priceChart').getContext('2d');

        if (STATE.priceChart) {
            STATE.priceChart.destroy();
        }

        const labels = data.map(item => item.date.toLocaleDateString('pt-BR')).reverse();
        const prices = data.map(item => item.price).reverse();

        STATE.priceChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Preço (USD)',
                    data: prices,
                    borderColor: '#007bff',
                    backgroundColor: 'rgba(0, 123, 255, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 3,
                    pointBackgroundColor: '#007bff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        grid: {
                            display: false
                        },
                        ticks: {
                            autoSkip: true,
                            maxRotation: 0,
                            minRotation: 0
                        }
                    },
                    y: {
                        beginAtZero: false,
                        grid: {
                            color: 'rgba(200, 200, 200, 0.2)'
                        },
                        ticks: {
                            callback: function(value) {
                                return formatCurrency(value);
                            }
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return `Preço: ${formatCurrency(context.raw)}`;
                            }
                        }
                    }
                }
            }
        });
        document.getElementById('priceChart').style.display = 'block';
    }


    window.deleteCoin = function(coinId) {
        if (!confirm('Tem certeza que deseja excluir esta moeda? Esta ação é irreversível.')) {
            return;
        }

        const initialLength = STATE.coinsData.length;
        STATE.coinsData = STATE.coinsData.filter(coin => coin.id !== coinId);

        if (STATE.coinsData.length < initialLength) {
            showToast('Moeda excluída com sucesso!', 'success');
            updateTrendingTable();
            updateNewListingsTable();
            closeModal();
            // Opcional: Persistir os dados atualizados em coins.json se você tiver um backend
            // saveCoinsToJSON(STATE.coinsData);
        } else {
            showToast('Erro ao excluir moeda.', 'error');
        }
    };


    function showTab(tabId) {
        DOM.tabContents.forEach(content => {
            content.classList.remove('active');
        });
        DOM.tabLinks.forEach(link => {
            link.classList.remove('active');
        });

        document.getElementById(tabId).classList.add('active');
        document.querySelector(`.tab-link[data-tab="${tabId}"]`).classList.add('active');

        // Atualizar as tabelas quando a aba for mostrada
        if (tabId === 'trending') {
            updateTrendingTable();
        } else if (tabId === 'new-listings') {
            updateNewListingsTable();
        }
    }

    function closeModal() {
        DOM.coinDetailModal.style.display = 'none';
        if (STATE.priceChart) {
            STATE.priceChart.destroy();
            STATE.priceChart = null;
        }
    }

    function showLoader(show) {
        DOM.globalLoader.style.display = show ? 'flex' : 'none';
    }

    function showModalLoading(show) {
        const modalLoader = DOM.coinDetailModal.querySelector('.modal-loader');
        if (modalLoader) {
            modalLoader.style.display = show ? 'flex' : 'none';
            DOM.coinDetailContent.style.display = show ? 'none' : 'block';
        }
    }

    // --- UTILS ---
    function formatCurrency(value) {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 2,
            maximumFractionDigits: 8
        }).format(value);
    }

    function formatPercentage(value) {
        return `${value.toFixed(2)}%`;
    }

    function getPriceChangeClass(value) {
        if (value > 0) return 'positive';
        if (value < 0) return 'negative';
        return '';
    }

    function safeImageSource(url) {
        // Verifica se a URL é válida e não está vazia. Caso contrário, retorna o logo padrão.
        if (url && isValidUrl(url)) {
            return url;
        }
        return CONFIG.defaultLogo;
    }

    function ensureHttp(url) {
        if (!/^https?:\/\//i.test(url)) {
            return `https://${url}`;
        }
        return url;
    }

    function renderTable(tableBodyElement, data, rowTemplate) {
        tableBodyElement.innerHTML = '';
        if (data.length === 0) {
            tableBodyElement.innerHTML = '<tr><td colspan="7" class="text-center">Nenhum dado disponível.</td></tr>';
            return;
        }
        data.forEach((coin, index) => {
            const row = tableBodyElement.insertRow();
            row.innerHTML = rowTemplate(coin, index);
        });
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

    // Função de debounce para otimizar a busca
    function debounce(func, delay) {
        let timeout;
        return function(...args) {
            const context = this;
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(context, args), delay);
        };
    }

    function filterCoins() {
        const searchTerm = DOM.globalSearch.value.toLowerCase();
        const allRows = DOM.trendingTableBody.querySelectorAll('tr'); // Supondo que a busca se aplica à aba trending
        allRows.forEach(row => {
            const coinName = row.querySelector('.coin-name')?.textContent.toLowerCase() || '';
            const coinSymbol = row.querySelector('.coin-symbol')?.textContent.toLowerCase() || '';
            if (coinName.includes(searchTerm) || coinSymbol.includes(searchTerm)) {
                row.style.display = '';
            } else {
                row.style.display = 'none';
            }
        });
    }

    function showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.classList.add('toast', type);
        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('show');
        }, 100);

        setTimeout(() => {
            toast.classList.remove('show');
            toast.addEventListener('transitionend', () => toast.remove());
        }, 3000);
    }

    // Cache simples em memória
    const coinCache = {};

    function getCachedCoinData(coin) {
        const key = `${coin.network}-${coin.contract}`;
        const cached = coinCache[key];
        if (cached && (Date.now() - cached.timestamp < CONFIG.cacheExpiration)) {
            return cached.data;
        }
        return null;
    }

    function cacheCoinData(coin, data) {
        const key = `${coin.network}-${coin.contract}`;
        coinCache[key] = {
            data: data,
            timestamp: Date.now()
        };
    }

    // Função para carregar dados de exemplo (se o JSON falhar)
    function loadSampleData() {
        STATE.coinsData = [
            {
                id: 1,
                name: "Bitcoin",
                symbol: "BTC",
                contract: "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599", // Exemplo, não um contrato BTC real
                network: "eth", // Exemplo
                dateAdded: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
                price: 70000,
                priceChange24h: 2.5,
                priceChange7d: 10.1,
                volume24h: 5000000000,
                liquidity: 10000000000,
                holders: 5000000,
                lastUpdated: new Date().toISOString(),
                website: "https://bitcoin.org/",
                description: "Bitcoin é uma criptomoeda descentralizada.",
                logo: "https://assets.coingecko.com/coins/images/1/large/bitcoin.png?1547033579",
                socials: { twitter: "https://twitter.com/bitcoin", telegram: "" }
            },
            {
                id: 2,
                name: "Ethereum",
                symbol: "ETH",
                contract: "0x7a250d5630b4cf539739df2c5dacb4c659f2488d", // Exemplo, contrato de um pool ETH
                network: "eth",
                dateAdded: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
                price: 3500,
                priceChange24h: -1.2,
                priceChange7d: 5.5,
                volume24h: 2000000000,
                liquidity: 4000000000,
                holders: 10000000,
                lastUpdated: new Date().toISOString(),
                website: "https://ethereum.org/",
                description: "Ethereum é uma plataforma global de código aberto para aplicações descentralizadas.",
                logo: "https://assets.coingecko.com/coins/images/279/large/ethereum.png?1696501628",
                socials: { twitter: "https://twitter.com/ethereum", telegram: "" }
            }
        ];
        updateTrendingTable();
        updateNewListingsTable();
        showToast('Dados de exemplo carregados devido a erro no arquivo JSON.', 'warning');
    }

}); // Fim do DOMContentLoaded
