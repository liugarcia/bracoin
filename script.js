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

                <button class="btn-submit" onclick="
