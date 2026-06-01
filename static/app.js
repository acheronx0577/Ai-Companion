document.addEventListener('DOMContentLoaded', async () => {
    const ASSET_VERSION = document.documentElement.dataset.assetVersion || '20260601c1';
    const GUEST_USAGE_METER_TEXT = 'Sign in for daily trial messages.';
    const MAX_MESSAGE_WORDS = 100;
    const SUPPORTED_CHAT_LANGUAGES = new Set([
        'en', 'ja', 'es', 'fr', 'de', 'it', 'pt', 'ko', 'zh', 'vi', 'nl', 'pl', 'ru', 'hi', 'ar'
    ]);
    const CHAT_LANGUAGE_DISPLAY_NAMES = {
        en: 'English',
        ja: 'Japanese',
        es: 'Spanish',
        fr: 'French',
        de: 'German',
        it: 'Italian',
        pt: 'Portuguese',
        ko: 'Korean',
        zh: 'Chinese',
        vi: 'Vietnamese',
        nl: 'Dutch',
        pl: 'Polish',
        ru: 'Russian',
        hi: 'Hindi',
        ar: 'Arabic'
    };
    const CHAT_INPUT_PLACEHOLDERS = {
        ja: '何でも聞いてください（100語まで）...',
        es: 'Pregúntame lo que quieras (hasta 100 palabras)...',
        fr: 'Pose-moi une question (100 mots max)...',
        de: 'Frag mich etwas (max. 100 Wörter)...',
        it: 'Chiedimi qualcosa (max 100 parole)...',
        pt: 'Pergunte o que quiser (até 100 palavras)...',
        ko: '무엇이든 물어보세요(최대 100단어)...',
        zh: '随便问我（最多 100 字）...',
        vi: 'Hỏi tôi bất cứ điều gì (tối đa 100 từ)...',
        nl: 'Stel je vraag (max. 100 woorden)...',
        pl: 'Zapytaj o cokolwiek (do 100 słów)...',
        ru: 'Спроси что угодно (до 100 слов)...',
        hi: 'कुछ भी पूछें (100 शब्द तक)...',
        ar: 'اسأل أي شيء (حتى 100 كلمة)...'
    };
    let lastTrackedVoiceLanguage = null;
    let voiceLanguageToastTimer = null;
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
    const voiceSelectTrigger = document.getElementById('voice-select-trigger');
    const voiceSelectTriggerLabel = voiceSelectTrigger?.querySelector('.voice-select-trigger-label');
    const voiceSelectListbox = document.getElementById('voice-select-listbox');
    const chatLanguageLabel = document.getElementById('chat-language-label');
    const voiceLanguageToast = document.getElementById('voice-language-toast');
    const MOBILE_LAYOUT_MAX_WIDTH = 900;

    const messageList = document.getElementById('message-list');
    const conversationList = document.getElementById('conversation-list');
    const newChatButton = document.getElementById('new-chat-button');
    const deleteAllChatsButton = document.getElementById('delete-all-chats-button');
    const deleteDataDialog = document.getElementById('delete-data-dialog');
    const deleteDataConfirmButton = document.getElementById('delete-data-confirm');
    const deleteDataCancelButton = document.getElementById('delete-data-cancel');
    const deleteDataDialogBackdrop = deleteDataDialog?.querySelector('.confirm-dialog-backdrop');
    let deleteDataDialogTrigger = null;
    const OVERLAY_MOTION_MS = 220;

    function prefersReducedMotion() {
        return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }

    function openOverlay(element, { onOpen } = {}) {
        if (!element) {
            return;
        }
        element.hidden = false;
        element.classList.remove('is-closing');
        if (prefersReducedMotion()) {
            element.classList.add('is-open');
            onOpen?.();
            return;
        }
        element.classList.remove('is-open');
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                element.classList.add('is-open');
                onOpen?.();
            });
        });
    }

    function closeOverlay(element, { onClosed } = {}) {
        if (!element || element.hidden) {
            onClosed?.();
            return;
        }
        const finish = () => {
            element.classList.remove('is-open', 'is-closing');
            element.hidden = true;
            onClosed?.();
        };
        if (prefersReducedMotion() || !element.classList.contains('is-open')) {
            finish();
            return;
        }
        element.classList.add('is-closing');
        element.classList.remove('is-open');
        let completed = false;
        const complete = () => {
            if (completed) {
                return;
            }
            completed = true;
            element.removeEventListener('transitionend', onTransitionEnd);
            window.clearTimeout(fallbackTimer);
            finish();
        };
        const onTransitionEnd = (event) => {
            if (event.target !== element && !element.contains(event.target)) {
                return;
            }
            complete();
        };
        const fallbackTimer = window.setTimeout(complete, OVERLAY_MOTION_MS + 80);
        element.addEventListener('transitionend', onTransitionEnd);
    }
    const profilePreview = document.getElementById('profile-preview');
    const authGuest = document.getElementById('auth-guest');
    const authUser = document.getElementById('auth-user');
    const googleSignInButton = document.getElementById('google-sign-in-button');
    const authConfigWarning = document.getElementById('auth-config-warning');
    const logoutButton = document.getElementById('logout-button');
    const userDisplayName = document.getElementById('user-display-name');
    const accountMenuButton = document.getElementById('account-menu-button');
    const accountMenuPopover = document.getElementById('account-menu-popover');
    const accountMenuName = document.getElementById('account-menu-name');
    const accountMenuEmail = document.getElementById('account-menu-email');
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
    let piperCatalogVoices = [];
    let piperLanguagesAvailable = new Set();
    let browserVoiceMenu = [];
    let piperStatusCache = null;
    let piperStatusFetchedAt = 0;
    const PIPER_STATUS_TTL_MS = 60_000;
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
        'kyoko', 'nanami', 'haruka', 'sayaka', 'mizuki', 'hfc_female', 'heami', 'yuna', 'sora', 'daniela',
    ];
    const KOREAN_VOICE_HINTS = ['korean', 'heami', 'yuna', 'sora', 'seoyeon', 'google ko', 'microsoft'];
    const SPANISH_MALE_VOICE_HINTS = [
        'sharvard', 'davefx', 'dave', 'pablo', 'diego', 'carlos', 'jorge', 'alvaro', 'arnau',
        'male', 'hombre', 'masculino',
    ];
    const SPANISH_FEMALE_VOICE_HINTS = [
        'daniela', 'lucia', 'helena', 'paloma', 'paulina', 'monica', 'female', 'mujer', 'femenina',
    ];
    const maleNameHints = [
        'male', 'man', 'boy', 'david', 'mark', 'james', 'george', 'daniel', 'paul', 'ryan', 'guy',
        'ichiro', 'takeshi', 'kenji', 'hfc_male',
    ];
    const animeVoiceHints = ['anime', 'kawaii', 'cute'];
    const conversations = [];
    let activeConversationId = null;
    let activeMenuConversationId = null;
    const sidebarStorageKey = 'wakuwaku.sidebarCollapsed';
    const chatHistoryStorageKey = 'wakuwaku.chatHistory';
    let authState = {
        authenticated: !appShell || !appShell.classList.contains('requires-auth'),
        profileLoading: false,
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

    function isAtDailyMessageLimit(state = usageState) {
        if (!state) {
            return false;
        }
        if (state.canSend === false) {
            return true;
        }
        if (state.allowed === false) {
            return true;
        }
        return Number(state.remaining) <= 0 && Number(state.used) >= Number(state.limit || DAILY_MESSAGE_LIMIT);
    }

    function activeConversationHasLimitNotice(limitText = getTrialLimitMessage()) {
        const conversation = getActiveConversation();
        if (!conversation?.messages?.length || !limitText) {
            return false;
        }
        for (let i = conversation.messages.length - 1; i >= 0; i -= 1) {
            const message = conversation.messages[i];
            if (message.role === 'user') {
                return false;
            }
            if (message.role === 'ai' && message.content === limitText) {
                return true;
            }
        }
        return false;
    }

    function showDailyLimitFeedback({ speakMessage = false } = {}) {
        const limitMessage = getTrialLimitMessage();
        updateUsageLimitUi();
        if (!activeConversationHasLimitNotice()) {
            appendMessage('ai', limitMessage);
            saveChatHistory();
            if (speakMessage) {
                void speak(limitMessage);
            }
        }
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
        const borderHeight = textInput.offsetHeight - textInput.clientHeight;
        const targetHeight = textInput.scrollHeight + borderHeight;
        const maxVal = 120; // max-height in CSS is 120px
        if (targetHeight > maxVal) {
            textInput.style.overflowY = 'auto';
        } else {
            textInput.style.overflowY = 'hidden';
        }
        textInput.style.height = `${targetHeight}px`;
    }

    function messageWithinWordLimit(text) {
        return countWords(text) <= MAX_MESSAGE_WORDS;
    }

    function applyUsageState(next) {
        if (!next) {
            return;
        }
        const limit = Number(next.limit) || DAILY_MESSAGE_LIMIT;
        const used = Math.max(0, Number(next.used) || 0);
        const remaining = Math.max(0, Number(next.remaining) || 0);
        const canSend = next.canSend !== undefined
            ? Boolean(next.canSend)
            : (next.allowed !== undefined ? Boolean(next.allowed) : remaining > 0);
        const allowed = next.allowed !== undefined ? Boolean(next.allowed) : canSend;
        usageState = {
            limit,
            used,
            remaining,
            allowed,
            rate: next.rate && typeof next.rate === 'object' ? next.rate : null,
            canSend
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
        // If Convex is still loading, and we are currently authenticated,
        // do not overwrite with unauthenticated state until loading finishes.
        if (snap.loading && !snap.authenticated) {
            if (snap.usage) {
                applyUsageState(snap.usage);
            }
            return;
        }
        authState = {
            authenticated: Boolean(snap.authenticated),
            profileLoading: Boolean(snap.profileLoading),
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
    floatingMenu.hidden = true;
    document.body.appendChild(floatingMenu);

    function isConversationMenuOpen() {
        return Boolean(floatingMenu && !floatingMenu.hidden);
    }

    function getUserAvatarSrc() {
        if (!authState.authenticated) {
            return null;
        }
        return defaultUserAvatar || builtInUserAvatar;
    }

    function isAccountMenuOpen() {
        return Boolean(accountMenuPopover && !accountMenuPopover.hidden);
    }

    function closeAccountMenu({ returnFocus = true } = {}) {
        if (!accountMenuPopover || !accountMenuButton) {
            return;
        }
        accountMenuButton.setAttribute('aria-expanded', 'false');
        closeOverlay(accountMenuPopover, {
            onClosed: () => {
                if (returnFocus) {
                    accountMenuButton.focus();
                }
            }
        });
    }

    function openAccountMenu() {
        if (!accountMenuPopover || !accountMenuButton || !authState.authenticated) {
            return;
        }
        closeAllConversationMenus();
        openOverlay(accountMenuPopover, {
            onOpen: () => {
                accountMenuButton.setAttribute('aria-expanded', 'true');
                logoutButton?.focus();
            }
        });
    }

    function toggleAccountMenu() {
        if (isAccountMenuOpen()) {
            closeAccountMenu();
            return;
        }
        openAccountMenu();
    }

    function syncAccountMenuProfile(name, email) {
        const safeName = name || 'Google user';
        const safeEmail = email || '';
        if (userDisplayName) {
            userDisplayName.textContent = safeName;
        }
        if (accountMenuName) {
            accountMenuName.textContent = safeName;
        }
        if (accountMenuEmail) {
            accountMenuEmail.textContent = safeEmail || 'No email on file';
        }
    }

    function renderAuthUi() {
        const loggedIn = Boolean(authState.authenticated);

        if (!loggedIn) {
            closeAccountMenu({ returnFocus: false });
        }

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
                syncAccountMenuProfile(user.name, user.email);
                if (user.picture) {
                    defaultUserAvatar = user.picture;
                } else {
                    defaultUserAvatar = builtInUserAvatar;
                }
                if (profilePreview) {
                    profilePreview.hidden = false;
                    profilePreview.alt = `${user.name || 'User'} profile picture`;
                    profilePreview.src = defaultUserAvatar;
                }
            } else if (authState.profileLoading) {
                syncAccountMenuProfile('Restoring...', 'Restoring profile...');
                if (profilePreview) {
                    profilePreview.hidden = false;
                    profilePreview.alt = 'User profile picture';
                    profilePreview.src = builtInUserAvatar;
                }
            } else {
                syncAccountMenuProfile('Google user', 'Could not load profile — refresh or sign in again');
                if (profilePreview) {
                    profilePreview.hidden = false;
                    profilePreview.alt = 'User profile picture';
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
                profileLoading: false,
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
                usageMeter.textContent = GUEST_USAGE_METER_TEXT;
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
        return !isAtDailyMessageLimit(usageState);
    }

    function updateUsageLimitUi() {
        if (!authState.authenticated) {
            updateChatAccessForAuth();
            return;
        }

        const limit = usageState.limit || DAILY_MESSAGE_LIMIT;
        const remaining = usageState.remaining;
        const atDailyLimit = isAtDailyMessageLimit(usageState);
        const lowRemaining = !atDailyLimit && remaining > 0 && remaining <= 2;

        if (usageMeter) {
            usageMeter.classList.toggle('usage-meter--limit', atDailyLimit);
            usageMeter.classList.toggle('usage-meter--low', lowRemaining);
            if (atDailyLimit) {
                usageMeter.textContent = `Trial: all ${limit} messages used today · resets tomorrow`;
            } else {
                usageMeter.textContent = `Trial: ${remaining} of ${limit} messages left today`;
            }
        }

        const overWordLimit = !messageWithinWordLimit(textInput.value);
        const sendBlocked = atDailyLimit || overWordLimit;

        textInput.disabled = atDailyLimit;
        textInput.setAttribute('aria-disabled', atDailyLimit ? 'true' : 'false');
        sendButton.disabled = sendBlocked;
        sendButton.setAttribute('aria-disabled', sendBlocked ? 'true' : 'false');
        updateMessageWordHint();

        if (atDailyLimit) {
            textInput.placeholder = 'Daily trial limit reached — come back tomorrow';
        } else {
            updateInputPlaceholderForLanguage(getSelectedSpeechLanguage());
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
        delete floatingMenu.dataset.conversationId;
        activeMenuConversationId = null;
        const focusTrigger = () => {
            if (returnFocusTo instanceof HTMLElement) {
                returnFocusTo.focus();
            }
        };
        if (floatingMenu.hidden) {
            focusTrigger();
            return;
        }
        closeOverlay(floatingMenu, { onClosed: focusTrigger });
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
        openOverlay(floatingMenu, {
            onOpen: () => {
                menuButton.setAttribute('aria-expanded', 'true');
                renameMenuButton.focus();
            },
        });
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
            titleSpan.className = 'conversation-title-text';
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

    function isVoiceSelectOpen() {
        return Boolean(voiceSelectListbox && !voiceSelectListbox.hidden);
    }

    function closeVoiceSelectListbox({ returnFocus = true } = {}) {
        if (!voiceSelectListbox || voiceSelectListbox.hidden) {
            voiceSelectTrigger?.setAttribute('aria-expanded', 'false');
            voiceSelectTrigger?.removeAttribute('aria-activedescendant');
            return;
        }
        const finish = () => {
            voiceSelectTrigger?.setAttribute('aria-expanded', 'false');
            voiceSelectTrigger?.removeAttribute('aria-activedescendant');
            if (returnFocus && voiceSelectTrigger) {
                voiceSelectTrigger.focus();
            }
        };
        closeOverlay(voiceSelectListbox, { onClosed: finish });
    }

    function voiceOptionGroupLabel(option) {
        const engine = option.getAttribute('data-engine');
        if (engine === 'piper') {
            return 'Piper voices';
        }
        if (engine === 'browser-target') {
            return 'Device voices';
        }
        return 'Browser voices';
    }

    function buildVoiceListboxSignature() {
        if (!voiceSelect) {
            return '';
        }
        return Array.from(voiceSelect.options)
            .map((option, index) => (
                `${index}:${option.disabled ? 0 : 1}:${option.value}:${option.textContent}:${option.getAttribute('data-engine') || ''}`
            ))
            .join('|');
    }

    let voiceListboxDomSignature = '';
    let voiceListInitialized = false;

    function setVoiceListboxActiveOption(item) {
        if (!item || !voiceSelectTrigger) {
            return;
        }
        const index = item.dataset.voiceIndex;
        const id = item.id || `voice-option-${index}`;
        item.id = id;
        voiceSelectTrigger.setAttribute('aria-activedescendant', id);
    }

    function updateVoiceListboxSelectionOnly() {
        if (!voiceSelectListbox || !voiceSelect) {
            return;
        }
        const items = voiceSelectListbox.querySelectorAll('.voice-select-option');
        items.forEach((item) => {
            const index = Number(item.dataset.voiceIndex);
            item.setAttribute(
                'aria-selected',
                index === voiceSelect.selectedIndex ? 'true' : 'false'
            );
        });
    }

    async function openVoiceSelectListbox() {
        if (!voiceSelect || voiceSelect.disabled || !voiceSelectListbox || !voiceSelectTrigger) {
            return;
        }
        if (isVoiceSelectOpen()) {
            closeVoiceSelectListbox();
            return;
        }
        await fetchPiperStatus(true);
        await populateVoiceList(false, { preserveSelection: true });
        syncVoiceSelectUi();
        openOverlay(voiceSelectListbox, {
            onOpen: () => {
                voiceSelectTrigger.setAttribute('aria-expanded', 'true');
                const selectedOption = voiceSelectListbox.querySelector(
                    '.voice-select-option[aria-selected="true"]'
                );
                const active = selectedOption
                    || voiceSelectListbox.querySelector('.voice-select-option:not(:disabled)');
                active?.focus();
                setVoiceListboxActiveOption(active);
            },
        });
    }

    function selectVoiceIndex(index) {
        if (!voiceSelect || index < 0 || index >= voiceSelect.options.length) {
            return;
        }
        const changed = voiceSelect.selectedIndex !== index;
        voiceSelect.selectedIndex = index;
        syncVoiceSelectUi();
        if (changed) {
            voiceSelect.dispatchEvent(new Event('change', { bubbles: true }));
        }
        closeVoiceSelectListbox({ returnFocus: true });
    }

    function syncVoiceSelectUi({ forceRebuild = false } = {}) {
        if (!voiceSelect || !voiceSelectTrigger) {
            return;
        }
        const selected = voiceSelect.selectedOptions[0];
        const label = selected?.textContent?.trim() || 'Loading voices...';
        if (voiceSelectTriggerLabel) {
            voiceSelectTriggerLabel.textContent = label;
            voiceSelectTriggerLabel.title = label;
        }
        voiceSelectTrigger.disabled = voiceSelect.disabled;
        voiceSelectTrigger.title = voiceSelect.disabled ? '' : label;
        if (!voiceSelectListbox) {
            return;
        }

        const signature = buildVoiceListboxSignature();
        if (
            !forceRebuild
            && signature === voiceListboxDomSignature
            && voiceSelectListbox.querySelector('.voice-select-option')
        ) {
            updateVoiceListboxSelectionOnly();
            return;
        }

        voiceListboxDomSignature = signature;
        voiceSelectListbox.replaceChildren();
        let lastGroup = null;
        Array.from(voiceSelect.options).forEach((option, index) => {
            const group = voiceOptionGroupLabel(option);
            if (group !== lastGroup) {
                lastGroup = group;
                const heading = document.createElement('div');
                heading.className = 'voice-select-group-label';
                heading.setAttribute('role', 'presentation');
                heading.textContent = group;
                voiceSelectListbox.appendChild(heading);
            }

            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'voice-select-option';
            item.dataset.voiceIndex = String(index);
            item.setAttribute('role', 'option');
            item.setAttribute('aria-selected', index === voiceSelect.selectedIndex ? 'true' : 'false');
            item.textContent = option.textContent;
            item.title = option.textContent || '';
            item.disabled = voiceSelect.disabled || option.disabled || option.value === '';
            item.addEventListener('click', () => {
                selectVoiceIndex(index);
            });
            voiceSelectListbox.appendChild(item);
        });
    }

    function setVoiceSelectUnavailable(message) {
        if (!voiceSelect) {
            return;
        }
        voiceSelect.innerHTML = '';
        const option = document.createElement('option');
        option.textContent = message;
        option.value = '';
        voiceSelect.appendChild(option);
        voiceSelect.disabled = true;
        syncVoiceSelectUi();
    }

    function buildVoiceSignature(voiceList) {
        return voiceList.map((voice) => `${voice.name}|${voice.lang}`).join('||');
    }

    function formatShortLocale(languageCode) {
        const raw = (languageCode || 'en-US').trim().replace(/_/g, '-');
        const parts = raw.split('-').filter(Boolean);
        if (!parts.length) {
            return 'en-US';
        }
        const lang = parts[0].toLowerCase();
        if (parts.length === 1) {
            if (lang === 'en') {
                return 'en-US';
            }
            if (lang === 'ja') {
                return 'ja-JP';
            }
            return lang;
        }
        const region = parts[1].toUpperCase();
        return `${lang}-${region}`;
    }

    function inferVoiceGender(voiceOrName) {
        const name = typeof voiceOrName === 'string' ? voiceOrName : voiceOrName?.name || '';
        const normalized = name.toLowerCase();
        if (/\bfemale\b|_female|hfc_female/.test(normalized)) {
            return 'Female';
        }
        if (/\bmale\b|_male|hfc_male/.test(normalized)) {
            return 'Male';
        }
        if (femaleNameHints.some((hint) => normalized.includes(hint))) {
            return 'Female';
        }
        if (maleNameHints.some((hint) => normalized.includes(hint))) {
            return 'Male';
        }
        return 'Neutral';
    }

    function inferVoiceBrand(voiceName) {
        const normalized = (voiceName || '').toLowerCase();
        if (normalized.includes('google')) {
            return 'Google';
        }
        if (normalized.includes('microsoft')) {
            return 'Microsoft';
        }
        if (normalized.includes('apple')) {
            return 'Apple';
        }
        if (normalized.includes('amazon') || normalized.includes('polly')) {
            return 'Amazon';
        }
        return 'System';
    }

    function formatVoiceGenderPhrase(gender) {
        if (gender === 'Female' || gender === 'Male') {
            return `Voice ${gender}`;
        }
        return 'Voice';
    }

    function formatBrowserVoiceLabel(voice) {
        const locale = formatShortLocale(voice.lang);
        const gender = inferVoiceGender(voice);
        const brand = inferVoiceBrand(voice.name);
        const descriptor = isLikelyAnimeVoice(voice) ? 'Anime ' : '';
        return `${brand} ${descriptor}${formatVoiceGenderPhrase(gender)} (${locale})`.replace(/\s+/g, ' ');
    }

    function isLikelyFemaleVoice(voice) {
        return inferVoiceGender(voice) === 'Female';
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

    function isSpanishLanguageCode(languageCode) {
        return normalizeChatLanguage(languageCode) === 'es';
    }

    function isLikelyMaleSpanishVoice(voice) {
        const name = (voice.name || '').toLowerCase();
        const uri = (voice.voiceURI || '').toLowerCase();
        return SPANISH_MALE_VOICE_HINTS.some((hint) => name.includes(hint) || uri.includes(hint));
    }

    function isLikelyFemaleSpanishVoice(voice) {
        const name = (voice.name || '').toLowerCase();
        const uri = (voice.voiceURI || '').toLowerCase();
        return SPANISH_FEMALE_VOICE_HINTS.some((hint) => name.includes(hint) || uri.includes(hint))
            || isLikelyFemaleVoice(voice);
    }

    function isExcludedVoice(voice) {
        if (!voice) {
            return true;
        }
        const normalizedName = (voice.name || '').toLowerCase();
        const normalizedUri = (voice.voiceURI || '').toLowerCase();
        const normalizedLang = (voice.lang || '').toLowerCase();
        const isMicrosoft = normalizedName.includes('microsoft') || normalizedUri.includes('microsoft');
        if (normalizedLang.startsWith('en') && isMicrosoft) {
            return true;
        }
        return normalizedName.includes('microsoft jia');
    }

    function pickOneVoicePerLanguage(allVoices) {
        const eligibleVoices = allVoices.filter((voice) => !isExcludedVoice(voice));
        const groupedByLanguage = new Map();
        eligibleVoices.forEach((voice) => {
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

            if (isSpanishLanguageCode(languageCode)) {
                const nonMale = prioritizedVoices.filter((voice) => !isLikelyMaleSpanishVoice(voice));
                const pool = nonMale.length ? nonMale : prioritizedVoices;
                const femaleVoice = pool.find(isLikelyFemaleSpanishVoice);
                selected.push(femaleVoice || pool[0]);
                return;
            }

            const femaleVoice = prioritizedVoices.find(isLikelyFemaleVoice);
            selected.push(femaleVoice || prioritizedVoices[0]);
        });

        return selected.sort((a, b) => a.lang.localeCompare(b.lang));
    }

    function isPiperVoiceSelected() {
        const selected = voiceSelect?.selectedOptions[0];
        if (!selected || selected.disabled) {
            return false;
        }
        if (selected.getAttribute('data-engine') === 'piper') {
            return Boolean(selected.value);
        }
        return (selected.value || '').startsWith('piper:');
    }

    function shouldUsePiperTts() {
        if (isPiperVoiceSelected()) {
            return true;
        }
        const lang = getSelectedSpeechLanguage();
        if (!findAvailablePiperVoiceForLanguage(lang)) {
            return false;
        }
        if (isBrowserTargetVoiceSelected()) {
            return false;
        }
        return true;
    }

    function isBrowserTargetVoiceSelected() {
        const selected = voiceSelect?.selectedOptions[0];
        return selected?.getAttribute('data-engine') === 'browser-target';
    }

    function getSelectedPiperVoiceId() {
        const selected = voiceSelect?.selectedOptions[0];
        if (!selected || selected.getAttribute('data-engine') !== 'piper' || selected.disabled) {
            return null;
        }
        const value = selected.value || '';
        return value.startsWith('piper:') ? value.slice(6) : null;
    }

    function isWindowsPlatform() {
        return (
            (navigator.userAgentData?.platform || '').toLowerCase().includes('win')
            || (navigator.platform || '').toLowerCase().includes('win')
            || (navigator.userAgent || '').toLowerCase().includes('windows')
        );
    }

    function isiOSPlatform() {
        const platform = (navigator.platform || '').toLowerCase();
        const ua = (navigator.userAgent || '').toLowerCase();
        const uaData = (navigator.userAgentData?.platform || '').toLowerCase();
        // iPadOS 13+ reports as Mac; detect touch.
        const isAppleDevice = platform.includes('iphone') || platform.includes('ipad') || platform.includes('ipod');
        const isMacLikeiPad = (
            (platform.includes('mac') || uaData.includes('mac'))
            && 'maxTouchPoints' in navigator
            && navigator.maxTouchPoints > 1
        );
        return isAppleDevice || isMacLikeiPad || ua.includes('iphone') || ua.includes('ipad');
    }

    function isAndroidPlatform() {
        return (navigator.userAgent || '').toLowerCase().includes('android');
    }

    function isPiperLanguageAvailable(targetLang) {
        const code = normalizeChatLanguage(targetLang);
        if (piperLanguagesAvailable.has(code)) {
            return true;
        }
        return piperCatalogVoices.some((entry) => entry.lang === code && entry.available);
    }

    function findAvailablePiperVoiceForLanguage(targetLang) {
        const code = normalizeChatLanguage(targetLang);
        return piperCatalogVoices.find((entry) => entry.lang === code && entry.available) || null;
    }

    function selectFirstPiperVoiceForLanguage(targetLang) {
        if (!voiceSelect) {
            return false;
        }
        const code = normalizeChatLanguage(targetLang);
        for (let index = 0; index < voiceSelect.options.length; index += 1) {
            const option = voiceSelect.options[index];
            if (option.getAttribute('data-engine') !== 'piper' || option.disabled) {
                continue;
            }
            if (normalizeChatLanguage(option.getAttribute('data-lang') || '') === code) {
                selectVoiceIndex(index);
                return true;
            }
        }
        return false;
    }

    function isDeviceMenuLanguage(targetLang) {
        const code = normalizeChatLanguage(targetLang);
        if (isPiperLanguageAvailable(code)) {
            return false;
        }
        return browserVoiceMenu.some((entry) => entry.lang === code);
    }

    /** Device-menu languages must match exactly — never fall back to another language voice. */
    function requiresInstalledDeviceVoice(targetLang) {
        return isDeviceMenuLanguage(targetLang);
    }

    function voiceMatchesChatLanguage(voice, target) {
        const normalized = normalizeChatLanguage(voice.lang);
        if (normalized === target) {
            return true;
        }
        const raw = (voice.lang || '').toLowerCase().replace(/_/g, '-');
        return raw === target || raw.startsWith(`${target}-`);
    }

    function findBrowserVoiceForLanguage(languageCode) {
        const target = normalizeChatLanguage(languageCode);
        const allVoices = speechSynthesis.getVoices();
        const eligible = allVoices.filter((voice) => !isExcludedVoice(voice));
        const matches = eligible.filter((voice) => voiceMatchesChatLanguage(voice, target));
        if (!matches.length) {
            return null;
        }
        if (target === 'ja') {
            const animeFemale = matches.find(
                (voice) => isLikelyFemaleVoice(voice) && isLikelyAnimeVoice(voice)
            );
            const female = matches.find(isLikelyFemaleVoice);
            return animeFemale || female || matches[0];
        }
        if (target === 'ko') {
            const hinted = matches.find((voice) => {
                const name = (voice.name || '').toLowerCase();
                return KOREAN_VOICE_HINTS.some((hint) => name.includes(hint));
            });
            const female = matches.find(isLikelyFemaleVoice);
            return hinted || female || matches[0];
        }
        if (target === 'es') {
            const nonMale = matches.filter((voice) => !isLikelyMaleSpanishVoice(voice));
            const pool = nonMale.length ? nonMale : matches;
            const hinted = pool.find(isLikelyFemaleSpanishVoice);
            return hinted || pool[0];
        }
        const female = matches.find(isLikelyFemaleVoice);
        return female || matches[0];
    }

    function getSelectedBrowserVoice() {
        const selectedOption = voiceSelect?.selectedOptions[0];
        if (!selectedOption) {
            return voices[0] || null;
        }
        if (selectedOption.getAttribute('data-engine') === 'browser-target') {
            const targetLang = selectedOption.getAttribute('data-target-lang') || 'en';
            const matchedVoice = findBrowserVoiceForLanguage(targetLang);
            if (isDeviceMenuLanguage(targetLang)) {
                return matchedVoice || null;
            }
            return matchedVoice || voices[0] || null;
        }
        const selectedVoiceName = selectedOption.getAttribute('data-name');
        return voices.find((voice) => voice.name === selectedVoiceName) || voices[0] || null;
    }

    function normalizeChatLanguage(languageCode) {
        const raw = (languageCode || 'en').trim().toLowerCase().replace(/_/g, '-');
        if (!raw) {
            return 'en';
        }
        const primary = raw.split('-')[0];
        return SUPPORTED_CHAT_LANGUAGES.has(primary) ? primary : 'en';
    }

    function getChatLanguageDisplayName(languageCode) {
        const code = normalizeChatLanguage(languageCode);
        return CHAT_LANGUAGE_DISPLAY_NAMES[code] || code.toUpperCase();
    }

    function getSelectedSpeechLanguage() {
        const selected = voiceSelect?.selectedOptions[0];
        const lang = selected?.getAttribute('data-lang') || 'en-US';
        return normalizeChatLanguage(lang);
    }

    function getSelectedSpeechLocale() {
        const selected = voiceSelect?.selectedOptions[0];
        const raw = (selected?.getAttribute('data-lang') || 'en-US').trim().replace(/_/g, '-');
        if (!raw) {
            return 'en-US';
        }
        const parts = raw.split('-').filter(Boolean);
        if (parts.length === 1) {
            const lang = parts[0].toLowerCase();
            if (lang === 'en') {
                return 'en-US';
            }
            if (lang === 'ja') {
                return 'ja-JP';
            }
            if (lang === 'ko') {
                return 'ko-KR';
            }
            return lang;
        }
        return `${parts[0].toLowerCase()}-${parts[1].toUpperCase()}`;
    }

    function ensureSpeechVoicesReady(timeoutMs = 2500) {
        if (!('speechSynthesis' in window)) {
            return Promise.resolve(false);
        }
        const existing = speechSynthesis.getVoices();
        if (existing.length > 0) {
            return Promise.resolve(true);
        }
        return new Promise((resolve) => {
            let settled = false;
            const finish = (ok) => {
                if (settled) {
                    return;
                }
                settled = true;
                window.clearTimeout(timer);
                speechSynthesis.removeEventListener('voiceschanged', onVoicesChanged);
                resolve(ok);
            };
            const onVoicesChanged = () => {
                if (speechSynthesis.getVoices().length > 0) {
                    finish(true);
                }
            };
            const timer = window.setTimeout(
                () => finish(speechSynthesis.getVoices().length > 0),
                timeoutMs
            );
            speechSynthesis.addEventListener('voiceschanged', onVoicesChanged);
            speechSynthesis.getVoices();
        });
    }

    /** Call synchronously from Send click so mobile browsers allow TTS after async /chat. */
    function primeSpeechSynthesis() {
        if (!('speechSynthesis' in window)) {
            return;
        }
        try {
            speechSynthesis.resume();
            const prime = new SpeechSynthesisUtterance('\u200b');
            prime.volume = 0.01;
            prime.lang = getSelectedSpeechLocale();
            const voice = getSelectedBrowserVoice();
            if (voice) {
                prime.voice = voice;
            }
            speechSynthesis.speak(prime);
        } catch (_error) {
            // ignore — real speak() will retry
        }
    }

    function updateChatLanguageLabel(languageCode) {
        if (!chatLanguageLabel) {
            return;
        }
        const name = getChatLanguageDisplayName(languageCode);
        chatLanguageLabel.textContent = `Chat: ${name}`;
    }

    function updateInputPlaceholderForLanguage(languageCode) {
        if (!textInput || textInput.disabled) {
            return;
        }
        const code = normalizeChatLanguage(languageCode);
        textInput.placeholder = CHAT_INPUT_PLACEHOLDERS[code]
            || `Ask me anything (up to ${MAX_MESSAGE_WORDS} words)...`;
    }

    function showVoiceToast(message, durationMs = 8000) {
        if (!voiceLanguageToast) {
            return;
        }
        voiceLanguageToast.textContent = message;
        voiceLanguageToast.hidden = false;
        voiceLanguageToast.classList.add('is-visible');
        if (voiceLanguageToastTimer) {
            clearTimeout(voiceLanguageToastTimer);
        }
        voiceLanguageToastTimer = setTimeout(() => {
            voiceLanguageToast.classList.remove('is-visible');
            voiceLanguageToast.hidden = true;
            voiceLanguageToastTimer = null;
        }, durationMs);
    }

    function showPiperPlaybackToast(languageCode) {
        const name = getChatLanguageDisplayName(languageCode);
        showVoiceToast(
            `Could not play ${name} with Piper. `
            + 'Make sure Flask is running (npm run dev) and the voice model is in voices/.'
        );
    }

    function showVoiceUnavailableToast(languageCode) {
        const code = normalizeChatLanguage(languageCode);
        const piperEntry = findAvailablePiperVoiceForLanguage(code);
        if (isPiperVoiceSelected() || isPiperLanguageAvailable(code) || piperEntry) {
            if (piperEntry && !isPiperVoiceSelected()) {
                selectFirstPiperVoiceForLanguage(code);
                warmupPiperVoice(piperEntry.id);
            }
            showVoiceToast(
                piperEntry
                    ? `${piperEntry.label} uses Piper — no Windows speech install needed.`
                    : `${getChatLanguageDisplayName(code)} uses Piper on this device.`
            );
            return;
        }
        const name = getChatLanguageDisplayName(languageCode);
        const isWindows = isWindowsPlatform();
        const isIos = isiOSPlatform();
        const isAndroid = isAndroidPlatform();
        const mobileDeviceUnavailable = `${name} voice is not available on your device.`;
        const genericSteps = `${name} voice is not available on your device.`;
        const installHint = isWindows
            ? `On Windows: Settings → Time & language → Speech → add ${name}, then refresh the page. `
            : ((isIos || isAndroid) ? mobileDeviceUnavailable : genericSteps);
        showVoiceToast(
            isWindows
                ? (
                    `No audio: ${name} voice isn’t installed on this device. `
                    + installHint
                    + '(Device voices use your system/browser speech, not Piper.)'
                )
                : installHint
        );
    }

    function showVoiceLanguageToast(languageCode) {
        const name = getChatLanguageDisplayName(languageCode);
        showVoiceToast(
            `Voice changed — WakuWaku will reply in ${name}. `
            + 'The voice and chat language now match.',
            5200
        );
    }

    function syncChatLanguageUi(languageCode, { notify = false } = {}) {
        const code = normalizeChatLanguage(languageCode);
        updateChatLanguageLabel(code);
        updateInputPlaceholderForLanguage(code);
        if (
            notify
            && lastTrackedVoiceLanguage !== null
            && code !== lastTrackedVoiceLanguage
        ) {
            showVoiceLanguageToast(code);
        }
        lastTrackedVoiceLanguage = code;
    }

    async function fetchPiperStatus(force = false) {
        const now = Date.now();
        if (!force && piperStatusCache && now - piperStatusFetchedAt < PIPER_STATUS_TTL_MS) {
            return piperStatusCache;
        }
        try {
            const statusResponse = await fetch('/voices/status');
            if (statusResponse.ok) {
                piperStatusCache = await readJsonResponse(statusResponse);
                piperStatusFetchedAt = now;
            }
        } catch (_error) {
            piperStatusCache = null;
        }
        return piperStatusCache;
    }

    function buildPiperStatusSignature(piperVoices, browserMenu) {
        const piperPart = piperVoices
            .map((entry) => `${entry.id}|${entry.lang}|${entry.available ? 1 : 0}`)
            .join(';');
        const browserPart = browserMenu.map((entry) => `${entry.lang}|${entry.locale}`).join(';');
        return `${piperPart}|${browserPart}`;
    }

    const PIPER_MENU_ORDER = ['en', 'es', 'zh', 'vi'];

    function sortPiperMenuEntries(entries) {
        return [...entries].sort((a, b) => {
            const aIndex = PIPER_MENU_ORDER.indexOf(a.lang);
            const bIndex = PIPER_MENU_ORDER.indexOf(b.lang);
            const aRank = aIndex === -1 ? PIPER_MENU_ORDER.length : aIndex;
            const bRank = bIndex === -1 ? PIPER_MENU_ORDER.length : bIndex;
            if (aRank !== bRank) {
                return aRank - bRank;
            }
            return a.label.localeCompare(b.label);
        });
    }

    function captureVoiceSelectionSnapshot() {
        if (!voiceSelect || voiceSelect.disabled) {
            return null;
        }
        const selected = voiceSelect.selectedOptions[0];
        if (!selected || !selected.value) {
            return null;
        }
        return {
            value: selected.value,
            piperId: getSelectedPiperVoiceId(),
            browserLang: selected.getAttribute('data-engine') === 'browser-target'
                ? selected.getAttribute('data-target-lang') || getSelectedSpeechLanguage()
                : null,
            dataName: selected.getAttribute('data-name') || '',
        };
    }

    function restoreVoiceSelection(snapshot) {
        if (!voiceSelect || !snapshot) {
            return false;
        }
        const candidates = [];
        if (snapshot.value) {
            candidates.push(snapshot.value);
        }
        if (snapshot.piperId) {
            candidates.push(`piper:${snapshot.piperId}`);
        }
        if (snapshot.browserLang) {
            candidates.push(`browser:${snapshot.browserLang}`);
        }
        for (const value of candidates) {
            const index = Array.from(voiceSelect.options).findIndex(
                (option) => option.value === value && !option.disabled
            );
            if (index >= 0) {
                voiceSelect.selectedIndex = index;
                return true;
            }
        }
        if (snapshot.dataName) {
            const index = Array.from(voiceSelect.options).findIndex(
                (option) => option.getAttribute('data-name') === snapshot.dataName && !option.disabled
            );
            if (index >= 0) {
                voiceSelect.selectedIndex = index;
                return true;
            }
        }
        return false;
    }

    function applyDefaultVoiceSelection({
        piperReadyVoices,
        piperAvailable,
        browserVoiceMenu,
        piperOffset,
        usVoiceIndex,
        japaneseVoiceIndex,
        koreanVoiceIndex,
    }) {
        if (piperAvailable) {
            const englishPiperIndex = piperReadyVoices.findIndex((entry) => entry.lang === 'en');
            voiceSelect.selectedIndex = englishPiperIndex >= 0 ? englishPiperIndex : 0;
        } else if (browserVoiceMenu.length) {
            const englishDeviceIndex = browserVoiceMenu.findIndex((entry) => entry.lang === 'en');
            voiceSelect.selectedIndex = piperReadyVoices.length
                + (englishDeviceIndex >= 0 ? englishDeviceIndex : 0);
        } else if (japaneseVoiceIndex !== -1) {
            voiceSelect.selectedIndex = japaneseVoiceIndex + piperOffset;
        } else if (koreanVoiceIndex !== -1) {
            voiceSelect.selectedIndex = koreanVoiceIndex + piperOffset;
        } else if (usVoiceIndex !== -1) {
            voiceSelect.selectedIndex = usVoiceIndex + piperOffset;
        }
    }

    async function populateVoiceList(force = false, { preserveSelection = false } = {}) {
        if (!voiceSelect) {
            return;
        }
        const selectionSnapshot = preserveSelection ? captureVoiceSelectionSnapshot() : null;
        piperCatalogVoices = [];
        browserVoiceMenu = [];
        const statusData = await fetchPiperStatus(force);
        if (statusData) {
            if (Array.isArray(statusData.piperVoices)) {
                piperCatalogVoices = sortPiperMenuEntries(statusData.piperVoices);
            }
            if (Array.isArray(statusData.browserVoiceMenu)) {
                browserVoiceMenu = statusData.browserVoiceMenu;
            }
        }

        const piperReadyVoices = piperCatalogVoices.filter((entry) => entry.available);
        const piperAvailable = piperReadyVoices.length > 0;
        const piperLangs = new Set(piperReadyVoices.map((entry) => entry.lang));
        piperLanguagesAvailable = piperLangs;
        if (piperLangs.size) {
            browserVoiceMenu = browserVoiceMenu.filter((entry) => !piperLangs.has(entry.lang));
        }
        const speechSupported = 'speechSynthesis' in window;
        const allVoices = speechSupported ? speechSynthesis.getVoices() : [];
        const pinnedBrowserLangs = new Set(browserVoiceMenu.map((entry) => entry.lang));
        const nextSignature = `${buildPiperStatusSignature(piperCatalogVoices, browserVoiceMenu)}|${buildVoiceSignature(allVoices)}`;
        if (!force && nextSignature === lastVoiceSignature) {
            return;
        }
        lastVoiceSignature = nextSignature;

        if (!speechSupported && !piperAvailable && !browserVoiceMenu.length) {
            voices = [];
            setVoiceSelectUnavailable('Speech not supported');
            closeVoiceSelectListbox({ returnFocus: false });
            return;
        }

        voices = pickOneVoicePerLanguage(allVoices).filter((voice) => {
            const primary = normalizeChatLanguage(voice.lang);
            if (piperLangs.has(primary) || pinnedBrowserLangs.has(primary)) {
                return false;
            }
            return true;
        });
        voiceSelect.innerHTML = '';
        voiceSelect.disabled = false;

        piperReadyVoices.forEach((entry) => {
            const piperOption = document.createElement('option');
            piperOption.value = `piper:${entry.id}`;
            piperOption.textContent = entry.label;
            piperOption.setAttribute('data-engine', 'piper');
            piperOption.setAttribute('data-lang', entry.locale || entry.lang);
            piperOption.setAttribute('data-name', `piper:${entry.id}`);
            voiceSelect.appendChild(piperOption);
        });

        browserVoiceMenu.forEach((entry) => {
            const browserOption = document.createElement('option');
            browserOption.value = `browser:${entry.lang}`;
            browserOption.textContent = entry.label;
            browserOption.setAttribute('data-engine', 'browser-target');
            browserOption.setAttribute('data-lang', entry.locale || entry.lang);
            browserOption.setAttribute('data-target-lang', entry.lang);
            browserOption.setAttribute('data-name', `browser:${entry.lang}`);
            voiceSelect.appendChild(browserOption);
        });

        if (!voices.length && !piperAvailable && !browserVoiceMenu.length) {
            setVoiceSelectUnavailable('Loading voices...');
            return;
        }

        let usVoiceIndex = -1;
        let japaneseVoiceIndex = -1;
        let koreanVoiceIndex = -1;
        const piperOffset = piperReadyVoices.length + browserVoiceMenu.length;

        voices.forEach((voice, i) => {
            const option = document.createElement('option');
            option.textContent = formatBrowserVoiceLabel(voice);
            option.setAttribute('data-lang', voice.lang);
            option.setAttribute('data-name', voice.name);
            voiceSelect.appendChild(option);

            const primary = normalizeChatLanguage(voice.lang);
            if (voice.lang === 'en-US' && usVoiceIndex === -1) {
                usVoiceIndex = i;
            }
            if (isJapaneseLanguageCode(voice.lang) && japaneseVoiceIndex === -1) {
                japaneseVoiceIndex = i;
            }
            if (primary === 'ko' && koreanVoiceIndex === -1) {
                koreanVoiceIndex = i;
            }
        });

        const restored = restoreVoiceSelection(selectionSnapshot);
        if (!restored) {
            applyDefaultVoiceSelection({
                piperReadyVoices,
                piperAvailable,
                browserVoiceMenu,
                piperOffset,
                usVoiceIndex,
                japaneseVoiceIndex,
                koreanVoiceIndex,
            });
        }

        syncChatLanguageUi(getSelectedSpeechLanguage(), { notify: false });
        syncVoiceSelectUi({ forceRebuild: true });

        const warmedPiperId = getSelectedPiperVoiceId();
        if (warmedPiperId) {
            warmupPiperVoice(warmedPiperId);
        }
        voiceListInitialized = true;
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

    function stopAllSpeech({ cancelBrowserTts = true } = {}) {
        activeSpeechId += 1;
        speechInProgress = false;
        stopLipSync();
        if (
            cancelBrowserTts
            && 'speechSynthesis' in window
            && (speechSynthesis.speaking || speechSynthesis.pending)
        ) {
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

    async function speakWithBrowserVoice(text, speechId) {
        if (!('speechSynthesis' in window)) {
            return;
        }

        const targetLang = getSelectedSpeechLanguage();
        if (findAvailablePiperVoiceForLanguage(targetLang)) {
            showVoiceToast(
                `Pick a Piper voice for ${getChatLanguageDisplayName(targetLang)} (e.g. Daniela for Spanish). `
                + 'Device/browser speech is not used when Piper is installed.'
            );
            return;
        }

        await ensureSpeechVoicesReady();

        const chunks = splitTextForSpeech(text);
        if (!chunks.length) {
            return;
        }

        const speechLocale = getSelectedSpeechLocale();
        let selectedVoice = getSelectedBrowserVoice();
        if (!selectedVoice && isBrowserTargetVoiceSelected() && isDeviceMenuLanguage(targetLang)) {
            showVoiceUnavailableToast(targetLang);
            return;
        }
        let chunkIndex = 0;
        let spokeAnyChunk = false;

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
            utterance.lang = speechLocale;
            if (selectedVoice) {
                utterance.voice = selectedVoice;
            }

            utterance.onstart = () => {
                if (speechId === activeSpeechId) {
                    spokeAnyChunk = true;
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
                if (isDeviceMenuLanguage(targetLang) && !spokeAnyChunk) {
                    showVoiceUnavailableToast(targetLang);
                }
                chunkIndex += 1;
                speakNextChunk();
            };

            try {
                speechSynthesis.resume();
                speechSynthesis.speak(utterance);
            } catch (_error) {
                chunkIndex += 1;
                speakNextChunk();
            }
        };

        startSpeechResumeWatch(speechId);
        speakNextChunk();
        });
    }

    async function fetchPiperAudioBlob(text, piperVoiceId) {
        const ttsResponse = await fetch('/tts', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                text,
                voice: piperVoiceId
            })
        });
        if (!ttsResponse.ok) {
            return null;
        }
        return ttsResponse.blob();
    }

    let piperWarmupVoiceId = null;
    function warmupPiperVoice(voiceId) {
        if (!voiceId || piperWarmupVoiceId === voiceId) {
            return;
        }
        piperWarmupVoiceId = voiceId;
        // Piper/espeak does not synthesize "." (empty audio); use a short real word.
        void fetchPiperAudioBlob('Hi', voiceId).catch(() => {
            if (piperWarmupVoiceId === voiceId) {
                piperWarmupVoiceId = null;
            }
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

    async function speakWithPiperVoice(text, speechId, { firstChunkPromise = null } = {}) {
        const chunks = splitTextForSpeech(text, 420);
        let piperVoiceId = getSelectedPiperVoiceId();
        if (!piperVoiceId) {
            const fallback = findAvailablePiperVoiceForLanguage(getSelectedSpeechLanguage());
            piperVoiceId = fallback?.id || null;
        }
        if (!piperVoiceId) {
            return false;
        }
        if (!chunks.length) {
            return false;
        }

        const firstBlob = firstChunkPromise
            ? await firstChunkPromise
            : await fetchPiperAudioBlob(chunks[0], piperVoiceId);
        if (!firstBlob || speechId !== activeSpeechId) {
            return false;
        }

        const restBlobsPromise = chunks.length > 1
            ? Promise.all(
                chunks.slice(1).map((chunk) => fetchPiperAudioBlob(chunk, piperVoiceId))
            )
            : Promise.resolve([]);

        const playedFirst = await playAudioBlob(firstBlob, speechId);
        if (!playedFirst || speechId !== activeSpeechId) {
            return false;
        }

        const restBlobs = await restBlobsPromise;
        for (const blob of restBlobs) {
            if (speechId !== activeSpeechId) {
                return false;
            }
            if (!blob) {
                return false;
            }
            const played = await playAudioBlob(blob, speechId);
            if (!played) {
                return false;
            }
        }
        return true;
    }

    async function speak(text, { firstPiperChunkPromise = null } = {}) {
        const normalized = (text || '').trim();
        if (!normalized) {
            return;
        }

        // Keep browser TTS alive after Send priming — cancel only on explicit Stop.
        stopAllSpeech({ cancelBrowserTts: false });
        const speechId = activeSpeechId;
        speechInProgress = true;
        updateAssistantControls();

        try {
            if (!shouldUsePiperTts()) {
                await speakWithBrowserVoice(normalized, speechId);
                return;
            }

            if (!getSelectedPiperVoiceId()) {
                selectFirstPiperVoiceForLanguage(getSelectedSpeechLanguage());
            }

            try {
                const spokeAll = await speakWithPiperVoice(normalized, speechId, {
                    firstChunkPromise: firstPiperChunkPromise,
                });
                if (!spokeAll && speechId === activeSpeechId) {
                    showPiperPlaybackToast(getSelectedSpeechLanguage());
                }
            } catch (_error) {
                if (speechId === activeSpeechId) {
                    showPiperPlaybackToast(getSelectedSpeechLanguage());
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
            showDailyLimitFeedback();
            return;
        }

        primeSpeechSynthesis();

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
                if (!activeConversationHasLimitNotice(limitMessage)) {
                    appendMessage('ai', limitMessage);
                    saveChatHistory();
                    await speak(limitMessage);
                } else {
                    updateUsageLimitUi();
                }
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
            let firstPiperChunkPromise = null;
            if (shouldUsePiperTts()) {
                const piperVoiceId = getSelectedPiperVoiceId()
                    || findAvailablePiperVoiceForLanguage(getSelectedSpeechLanguage())?.id;
                const piperChunks = splitTextForSpeech(responseText, 420);
                if (piperVoiceId && piperChunks.length) {
                    firstPiperChunkPromise = fetchPiperAudioBlob(piperChunks[0], piperVoiceId);
                }
            }
            appendMessage('ai', responseText);
            activeChatAbortController = null;
            await speak(responseText, { firstPiperChunkPromise });
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

    if (voiceSelect) {
        voiceSelect.addEventListener('change', async () => {
            syncVoiceSelectUi();
            syncChatLanguageUi(getSelectedSpeechLanguage(), { notify: true });
            const piperId = getSelectedPiperVoiceId();
            const targetLang = getSelectedSpeechLanguage();
            if (piperId || isPiperVoiceSelected() || isPiperLanguageAvailable(targetLang)) {
                if (piperId) {
                    warmupPiperVoice(piperId);
                }
                return;
            }
            if (isBrowserTargetVoiceSelected() && isDeviceMenuLanguage(targetLang)) {
                await fetchPiperStatus(true);
                if (findAvailablePiperVoiceForLanguage(targetLang)) {
                    if (selectFirstPiperVoiceForLanguage(targetLang)) {
                        const redirectedPiperId = getSelectedPiperVoiceId();
                        if (redirectedPiperId) {
                            warmupPiperVoice(redirectedPiperId);
                        }
                        return;
                    }
                }
                await ensureSpeechVoicesReady();
                if (!findBrowserVoiceForLanguage(targetLang)) {
                    showVoiceUnavailableToast(targetLang);
                }
            }
        });
    }

    if (voiceSelectTrigger) {
        voiceSelectTrigger.addEventListener('click', () => {
            openVoiceSelectListbox();
        });
        voiceSelectTrigger.addEventListener('keydown', (event) => {
            if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                openVoiceSelectListbox();
            }
        });
    }

    if (voiceSelectListbox) {
        voiceSelectListbox.addEventListener('keydown', (event) => {
            const items = Array.from(
                voiceSelectListbox.querySelectorAll('.voice-select-option:not(:disabled)')
            );
            if (!items.length) {
                return;
            }
            const currentIndex = items.indexOf(document.activeElement);
            if (event.key === 'Escape') {
                event.preventDefault();
                closeVoiceSelectListbox();
                return;
            }
            if (event.key === 'ArrowDown') {
                event.preventDefault();
                const next = currentIndex < 0 ? 0 : (currentIndex + 1) % items.length;
                items[next].focus();
                setVoiceListboxActiveOption(items[next]);
                return;
            }
            if (event.key === 'ArrowUp') {
                event.preventDefault();
                const next = currentIndex <= 0 ? items.length - 1 : currentIndex - 1;
                items[next].focus();
                setVoiceListboxActiveOption(items[next]);
                return;
            }
            if (event.key === 'Home') {
                event.preventDefault();
                items[0].focus();
                setVoiceListboxActiveOption(items[0]);
                return;
            }
            if (event.key === 'End') {
                event.preventDefault();
                items[items.length - 1].focus();
                setVoiceListboxActiveOption(items[items.length - 1]);
                return;
            }
            if (event.key === 'Enter' || event.key === ' ') {
                const focused = document.activeElement;
                if (focused instanceof HTMLElement && focused.classList.contains('voice-select-option')) {
                    event.preventDefault();
                    const index = Number(focused.dataset.voiceIndex);
                    if (!Number.isNaN(index)) {
                        selectVoiceIndex(index);
                    }
                }
            }
        });
    }

    sendButton.addEventListener('click', handleSendMessage);
    if (stopButton) {
        stopButton.addEventListener('click', stopAssistant);
    }
    function isDeleteDataDialogOpen() {
        return Boolean(deleteDataDialog && !deleteDataDialog.hidden);
    }

    function closeDeleteDataDialog({ returnFocus = true } = {}) {
        if (!deleteDataDialog) {
            return;
        }
        const trigger = deleteDataDialogTrigger;
        closeOverlay(deleteDataDialog, {
            onClosed: () => {
                if (returnFocus && trigger) {
                    trigger.focus();
                }
                deleteDataDialogTrigger = null;
            }
        });
    }

    function openDeleteDataDialog(triggerButton) {
        if (!deleteDataDialog || !authState.authenticated) {
            return;
        }
        closeAccountMenu({ returnFocus: false });
        closeAllConversationMenus();
        deleteDataDialogTrigger = triggerButton || deleteAllChatsButton;
        openOverlay(deleteDataDialog, {
            onOpen: () => {
                deleteDataCancelButton?.focus();
            }
        });
    }

    function confirmDeleteAllChatData() {
        if (!authState.authenticated) {
            return;
        }
        conversations.length = 0;
        activeConversationId = null;
        closeAllConversationMenus();
        renderConversationList();
        renderMessages();
        saveChatHistory();
        closeDeleteDataDialog({ returnFocus: true });
    }

    newChatButton.addEventListener('click', createConversationAndActivate);
    if (deleteAllChatsButton) {
        deleteAllChatsButton.addEventListener('click', () => {
            openDeleteDataDialog(deleteAllChatsButton);
        });
    }
    if (deleteDataConfirmButton) {
        deleteDataConfirmButton.addEventListener('click', () => {
            confirmDeleteAllChatData();
        });
    }
    if (deleteDataCancelButton) {
        deleteDataCancelButton.addEventListener('click', () => {
            closeDeleteDataDialog();
        });
    }
    if (deleteDataDialogBackdrop) {
        deleteDataDialogBackdrop.addEventListener('click', () => {
            closeDeleteDataDialog();
        });
    }
    if (accountMenuButton) {
        accountMenuButton.addEventListener('click', (event) => {
            event.stopPropagation();
            toggleAccountMenu();
        });
    }

    if (accountMenuPopover) {
        accountMenuPopover.addEventListener('click', (event) => {
            event.stopPropagation();
        });
    }

    if (logoutButton) {
        logoutButton.addEventListener('click', async () => {
            closeAccountMenu({ returnFocus: false });
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
        if (
            isAccountMenuOpen()
            && !event.target.closest('.account-pill-wrap')
        ) {
            closeAccountMenu();
        }
        if (
            isVoiceSelectOpen()
            && !event.target.closest('.voice-select-wrap')
        ) {
            closeVoiceSelectListbox({ returnFocus: false });
        }
    });
    document.addEventListener('keydown', (event) => {
        if (isDeleteDataDialogOpen() && event.key === 'Escape') {
            closeDeleteDataDialog();
            return;
        }
        if (isAccountMenuOpen() && event.key === 'Escape') {
            closeAccountMenu();
            return;
        }
        if (isVoiceSelectOpen() && event.key === 'Escape') {
            closeVoiceSelectListbox();
            event.preventDefault();
            return;
        }
        if (isConversationMenuOpen()) {
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
            populateVoiceList(force, { preserveSelection: voiceListInitialized });
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
            scheduleVoiceListPopulate(false);
            clearInterval(voiceRetryTimer);
            return;
        }
        scheduleVoiceListPopulate(false);
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
    document.documentElement.classList.remove('sidebar-init-expanded');

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
        window.setTimeout(async () => {
            if (!authState.authenticated || authState.user) {
                return;
            }
            try {
                await window.WakuConvex.refresh();
                applyConvexSnapshot(window.WakuConvex.getSnapshot());
            } catch (_error) {
                // ignore
            }
            if (!authState.user) {
                await refreshAuthState();
            }
        }, 10000);
    } else {
        await refreshAuthState();
    }
    await refreshUsageStatus();
    updateMessageWordHint();
    resizeTextInput();
    syncHistoryBackdrop();

    if (authState.authenticated) {
        ensureChatReadyAfterLogin();
    } else if (activeConversationId && !getActiveConversation()) {
        activeConversationId = null;
        renderConversationList();
        renderMessages();
    }

    if (document.readyState === 'complete') {
        document.body.classList.remove('preload');
    } else {
        window.addEventListener('load', () => {
            document.body.classList.remove('preload');
        });
    }

});
