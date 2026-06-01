document.addEventListener('DOMContentLoaded', async () => {
    const ASSET_VERSION = document.documentElement.dataset.assetVersion || '20260602n';
    const MAX_MESSAGE_WORDS = 100;
    const wakuEnv = window.__WAKU_ENV__ || {};
    const useConvexFrontend = Boolean(wakuEnv.convexEnabled && wakuEnv.convexUrl);
    let convexUnsubscribe = null;
    let lastSyncedUserId = null;
    const appShell = document.querySelector('.app-shell');
    const textInput = document.getElementById('text-input');
    const messageWordHint = document.getElementById('message-word-hint');
    const sendButton = document.getElementById('send-button');
    const stopButton = document.getElementById('stop-button');
    const sendButtonWrap = document.querySelector('.send-button-wrap');
    const characterImage = document.getElementById('character-image');
    const voiceSelect = document.getElementById('voice-select');
    const MOBILE_LAYOUT_MAX_WIDTH = 900;

    const messageList = document.getElementById('message-list');
    const conversationList = document.getElementById('conversation-list');
    const newChatButton = document.getElementById('new-chat-button');
    const deleteAllChatsButton = document.getElementById('delete-all-chats-button');
    const profilePreview = document.getElementById('profile-preview');
    const authGuest = document.getElementById('auth-guest');
    const authUser = document.getElementById('auth-user');
    const googleSignInButton = document.getElementById('google-sign-in-button');
    const authConfigWarning = document.getElementById('auth-config-warning');
    const logoutButton = document.getElementById('logout-button');
    const userDisplayName = document.getElementById('user-display-name');
    const userDisplayEmail = document.getElementById('user-display-email');
    const toggleHistoryButton = document.getElementById('toggle-history-button');
    const mobileHistoryToggle = document.getElementById('mobile-history-toggle');
    const historyBackdrop = document.getElementById('history-backdrop');
    const conversationTitle = document.getElementById('conversation-title');
    const usageMeter = document.getElementById('usage-meter');

    const assetQuery = `?v=${ASSET_VERSION}`;
    const openMouthImg = `/static/images/char-mouth-open.png${assetQuery}`;
    const closedMouthImg = `/static/images/char-mouth-closed.png${assetQuery}`;
    const builtInUserAvatar = `/static/images/user-default.png${assetQuery}`;
    let defaultUserAvatar = builtInUserAvatar;

    characterImage.src = closedMouthImg;
    const preloadOpen = new Image();
    preloadOpen.src = openMouthImg;
    const preloadClosed = new Image();
    preloadClosed.src = closedMouthImg;

    let voices = [];
    let lipSyncInterval;
    let activeTtsAudio = null;
    let activeSpeechId = 0;
    let speechResumeTimer = null;
    let activeChatAbortController = null;
    let chatRequestInFlight = false;
    let speechInProgress = false;
    let lastVoiceSignature = '';
    const femaleNameHints = [
        'female', 'woman', 'girl', 'zira', 'hazel', 'aria', 'jenny', 'sara', 'samantha', 'alloy', 'nova',
        'kyoko', 'nanami', 'haruka', 'sayaka', 'mizuki'
    ];
    const animeVoiceHints = ['anime', 'kawaii', 'cute'];

    const conversations = [];
    let activeConversationId = null;
    let activeMenuConversationId = null;
    const sidebarStorageKey = 'wakuwaku.sidebarCollapsed';
    const chatHistoryStorageKey = 'wakuwaku.chatHistory';
    let authState = {
        authenticated: false,
        oauthConfigured: false,
        user: null
    };
    const DAILY_MESSAGE_LIMIT = 10;
    let usageState = {
        limit: DAILY_MESSAGE_LIMIT,
        used: 0,
        remaining: DAILY_MESSAGE_LIMIT,
        allowed: true,
        canSend: true,
        rate: null
    };
    let chatHistoryHydrated = false;

    function formatConversationMeta(createdAt) {
        const date = new Date(createdAt);
        if (Number.isNaN(date.getTime())) {
            return '';
        }
        return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }

    function syncHistoryBackdrop() {
        if (!historyBackdrop || !appShell) {
            return;
        }
        const isMobile = window.innerWidth <= MOBILE_LAYOUT_MAX_WIDTH;
        const isOpen = isMobile && !appShell.classList.contains('sidebar-collapsed');
        historyBackdrop.hidden = !isOpen;
        historyBackdrop.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
        if ('inert' in historyBackdrop) {
            historyBackdrop.inert = !isOpen;
        }
    }

    function getTrialLimitMessage() {
        const limit = usageState.limit || DAILY_MESSAGE_LIMIT;
        return (
            `Meow... you've used all ${limit} trial messages for today! `
            + 'Your chat limit resets tomorrow — please come back then and try again. '
            + 'See you soon!'
        );
    }

    function getWordLimitMessage() {
        return (
            `Meow! That message is too long — please keep it to ${MAX_MESSAGE_WORDS} words or fewer. `
            + 'Try sending a shorter message.'
        );
    }

    function countWords(text) {
        const trimmed = (text || '').trim();
        if (!trimmed) {
            return 0;
        }
        return trimmed.split(/\s+/).length;
    }

    function truncateToWordLimit(text, maxWords = MAX_MESSAGE_WORDS) {
        const trimmed = (text || '').trim();
        if (!trimmed) {
            return '';
        }
        const words = trimmed.split(/\s+/);
        if (words.length <= maxWords) {
            return text;
        }
        return `${words.slice(0, maxWords).join(' ')} `;
    }

    function enforceMessageWordLimit() {
        const words = countWords(textInput.value);
        if (words > MAX_MESSAGE_WORDS) {
            const cursor = textInput.selectionStart;
            textInput.value = truncateToWordLimit(textInput.value);
            const nextCursor = Math.min(cursor, textInput.value.length);
            textInput.setSelectionRange(nextCursor, nextCursor);
        }
        updateMessageWordHint();
        resizeTextInput();
    }

    function updateMessageWordHint() {
        if (!messageWordHint) {
            return;
        }
        const words = countWords(textInput.value);
        const over = words > MAX_MESSAGE_WORDS;
        messageWordHint.classList.toggle('is-over-limit', over);
        messageWordHint.textContent = over
            ? `${words} / ${MAX_MESSAGE_WORDS} words — too long`
            : `${words} / ${MAX_MESSAGE_WORDS} words`;
    }

    function resizeTextInput() {
        textInput.style.height = 'auto';
        textInput.style.height = `${textInput.scrollHeight}px`;
    }

    function messageWithinWordLimit(text) {
        return countWords(text) <= MAX_MESSAGE_WORDS;
    }

    function applyUsageState(next) {
        if (!next) {
            return;
        }
        usageState = {
            limit: Number(next.limit) || DAILY_MESSAGE_LIMIT,
            used: Math.max(0, Number(next.used) || 0),
            remaining: Math.max(0, Number(next.remaining) || 0),
            allowed: Boolean(next.allowed),
            rate: next.rate && typeof next.rate === 'object' ? next.rate : null,
            canSend: next.canSend !== undefined
                ? Boolean(next.canSend)
                : Boolean(next.allowed)
        };
        updateUsageLimitUi();
    }

    function convexIsReady() {
        return useConvexFrontend && window.WakuConvex?.isReady?.();
    }

    function applyConvexSnapshot(snap) {
        if (!snap) {
            return;
        }
        authState = {
            authenticated: Boolean(snap.authenticated),
            oauthConfigured: Boolean(snap.convexConfigured),
            user: snap.user || null
        };
        if (snap.usage) {
            applyUsageState(snap.usage);
        }
        renderAuthUi();
        if (snap.authenticated && snap.user) {
            if (snap.user.id !== lastSyncedUserId) {
                const syncId = snap.user.id;
                lastSyncedUserId = syncId;
                void window.WakuConvex.syncFlaskSession().catch(() => {
                    if (lastSyncedUserId === syncId) {
                        lastSyncedUserId = null;
                    }
                });
            }
        } else if (!snap.authenticated) {
            lastSyncedUserId = null;
        }
    }

    function waitForConvexReady() {
        if (!useConvexFrontend) {
            return Promise.resolve(false);
        }
        if (convexIsReady()) {
            return Promise.resolve(true);
        }
        return new Promise((resolve) => {
            const timeout = setTimeout(() => resolve(false), 15000);
            const onReady = () => {
                clearTimeout(timeout);
                resolve(convexIsReady());
            };
            window.addEventListener('waku-convex-ready', onReady, { once: true });
        });
    }

    function bindConvexSubscriber() {
        if (!convexIsReady() || convexUnsubscribe) {
            return;
        }
        convexUnsubscribe = window.WakuConvex.subscribe((snap) => {
            applyConvexSnapshot(snap);
        });
    }

    async function refreshUsageStatus() {
        if (convexIsReady()) {
            const snap = window.WakuConvex.getSnapshot();
            if (snap.usage) {
                applyUsageState(snap.usage);
            }
            return;
        }
        try {
            const response = await fetch('/usage/status');
            if (!response.ok) {
                return;
            }
            const data = await readJsonResponse(response);
            applyUsageState(data);
        } catch (_error) {
            // keep last known usage state
        }
    }

    const floatingMenu = document.createElement('div');
    floatingMenu.className = 'floating-conversation-menu';
    floatingMenu.setAttribute('role', 'menu');
    floatingMenu.setAttribute('aria-label', 'Conversation options');
    const renameMenuButton = document.createElement('button');
    renameMenuButton.type = 'button';
    renameMenuButton.dataset.action = 'rename';
    renameMenuButton.setAttribute('role', 'menuitem');
    renameMenuButton.textContent = 'Rename';
    const deleteMenuButton = document.createElement('button');
    deleteMenuButton.type = 'button';
    deleteMenuButton.dataset.action = 'delete';
    deleteMenuButton.setAttribute('role', 'menuitem');
    deleteMenuButton.textContent = 'Delete';
    floatingMenu.append(renameMenuButton, deleteMenuButton);
    document.body.appendChild(floatingMenu);

    function getUserAvatarSrc() {
        if (!authState.authenticated) {
            return null;
        }
        return defaultUserAvatar || builtInUserAvatar;
    }

    function renderAuthUi() {
        const loggedIn = Boolean(authState.authenticated);

        if (authGuest) {
            authGuest.hidden = loggedIn;
        }
        if (authUser) {
            authUser.hidden = !loggedIn;
        }

        if (googleSignInButton) {
            const disabled = !authState.oauthConfigured;
            googleSignInButton.disabled = disabled;
            googleSignInButton.setAttribute('aria-disabled', disabled ? 'true' : 'false');
        }
        if (authConfigWarning) {
            authConfigWarning.hidden = authState.oauthConfigured;
        }

        clearGoogleSignInSpotlight();

        if (loggedIn) {
            const user = authState.user;
            if (user) {
                if (userDisplayName) {
                    userDisplayName.textContent = user.name || 'Google user';
                }
                if (userDisplayEmail) {
                    userDisplayEmail.textContent = user.email || '';
                }
                if (user.picture) {
                    defaultUserAvatar = user.picture;
                } else {
                    defaultUserAvatar = builtInUserAvatar;
                }
                if (profilePreview) {
                    profilePreview.hidden = false;
                    profilePreview.src = defaultUserAvatar;
                }
            } else {
                if (userDisplayName) {
                    userDisplayName.textContent = 'Restoring...';
                }
                if (userDisplayEmail) {
                    userDisplayEmail.textContent = 'Restoring profile...';
                }
                if (profilePreview) {
                    profilePreview.hidden = false;
                    profilePreview.src = builtInUserAvatar;
                }
            }
        } else if (profilePreview) {
            profilePreview.hidden = true;
            profilePreview.removeAttribute('src');
        }

        if (appShell) {
            appShell.classList.toggle('requires-auth', !loggedIn);
        }
        updateChatAccessForAuth();
        if (loggedIn) {
            ensureChatReadyAfterLogin();
        }
        renderMessages();
    }

    async function refreshAuthState() {
        if (convexIsReady()) {
            applyConvexSnapshot(window.WakuConvex.getSnapshot());
            return;
        }
        try {
            const response = await fetch('/auth/me');
            if (!response.ok) {
                return;
            }
            const data = await readJsonResponse(response);
            authState = {
                authenticated: Boolean(data.authenticated),
                oauthConfigured: Boolean(data.oauthConfigured),
                user: data.user || null
            };
        } catch (_error) {
            // keep last known auth state
        }
        renderAuthUi();
    }

    function updateChatAccessForAuth() {
        const loggedIn = authState.authenticated;

        if (newChatButton) {
            newChatButton.disabled = !loggedIn;
            newChatButton.setAttribute('aria-disabled', loggedIn ? 'false' : 'true');
        }

        if (conversationTitle) {
            conversationTitle.contentEditable = loggedIn ? 'true' : 'false';
        }

        if (!loggedIn) {
            textInput.disabled = true;
            sendButton.disabled = true;
            sendButton.setAttribute('aria-disabled', 'true');
            textInput.placeholder = 'Sign in with Google in the sidebar to start chatting.';
            if (usageMeter) {
                usageMeter.textContent = 'Sign in to chat and use your daily trial messages.';
            }
            return;
        }

        updateUsageLimitUi();
    }

    function ensureChatReadyAfterLogin() {
        if (!chatHistoryHydrated) {
            return;
        }
        if (!authState.authenticated) {
            return;
        }
        if (getActiveConversation()) {
            return;
        }
        if (conversations.length > 0) {
            activeConversationId = conversations[0].id;
            renderConversationList();
            renderMessages();
            saveChatHistory();
            return;
        }
        createConversationAndActivate();
    }

    function canSendUserMessage() {
        if (!authState.authenticated) {
            return false;
        }
        return Boolean(usageState.allowed);
    }

    function updateUsageLimitUi() {
        if (!authState.authenticated) {
            updateChatAccessForAuth();
            return;
        }

        const limit = usageState.limit || DAILY_MESSAGE_LIMIT;
        const remaining = usageState.remaining;
        const atDailyLimit = !usageState.allowed;

        if (usageMeter) {
            if (atDailyLimit) {
                usageMeter.textContent = `Trial: 0 of ${limit} messages left today`;
            } else {
                usageMeter.textContent = `Trial: ${remaining} of ${limit} messages left today`;
            }
        }

        const overWordLimit = !messageWithinWordLimit(textInput.value);
        const sendBlocked = atDailyLimit || overWordLimit;

        textInput.disabled = atDailyLimit;
        sendButton.disabled = sendBlocked;
        sendButton.setAttribute('aria-disabled', sendBlocked ? 'true' : 'false');
        updateMessageWordHint();

        if (atDailyLimit) {
            textInput.placeholder = 'Daily trial limit reached. Come back tomorrow!';
        } else {
            textInput.placeholder = `Ask me anything (up to ${MAX_MESSAGE_WORDS} words)...`;
        }
    }

    function setMessageListBusy(isBusy) {
        messageList.setAttribute('aria-busy', isBusy ? 'true' : 'false');
    }

    async function readJsonResponse(response) {
        const text = await response.text();
        if (!text) {
            return {};
        }

        try {
            return JSON.parse(text);
        } catch (_error) {
            const trimmed = text.trim().toLowerCase();
            if (trimmed.startsWith('<!doctype') || trimmed.startsWith('<html')) {
                throw new Error(
                    `Server error (${response.status}). Start the app with Flask at http://127.0.0.1:5000 — do not open the HTML file directly.`
                );
            }
            throw new Error(`Invalid server response (${response.status}).`);
        }
    }

    let sidebarCloseTimer = null;
    const sidebarCloseFadeMs = 140;

    function isDesktopSidebarLayout() {
        return window.innerWidth > MOBILE_LAYOUT_MAX_WIDTH;
    }

    function prefersReducedMotion() {
        return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }

    function updateSidebarToggleUi(collapsed) {
        toggleHistoryButton.classList.toggle('is-collapsed', collapsed);
        toggleHistoryButton.setAttribute('aria-label', collapsed ? 'Expand sidebar' : 'Collapse sidebar');
        toggleHistoryButton.setAttribute('title', collapsed ? 'Expand sidebar' : 'Collapse sidebar');
        if (mobileHistoryToggle) {
            mobileHistoryToggle.setAttribute('aria-label', collapsed ? 'Open sidebar' : 'Close sidebar');
            mobileHistoryToggle.setAttribute('title', collapsed ? 'Open sidebar' : 'Close sidebar');
        }
    }

    function setSidebarCollapsed(collapsed) {
        if (!appShell || !toggleHistoryButton) {
            return;
        }

        if (sidebarCloseTimer) {
            window.clearTimeout(sidebarCloseTimer);
            sidebarCloseTimer = null;
        }

        appShell.classList.remove('sidebar-is-closing');

        if (!collapsed) {
            appShell.classList.toggle('sidebar-collapsed', false);
            updateSidebarToggleUi(false);
            try {
                window.localStorage.setItem(sidebarStorageKey, '0');
            } catch (_error) {
                // ignore storage failures
            }
            syncHistoryBackdrop();
            return;
        }

        const alreadyCollapsed = appShell.classList.contains('sidebar-collapsed');
        const isClosing = appShell.classList.contains('sidebar-is-closing');
        if (isDesktopSidebarLayout() && !alreadyCollapsed && !isClosing) {
            updateSidebarToggleUi(true);
            appShell.classList.add('sidebar-is-closing');
            const fadeMs = prefersReducedMotion() ? 0 : sidebarCloseFadeMs;
            sidebarCloseTimer = window.setTimeout(() => {
                sidebarCloseTimer = null;
                appShell.classList.remove('sidebar-is-closing');
                appShell.classList.add('sidebar-collapsed');
                try {
                    window.localStorage.setItem(sidebarStorageKey, '1');
                } catch (_error) {
                    // ignore storage failures
                }
                syncHistoryBackdrop();
            }, fadeMs);
            syncHistoryBackdrop();
            return;
        }

        appShell.classList.toggle('sidebar-collapsed', true);
        updateSidebarToggleUi(true);
        try {
            window.localStorage.setItem(sidebarStorageKey, '1');
        } catch (_error) {
            // ignore storage failures
        }
        syncHistoryBackdrop();
    }

    function newConversation() {
        const id = `conv-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
        return {
            id,
            title: 'New Conversation',
            createdAt: Date.now(),
            manualTitle: false,
            messages: []
        };
    }

    function normalizeStoredMessage(entry) {
        if (!entry || typeof entry.text !== 'string') {
            return null;
        }
        const role = entry.role === 'user' ? 'user' : 'ai';
        return {
            role,
            text: entry.text,
            at: typeof entry.at === 'number' ? entry.at : Date.now()
        };
    }

    function normalizeStoredConversation(entry) {
        if (!entry || typeof entry.id !== 'string') {
            return null;
        }
        const messages = Array.isArray(entry.messages)
            ? entry.messages.map(normalizeStoredMessage).filter(Boolean)
            : [];
        return {
            id: entry.id,
            title: typeof entry.title === 'string' && entry.title.trim()
                ? entry.title.trim()
                : 'Conversation',
            createdAt: typeof entry.createdAt === 'number' ? entry.createdAt : Date.now(),
            manualTitle: Boolean(entry.manualTitle),
            messages
        };
    }

    function saveChatHistory() {
        if (!chatHistoryHydrated) {
            return;
        }
        try {
            const payload = {
                version: 1,
                activeConversationId,
                conversations: conversations.map((conversation) => ({
                    id: conversation.id,
                    title: conversation.title,
                    createdAt: conversation.createdAt,
                    manualTitle: conversation.manualTitle,
                    messages: conversation.messages.map((message) => ({
                        role: message.role,
                        text: message.text,
                        at: message.at
                    }))
                }))
            };
            window.localStorage.setItem(chatHistoryStorageKey, JSON.stringify(payload));
        } catch (_error) {
            // ignore storage failures (e.g. private mode or quota)
        }
    }

    function loadChatHistory() {
        try {
            const raw = window.localStorage.getItem(chatHistoryStorageKey);
            if (!raw) {
                return false;
            }

            const data = JSON.parse(raw);
            if (!data || !Array.isArray(data.conversations)) {
                return false;
            }

            const loaded = data.conversations
                .map(normalizeStoredConversation)
                .filter(Boolean);

            conversations.length = 0;
            conversations.push(...loaded);

            if (
                data.activeConversationId
                && conversations.some((conversation) => conversation.id === data.activeConversationId)
            ) {
                activeConversationId = data.activeConversationId;
            } else if (conversations.length) {
                activeConversationId = conversations[0].id;
            } else {
                activeConversationId = null;
            }

            return conversations.length > 0;
        } catch (_error) {
            return false;
        }
    }

    function getActiveConversation() {
        return conversations.find((conversation) => conversation.id === activeConversationId) || null;
    }

    function closeAllConversationMenus({ returnFocusTo } = {}) {
        conversationList.querySelectorAll('.conversation-item.menu-open').forEach((item) => {
            item.classList.remove('menu-open');
            item.querySelector('.conversation-menu-button')?.setAttribute('aria-expanded', 'false');
        });
        floatingMenu.classList.remove('open');
        delete floatingMenu.dataset.conversationId;
        activeMenuConversationId = null;
        if (returnFocusTo instanceof HTMLElement) {
            returnFocusTo.focus();
        }
    }

    function selectTitleText() {
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(conversationTitle);
        selection.removeAllRanges();
        selection.addRange(range);
    }

    function renameConversation(conversationId) {
        if (!authState.authenticated) {
            return;
        }
        const conversation = conversations.find((item) => item.id === conversationId);
        if (!conversation) {
            return;
        }
        activeConversationId = conversation.id;
        renderConversationList();
        renderMessages();
        conversationTitle.focus();
        selectTitleText();
    }

    function deleteConversation(conversationId) {
        if (!authState.authenticated) {
            return;
        }
        const conversation = conversations.find((item) => item.id === conversationId);
        if (!conversation) {
            return;
        }
        const index = conversations.findIndex((item) => item.id === conversationId);
        if (index >= 0) {
            conversations.splice(index, 1);
        }

        if (!conversations.length) {
            activeConversationId = null;
            renderConversationList();
            renderMessages();
            saveChatHistory();
            return;
        }

        if (activeConversationId === conversationId) {
            activeConversationId = conversations[0].id;
            renderMessages();
        }
        renderConversationList();
        saveChatHistory();
    }

    function openConversationMenu(row, menuButton, conversationId) {
        if (!authState.authenticated) {
            return;
        }
        const wasOpen = row.classList.contains('menu-open');
        closeAllConversationMenus();
        if (wasOpen) {
            return;
        }

        row.classList.add('menu-open');
        activeMenuConversationId = conversationId;
        floatingMenu.dataset.conversationId = conversationId;

        const rect = menuButton.getBoundingClientRect();
        const menuWidth = 120;
        const menuHeight = 76;
        let left = rect.right - menuWidth + 4;
        let top = rect.top + 50;

        if (left < 8) {
            left = 8;
        }
        if (top + menuHeight > window.innerHeight - 8) {
            top = rect.top - menuHeight - 6;
        }
        if (top < 8) {
            top = 8;
        }

        floatingMenu.style.left = `${left}px`;
        floatingMenu.style.top = `${top}px`;
        floatingMenu.classList.add('open');
        menuButton.setAttribute('aria-expanded', 'true');
        renameMenuButton.focus();
    }

    function renderConversationList() {
        const fragment = document.createDocumentFragment();
        conversations.forEach((conversation) => {
            const row = document.createElement('div');
            row.className = `conversation-item${conversation.id === activeConversationId ? ' active' : ''}`;

            const selectButton = document.createElement('button');
            selectButton.type = 'button';
            selectButton.className = 'conversation-main';
            const titleSpan = document.createElement('span');
            titleSpan.textContent = conversation.title;
            const metaSpan = document.createElement('span');
            metaSpan.className = 'conversation-meta';
            metaSpan.textContent = formatConversationMeta(conversation.createdAt);
            selectButton.append(titleSpan, metaSpan);
            selectButton.addEventListener('click', () => {
                activeConversationId = conversation.id;
                renderConversationList();
                renderMessages();
                saveChatHistory();
            });

            const menuButton = document.createElement('button');
            menuButton.type = 'button';
            menuButton.className = 'conversation-menu-button';
            menuButton.setAttribute('aria-label', `Options for ${conversation.title}`);
            menuButton.setAttribute('aria-haspopup', 'menu');
            menuButton.setAttribute('aria-expanded', 'false');
            menuButton.textContent = '⋯';
            menuButton.disabled = !authState.authenticated;
            menuButton.hidden = !authState.authenticated;

            menuButton.addEventListener('click', (event) => {
                event.stopPropagation();
                openConversationMenu(row, menuButton, conversation.id);
            });

            row.append(selectButton, menuButton);
            fragment.appendChild(row);
        });
        conversationList.replaceChildren(fragment);
    }

    function isNearBottom(element, threshold = 80) {
        return (element.scrollHeight - element.scrollTop - element.clientHeight) <= threshold;
    }

    let googleSignInSpotlightTimer = null;

    function clearGoogleSignInSpotlight() {
        if (googleSignInSpotlightTimer) {
            window.clearTimeout(googleSignInSpotlightTimer);
            googleSignInSpotlightTimer = null;
        }
        googleSignInButton?.classList.remove('is-spotlight');
        document.querySelector('.history-footer')?.classList.remove('history-footer--glow');
    }

    function highlightGoogleSignInButton() {
        if (!googleSignInButton || authState.authenticated) {
            return;
        }
        clearGoogleSignInSpotlight();
        googleSignInButton.classList.add('is-spotlight');
        document.querySelector('.history-footer')?.classList.add('history-footer--glow');

        if (googleSignInButton.getAttribute('aria-disabled') !== 'true') {
            googleSignInButton.focus({ preventScroll: true });
        }

        googleSignInSpotlightTimer = window.setTimeout(() => {
            clearGoogleSignInSpotlight();
        }, 3200);
    }

    function openSidebarForSignIn() {
        if (authState.authenticated || !appShell) {
            return;
        }

        const wasCollapsed = appShell.classList.contains('sidebar-collapsed');
        setSidebarCollapsed(false);

        let delayMs = 80;
        if (wasCollapsed) {
            if (isDesktopSidebarLayout()) {
                delayMs = prefersReducedMotion() ? 0 : 340;
            } else {
                delayMs = prefersReducedMotion() ? 0 : 200;
            }
        }

        window.setTimeout(highlightGoogleSignInButton, delayMs);
    }

    function createMessageEmptyState({ guest = false, title, body }) {
        const empty = document.createElement('div');
        empty.className = guest ? 'message-empty message-empty--guest' : 'message-empty';
        const bodyEl = document.createElement('p');
        bodyEl.className = 'message-empty-body';
        bodyEl.textContent = body;

        if (guest) {
            const titleButton = document.createElement('button');
            titleButton.type = 'button';
            titleButton.className = 'message-empty-title message-empty-cta';
            titleButton.textContent = title;
            titleButton.addEventListener('click', openSidebarForSignIn);
            empty.append(titleButton, bodyEl);
            return empty;
        }

        const titleEl = document.createElement('p');
        titleEl.className = 'message-empty-title';
        titleEl.textContent = title;
        empty.append(titleEl, bodyEl);
        return empty;
    }

    function formatMessageTime(timestamp) {
        const date = new Date(timestamp);
        if (Number.isNaN(date.getTime())) {
            return '';
        }

        const now = new Date();
        const timeLabel = date.toLocaleTimeString(undefined, {
            hour: 'numeric',
            minute: '2-digit'
        });

        if (date.toDateString() === now.toDateString()) {
            return timeLabel;
        }

        const yesterday = new Date(now);
        yesterday.setDate(now.getDate() - 1);
        if (date.toDateString() === yesterday.toDateString()) {
            return `Yesterday ${timeLabel}`;
        }

        const dateLabel = date.toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric'
        });
        const yearSuffix = date.getFullYear() !== now.getFullYear()
            ? `, ${date.getFullYear()}`
            : '';
        return `${dateLabel}${yearSuffix} ${timeLabel}`;
    }

    function renderMessages(options = {}) {
        const { forceScrollBottom = false } = options;
        const conversation = getActiveConversation();
        const previousScrollTop = messageList.scrollTop;
        const previousScrollHeight = messageList.scrollHeight;
        const shouldStickToBottom = forceScrollBottom || isNearBottom(messageList);

        const fragment = document.createDocumentFragment();
        if (!conversation) {
            fragment.appendChild(
                authState.authenticated
                    ? createMessageEmptyState({
                        title: 'No conversation yet',
                        body: 'Click New Chat in the sidebar to begin.'
                    })
                    : createMessageEmptyState({
                        guest: true,
                        title: 'Sign in to chat',
                        body: 'Use Google sign-in in the sidebar Account section to talk with WakuWaku.'
                    })
            );
            messageList.replaceChildren(fragment);
            conversationTitle.textContent = 'No Conversation';
            return;
        }

        if (!conversation.messages.length) {
            fragment.appendChild(
                authState.authenticated
                    ? createMessageEmptyState({
                        title: 'Say hello',
                        body: 'Your messages and WakuWaku\'s replies will appear here.'
                    })
                    : createMessageEmptyState({
                        guest: true,
                        title: 'Sign in to chat',
                        body: 'Use Google sign-in in the sidebar Account section to talk with WakuWaku.'
                    })
            );
            messageList.replaceChildren(fragment);
            conversationTitle.textContent = conversation.title;
            return;
        }

        conversationTitle.textContent = conversation.title;
        conversation.messages.forEach((entry) => {
            const row = document.createElement('div');
            row.className = `message ${entry.role === 'user' ? 'user' : 'ai'}`;

            const header = document.createElement('div');
            header.className = 'message-header';

            const avatar = document.createElement('span');
            avatar.className = `message-avatar ${entry.role === 'user' ? 'user' : 'ai'}`;
            if (entry.role === 'ai') {
                const avatarImage = document.createElement('img');
                avatarImage.className = 'message-avatar-image';
                avatarImage.src = closedMouthImg;
                avatarImage.alt = 'WakuWaku';
                avatar.appendChild(avatarImage);
            } else {
                const userAvatarSrc = getUserAvatarSrc();
                if (userAvatarSrc) {
                    const avatarImage = document.createElement('img');
                    avatarImage.className = 'message-avatar-image';
                    avatarImage.src = userAvatarSrc;
                    avatarImage.alt = 'You';
                    avatar.appendChild(avatarImage);
                } else {
                    avatar.classList.add('message-avatar--placeholder');
                    avatar.textContent = 'Y';
                    avatar.setAttribute('aria-label', 'You');
                }
            }

            const author = document.createElement('span');
            author.className = 'message-author';
            author.textContent = entry.role === 'user' ? 'You' : 'WakuWaku';

            const timestamp = document.createElement('time');
            timestamp.className = 'message-time';
            const sentAt = typeof entry.at === 'number' ? entry.at : Date.now();
            timestamp.dateTime = new Date(sentAt).toISOString();
            timestamp.textContent = formatMessageTime(sentAt);

            const meta = document.createElement('div');
            meta.className = 'message-meta';
            meta.appendChild(author);
            meta.appendChild(timestamp);

            const content = document.createElement('div');
            content.className = 'message-content';
            content.textContent = entry.text;

            header.appendChild(avatar);
            header.appendChild(meta);
            row.append(header, content);
            fragment.appendChild(row);
        });

        messageList.replaceChildren(fragment);

        if (shouldStickToBottom) {
            messageList.scrollTop = messageList.scrollHeight;
            return;
        }

        // Preserve viewport position when user is browsing older messages.
        const nextScrollHeight = messageList.scrollHeight;
        const heightDelta = nextScrollHeight - previousScrollHeight;
        messageList.scrollTop = Math.max(0, previousScrollTop + heightDelta);
    }

    function appendMessage(role, text) {
        if (role === 'user' && !authState.authenticated) {
            return;
        }
        const conversation = getActiveConversation();
        if (!conversation) {
            return;
        }
        conversation.messages.push({ role, text, at: Date.now() });
        if (conversation.messages.length === 1 && role === 'user' && !conversation.manualTitle) {
            conversation.title = text.slice(0, 34) || 'Conversation';
        }
        renderConversationList();
        renderMessages({ forceScrollBottom: role === 'user' });
        saveChatHistory();
    }

    function commitConversationTitle() {
        if (!authState.authenticated) {
            return;
        }
        const conversation = getActiveConversation();
        if (!conversation) {
            return;
        }
        const nextTitle = conversationTitle.textContent.trim();
        conversation.title = nextTitle || 'Conversation';
        conversation.manualTitle = true;
        conversationTitle.textContent = conversation.title;
        renderConversationList();
        saveChatHistory();
    }

    function setVoiceSelectUnavailable(message) {
        voiceSelect.innerHTML = '';
        const option = document.createElement('option');
        option.textContent = message;
        option.value = '';
        voiceSelect.appendChild(option);
        voiceSelect.disabled = true;
    }

    function buildVoiceSignature(voiceList) {
        return voiceList.map((voice) => `${voice.name}|${voice.lang}`).join('||');
    }

    function isLikelyFemaleVoice(voice) {
        const normalizedName = voice.name.toLowerCase();
        return femaleNameHints.some((hint) => normalizedName.includes(hint));
    }

    function isLikelyAnimeVoice(voice) {
        const normalizedName = voice.name.toLowerCase();
        return animeVoiceHints.some((hint) => normalizedName.includes(hint));
    }

    function isGoogleVoice(voice) {
        return voice.name.toLowerCase().includes('google');
    }

    function isJapaneseLanguageCode(languageCode) {
        return languageCode.toLowerCase().startsWith('ja');
    }

    function pickOneVoicePerLanguage(allVoices) {
        const groupedByLanguage = new Map();
        allVoices.forEach((voice) => {
            if (!groupedByLanguage.has(voice.lang)) {
                groupedByLanguage.set(voice.lang, []);
            }
            groupedByLanguage.get(voice.lang).push(voice);
        });

        const selected = [];
        groupedByLanguage.forEach((languageVoices, languageCode) => {
            const googleVoices = languageVoices.filter(isGoogleVoice);
            const prioritizedVoices = googleVoices.length ? googleVoices : languageVoices;

            if (isJapaneseLanguageCode(languageCode)) {
                const animeFemaleVoice = prioritizedVoices.find((voice) => isLikelyFemaleVoice(voice) && isLikelyAnimeVoice(voice));
                const femaleVoice = prioritizedVoices.find(isLikelyFemaleVoice);
                selected.push(animeFemaleVoice || femaleVoice || prioritizedVoices[0]);
                return;
            }

            const femaleVoice = prioritizedVoices.find(isLikelyFemaleVoice);
            selected.push(femaleVoice || prioritizedVoices[0]);
        });

        return selected.sort((a, b) => a.lang.localeCompare(b.lang));
    }

    function isPiperVoiceSelected() {
        const selected = voiceSelect.selectedOptions[0];
        return selected?.getAttribute('data-engine') === 'piper';
    }

    function getSelectedSpeechLanguage() {
        if (isPiperVoiceSelected()) {
            return 'en';
        }
        const selected = voiceSelect.selectedOptions[0];
        const lang = (selected?.getAttribute('data-lang') || '').toLowerCase();
        return lang.startsWith('ja') ? 'ja' : 'en';
    }

    async function populateVoiceList(force = false) {
        let piperAvailable = false;
        try {
            const statusResponse = await fetch('/voices/status');
            if (statusResponse.ok) {
                const statusData = await readJsonResponse(statusResponse);
                piperAvailable = Boolean(statusData.piperAvailable);
            }
        } catch (_error) {
            piperAvailable = false;
        }

        const speechSupported = 'speechSynthesis' in window;
        const allVoices = speechSupported ? speechSynthesis.getVoices() : [];
        const nextSignature = `${piperAvailable ? 'piper|' : ''}${buildVoiceSignature(allVoices)}`;
        if (!force && nextSignature === lastVoiceSignature) {
            return;
        }
        lastVoiceSignature = nextSignature;

        if (!speechSupported && !piperAvailable) {
            voices = [];
            setVoiceSelectUnavailable('Speech not supported');
            return;
        }

        voices = pickOneVoicePerLanguage(allVoices);
        voiceSelect.innerHTML = '';
        voiceSelect.disabled = false;

        if (piperAvailable) {
            const piperOption = document.createElement('option');
            piperOption.value = 'piper:en_US-hfc_female-medium';
            piperOption.textContent = 'Piper Natural Female (en-US)';
            piperOption.setAttribute('data-engine', 'piper');
            piperOption.setAttribute('data-name', 'piper:en_US-hfc_female-medium');
            voiceSelect.appendChild(piperOption);
        }

        if (!voices.length && !piperAvailable) {
            setVoiceSelectUnavailable('Loading voices...');
            return;
        }

        let usVoiceIndex = -1;
        let japaneseVoiceIndex = -1;
        const piperOffset = piperAvailable ? 1 : 0;

        voices.forEach((voice, i) => {
            const option = document.createElement('option');
            option.textContent = `${voice.name} (${voice.lang})`;
            option.setAttribute('data-lang', voice.lang);
            option.setAttribute('data-name', voice.name);
            voiceSelect.appendChild(option);

            if (voice.lang === 'en-US' && usVoiceIndex === -1) {
                usVoiceIndex = i;
            }

            if (isJapaneseLanguageCode(voice.lang) && japaneseVoiceIndex === -1) {
                japaneseVoiceIndex = i;
            }
        });

        if (piperAvailable) {
            voiceSelect.selectedIndex = 0;
        } else if (japaneseVoiceIndex !== -1) {
            voiceSelect.selectedIndex = japaneseVoiceIndex + piperOffset;
        } else if (usVoiceIndex !== -1) {
            voiceSelect.selectedIndex = usVoiceIndex + piperOffset;
        }
    }

    function startLipSync() {
        if (prefersReducedMotion()) {
            return;
        }
        clearInterval(lipSyncInterval);
        let mouthOpen = true;
        lipSyncInterval = setInterval(() => {
            characterImage.src = mouthOpen ? openMouthImg : closedMouthImg;
            mouthOpen = !mouthOpen;
        }, 150);
    }

    function stopLipSync() {
        clearInterval(lipSyncInterval);
        characterImage.src = closedMouthImg;
    }

    function isAssistantBusy() {
        return chatRequestInFlight || speechInProgress;
    }

    function updateAssistantControls() {
        const busy = isAssistantBusy();
        if (sendButtonWrap) {
            sendButtonWrap.classList.toggle('assistant-active', busy);
        }
        if (stopButton) {
            stopButton.hidden = !busy;
        }
    }

    function stopAllSpeech() {
        activeSpeechId += 1;
        speechInProgress = false;
        stopLipSync();
        if ('speechSynthesis' in window && speechSynthesis.speaking) {
            speechSynthesis.cancel();
        }
        if (activeTtsAudio) {
            activeTtsAudio.pause();
            activeTtsAudio.currentTime = 0;
            activeTtsAudio = null;
        }
        if (speechResumeTimer) {
            clearInterval(speechResumeTimer);
            speechResumeTimer = null;
        }
        updateAssistantControls();
    }

    function stopAssistant() {
        if (activeChatAbortController) {
            activeChatAbortController.abort();
            activeChatAbortController = null;
        }
        chatRequestInFlight = false;
        stopAllSpeech();
    }

    function splitTextForSpeech(text, maxChunkLength = 180) {
        const normalized = (text || '').replace(/\s+/g, ' ').trim();
        if (!normalized) {
            return [];
        }

        const sentences = normalized
            .split(/(?<=[。．！？!?…])|(?<=[.!?])\s+/)
            .map((part) => part.trim())
            .filter(Boolean);

        const chunks = [];
        let current = '';

        const pushCurrent = () => {
            if (current.trim()) {
                chunks.push(current.trim());
            }
            current = '';
        };

        const sourceParts = sentences.length ? sentences : [normalized];
        sourceParts.forEach((part) => {
            if (part.length > maxChunkLength) {
                pushCurrent();
                for (let index = 0; index < part.length; index += maxChunkLength) {
                    chunks.push(part.slice(index, index + maxChunkLength));
                }
                return;
            }

            const candidate = current ? `${current} ${part}` : part;
            if (candidate.length <= maxChunkLength) {
                current = candidate;
                return;
            }

            pushCurrent();
            current = part;
        });

        pushCurrent();
        return chunks.length ? chunks : [normalized];
    }

    function getSelectedBrowserVoice() {
        const selectedOption = voiceSelect.selectedOptions[0];
        const selectedVoiceName = selectedOption ? selectedOption.getAttribute('data-name') : null;
        return voices.find((voice) => voice.name === selectedVoiceName) || voices[0] || null;
    }

    function startSpeechResumeWatch(speechId) {
        if (speechResumeTimer) {
            clearInterval(speechResumeTimer);
        }
        speechResumeTimer = setInterval(() => {
            if (speechId !== activeSpeechId) {
                clearInterval(speechResumeTimer);
                speechResumeTimer = null;
                return;
            }
            if (!('speechSynthesis' in window)) {
                return;
            }
            if (speechSynthesis.speaking && speechSynthesis.paused) {
                speechSynthesis.resume();
            }
        }, 8000);
    }

    function speakWithBrowserVoice(text, speechId) {
        if (!('speechSynthesis' in window)) {
            return Promise.resolve();
        }

        const chunks = splitTextForSpeech(text);
        if (!chunks.length) {
            return Promise.resolve();
        }

        const selectedVoice = getSelectedBrowserVoice();
        let chunkIndex = 0;

        return new Promise((resolve) => {
            const finish = () => {
                if (speechResumeTimer) {
                    clearInterval(speechResumeTimer);
                    speechResumeTimer = null;
                }
                resolve();
            };

            const speakNextChunk = () => {
            if (speechId !== activeSpeechId || chunkIndex >= chunks.length) {
                if (speechId === activeSpeechId) {
                    stopLipSync();
                }
                finish();
                return;
            }

            const utterance = new SpeechSynthesisUtterance(chunks[chunkIndex]);
            if (selectedVoice) {
                utterance.voice = selectedVoice;
            }

            utterance.onstart = () => {
                if (speechId === activeSpeechId) {
                    startLipSync();
                }
            };
            utterance.onend = () => {
                if (speechId !== activeSpeechId) {
                    return;
                }
                chunkIndex += 1;
                speakNextChunk();
            };
            utterance.onerror = () => {
                if (speechId !== activeSpeechId) {
                    return;
                }
                chunkIndex += 1;
                speakNextChunk();
            };

            speechSynthesis.speak(utterance);
        };

        if (speechSynthesis.speaking) {
            speechSynthesis.cancel();
        }

        startSpeechResumeWatch(speechId);
        speakNextChunk();
        });
    }

    function playAudioBlob(audioBlob, speechId) {
        return new Promise((resolve) => {
            const audioUrl = URL.createObjectURL(audioBlob);
            const audio = new Audio(audioUrl);
            activeTtsAudio = audio;

            const cleanup = () => {
                URL.revokeObjectURL(audioUrl);
                if (activeTtsAudio === audio) {
                    activeTtsAudio = null;
                }
            };

            audio.addEventListener('play', () => {
                if (speechId === activeSpeechId) {
                    startLipSync();
                }
            });
            audio.addEventListener('ended', () => {
                cleanup();
                resolve(true);
            });
            audio.addEventListener('error', () => {
                cleanup();
                resolve(false);
            });

            audio.play().catch(() => {
                cleanup();
                resolve(false);
            });
        });
    }

    async function speakWithPiperVoice(text, speechId) {
        const chunks = splitTextForSpeech(text, 240);
        for (const chunk of chunks) {
            if (speechId !== activeSpeechId) {
                return false;
            }

            const ttsResponse = await fetch('/tts', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ text: chunk })
            });
            if (!ttsResponse.ok) {
                return false;
            }

            const played = await playAudioBlob(await ttsResponse.blob(), speechId);
            if (!played || speechId !== activeSpeechId) {
                return false;
            }
        }
        return true;
    }

    async function speak(text) {
        const normalized = (text || '').trim();
        if (!normalized) {
            return;
        }

        stopAllSpeech();
        const speechId = activeSpeechId;
        speechInProgress = true;
        updateAssistantControls();

        try {
            if (!isPiperVoiceSelected()) {
                await speakWithBrowserVoice(normalized, speechId);
                return;
            }

            try {
                const spokeAll = await speakWithPiperVoice(normalized, speechId);
                if (!spokeAll && speechId === activeSpeechId) {
                    await speakWithBrowserVoice(normalized, speechId);
                }
            } catch (_error) {
                if (speechId === activeSpeechId) {
                    await speakWithBrowserVoice(normalized, speechId);
                }
            }
        } finally {
            if (speechId === activeSpeechId) {
                speechInProgress = false;
                stopLipSync();
                updateAssistantControls();
            }
        }
    }

    async function handleSendMessage() {
        const message = textInput.value.trim();
        const conversation = getActiveConversation();
        if (!message || !conversation || isAssistantBusy()) {
            return;
        }

        if (!messageWithinWordLimit(message)) {
            updateMessageWordHint();
            updateUsageLimitUi();
            return;
        }

        if (!canSendUserMessage()) {
            updateUsageLimitUi();
            return;
        }

        textInput.value = '';
        resizeTextInput();
        updateMessageWordHint();
        appendMessage('user', message);

        const abortController = new AbortController();
        activeChatAbortController = abortController;
        chatRequestInFlight = true;
        setMessageListBusy(true);
        updateAssistantControls();

        try {
            const chatHeaders = {
                'Content-Type': 'application/json'
            };
            if (convexIsReady() && authState.authenticated) {
                const convexToken = window.WakuConvex.getAuthToken?.();
                if (convexToken) {
                    chatHeaders.Authorization = `Bearer ${convexToken}`;
                }
            }

            const response = await fetch('/chat', {
                method: 'POST',
                headers: chatHeaders,
                body: JSON.stringify({
                    message,
                    session_id: conversation.id,
                    language: getSelectedSpeechLanguage()
                }),
                signal: abortController.signal
            });

            const data = await readJsonResponse(response);

            if (data.usage) {
                applyUsageState(data.usage);
            }

            if (response.status === 401 || data.authRequired) {
                const authMessage = (data.response || '').trim()
                    || 'Meow! Please sign in with Google from the sidebar profile section before we can chat.';
                appendMessage('ai', authMessage);
                saveChatHistory();
                await refreshAuthState();
                return;
            }

            if (response.status === 429 || data.limitReached) {
                const limitMessage = (data.response || '').trim() || getTrialLimitMessage();
                appendMessage('ai', limitMessage);
                saveChatHistory();
                await speak(limitMessage);
                return;
            }

            if (response.status === 400 && data.messageTooLong) {
                const longMessage = (data.response || '').trim() || getWordLimitMessage();
                appendMessage('ai', longMessage);
                saveChatHistory();
                return;
            }

            if (!response.ok) {
                throw new Error(data.error || `Request failed (${response.status})`);
            }

            const responseText = (data.response || '').trim() || '(No response returned)';
            appendMessage('ai', responseText);
            activeChatAbortController = null;
            await speak(responseText);
        } catch (error) {
            if (error.name === 'AbortError') {
                return;
            }
            console.error('Error:', error);
            const errorMessage = error.message && error.message !== 'Network response was not ok'
                ? error.message
                : 'Sorry, something went wrong. Please try again.';
            appendMessage('ai', errorMessage);
        } finally {
            chatRequestInFlight = false;
            setMessageListBusy(false);
            if (activeChatAbortController === abortController) {
                activeChatAbortController = null;
            }
            updateAssistantControls();
        }
    }

    function createConversationAndActivate() {
        if (!chatHistoryHydrated) {
            return;
        }
        if (!authState.authenticated) {
            updateChatAccessForAuth();
            return;
        }
        const conversation = newConversation();
        conversations.unshift(conversation);
        activeConversationId = conversation.id;
        renderConversationList();
        renderMessages({ forceScrollBottom: true });
        saveChatHistory();
    }

    sendButton.addEventListener('click', handleSendMessage);
    if (stopButton) {
        stopButton.addEventListener('click', stopAssistant);
    }
    newChatButton.addEventListener('click', createConversationAndActivate);
    deleteAllChatsButton.addEventListener('click', () => {
        if (!authState.authenticated) {
            return;
        }
        conversations.length = 0;
        activeConversationId = null;
        closeAllConversationMenus();
        renderConversationList();
        renderMessages();
        saveChatHistory();
    });
    if (logoutButton) {
        logoutButton.addEventListener('click', async () => {
            if (convexIsReady()) {
                try {
                    await window.WakuConvex.signOut();
                } catch (_error) {
                    // ignore
                }
            } else {
                try {
                    await fetch('/auth/logout', { method: 'POST' });
                } catch (_error) {
                    // ignore network failures
                }
            }
            lastConvexAuthenticated = false;
            await refreshAuthState();
        });
    }
    toggleHistoryButton.addEventListener('click', () => {
        const collapsed = !appShell.classList.contains('sidebar-collapsed');
        setSidebarCollapsed(collapsed);
    });
    if (mobileHistoryToggle) {
        mobileHistoryToggle.addEventListener('click', () => {
            const collapsed = !appShell.classList.contains('sidebar-collapsed');
            setSidebarCollapsed(collapsed);
        });
    }
    if (historyBackdrop) {
        historyBackdrop.addEventListener('click', () => {
            setSidebarCollapsed(true);
        });
    }

    textInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            if (isAssistantBusy()) {
                stopAssistant();
                return;
            }
            handleSendMessage();
        }
    });

    textInput.addEventListener('paste', (event) => {
        event.preventDefault();
        const pasted = event.clipboardData?.getData('text') || '';
        const start = textInput.selectionStart ?? textInput.value.length;
        const end = textInput.selectionEnd ?? textInput.value.length;
        const merged = `${textInput.value.slice(0, start)}${pasted}${textInput.value.slice(end)}`;
        textInput.value = truncateToWordLimit(merged);
        const nextCursor = Math.min(start + pasted.length, textInput.value.length);
        textInput.setSelectionRange(nextCursor, nextCursor);
        enforceMessageWordLimit();
        updateUsageLimitUi();
    });

    textInput.addEventListener('input', () => {
        enforceMessageWordLimit();
        updateUsageLimitUi();
    });

    document.addEventListener('click', (event) => {
        if (!(event.target instanceof Element)) {
            return;
        }
        if (!event.target.closest('.conversation-item') && !event.target.closest('.floating-conversation-menu')) {
            closeAllConversationMenus();
        }
    });
    document.addEventListener('keydown', (event) => {
        if (floatingMenu.classList.contains('open')) {
            if (event.key === 'Escape') {
                const trigger = conversationList.querySelector(
                    '.conversation-item.menu-open .conversation-menu-button'
                );
                closeAllConversationMenus({ returnFocusTo: trigger || undefined });
                event.preventDefault();
                return;
            }
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                const items = [renameMenuButton, deleteMenuButton];
                const currentIndex = items.indexOf(document.activeElement);
                const nextIndex = event.key === 'ArrowDown'
                    ? (currentIndex + 1) % items.length
                    : (currentIndex <= 0 ? items.length - 1 : currentIndex - 1);
                items[nextIndex].focus();
                event.preventDefault();
                return;
            }
        }
        if (event.key !== 'Escape') {
            return;
        }
        closeAllConversationMenus();
        if (
            window.innerWidth <= MOBILE_LAYOUT_MAX_WIDTH
            && appShell
            && !appShell.classList.contains('sidebar-collapsed')
        ) {
            setSidebarCollapsed(true);
        }
    });
    if (googleSignInButton) {
        googleSignInButton.addEventListener('click', async (event) => {
            if (googleSignInButton.disabled || googleSignInButton.getAttribute('aria-disabled') === 'true') {
                event.preventDefault();
                return;
            }
            if (convexIsReady()) {
                event.preventDefault();
                try {
                    await window.WakuConvex.signInGoogle();
                } catch (_error) {
                    // auth may redirect
                }
                return;
            }
            window.location.href = '/auth/google';
        });
    }
    floatingMenu.addEventListener('click', (event) => {
        event.stopPropagation();
        if (!(event.target instanceof Element)) {
            return;
        }
        const actionButton = event.target.closest('button[data-action]');
        const conversationId = floatingMenu.dataset.conversationId || activeMenuConversationId;
        if (!actionButton || !conversationId) {
            return;
        }
        const action = actionButton.getAttribute('data-action');
        const menuTrigger = conversationList.querySelector(
            '.conversation-item.menu-open .conversation-menu-button'
        );
        if (action === 'rename') {
            renameConversation(conversationId);
        } else if (action === 'delete') {
            deleteConversation(conversationId);
        }
        closeAllConversationMenus({
            returnFocusTo: menuTrigger instanceof HTMLElement ? menuTrigger : undefined
        });
    });
    let resizeSyncTimer = null;
    window.addEventListener('resize', () => {
        if (resizeSyncTimer) {
            clearTimeout(resizeSyncTimer);
        }
        resizeSyncTimer = setTimeout(() => {
            resizeSyncTimer = null;
            closeAllConversationMenus();
            syncHistoryBackdrop();
        }, 150);
    }, { passive: true });
    conversationList.addEventListener('scroll', closeAllConversationMenus);

    conversationTitle.setAttribute('contenteditable', 'true');
    conversationTitle.setAttribute('spellcheck', 'false');
    conversationTitle.addEventListener('focus', () => {
        selectTitleText();
    });
    conversationTitle.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            conversationTitle.blur();
        }
        if (event.key === 'Escape') {
            event.preventDefault();
            const conversation = getActiveConversation();
            conversationTitle.textContent = conversation ? conversation.title : 'Conversation';
            conversationTitle.blur();
        }
    });
    conversationTitle.addEventListener('blur', commitConversationTitle);

    let voicePopulateTimer = null;
    function scheduleVoiceListPopulate(force = false) {
        if (voicePopulateTimer) {
            clearTimeout(voicePopulateTimer);
        }
        voicePopulateTimer = setTimeout(() => {
            voicePopulateTimer = null;
            populateVoiceList(force);
        }, 120);
    }

    scheduleVoiceListPopulate(true);
    if ('speechSynthesis' in window && speechSynthesis.onvoiceschanged !== undefined) {
        speechSynthesis.onvoiceschanged = () => scheduleVoiceListPopulate(true);
    }

    let voiceRetryCount = 0;
    const voiceRetryTimer = setInterval(() => {
        if (!('speechSynthesis' in window)) {
            clearInterval(voiceRetryTimer);
            return;
        }
        voiceRetryCount += 1;
        const availableVoices = speechSynthesis.getVoices();
        if (availableVoices.length > 1 || voiceRetryCount >= 10) {
            scheduleVoiceListPopulate(true);
            clearInterval(voiceRetryTimer);
            return;
        }
        scheduleVoiceListPopulate();
    }, 500);

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            clearInterval(voiceRetryTimer);
        }
    });

    try {
        const stored = window.localStorage.getItem(sidebarStorageKey);
        if (stored === null) {
            setSidebarCollapsed(window.innerWidth <= MOBILE_LAYOUT_MAX_WIDTH);
        } else if (stored === '1') {
            setSidebarCollapsed(true);
        } else {
            setSidebarCollapsed(false);
        }
    } catch (_error) {
        setSidebarCollapsed(window.innerWidth <= MOBILE_LAYOUT_MAX_WIDTH);
    }

    window.addEventListener('pageshow', () => {
        void refreshAuthState();
    });

    // Hydrate chat history synchronously at start to prevent premature empty saves
    const hasHistory = loadChatHistory();
    chatHistoryHydrated = true;
    if (hasHistory) {
        renderConversationList();
        renderMessages();
    } else {
        activeConversationId = null;
        renderConversationList();
        renderMessages();
    }

    await waitForConvexReady();
    bindConvexSubscriber();
    if (convexIsReady()) {
        await window.WakuConvex.refresh();
        applyConvexSnapshot(window.WakuConvex.getSnapshot());
    } else {
        await refreshAuthState();
    }
    await refreshUsageStatus();
    updateMessageWordHint();
    syncHistoryBackdrop();

    if (authState.authenticated) {
        ensureChatReadyAfterLogin();
    } else if (activeConversationId && !getActiveConversation()) {
        activeConversationId = null;
        renderConversationList();
        renderMessages();
    }

});
