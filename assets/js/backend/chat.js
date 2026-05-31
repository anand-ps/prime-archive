/*
File: /assets/js/backend/chat.js
Purpose: Manage the anonymous chat widget, local cache rendering, and Edge Function message sync flow.
*/

import { trackChatOpen, trackMessageSend } from './analytics.js';
import { sendBackendMessage, getBackendMessages } from './client.js';
import { BACKEND_BREAKPOINTS, CHAT_CONFIG, CHAT_DISPLAY, MESSAGE_TYPES, SENDER_TYPES, STORAGE_KEYS } from './config.js';
import { startMessageSync } from './realtime.js';
import { ensureSession, getSessionContext, syncSessionSnapshot, resetSession, initSession } from './session.js';
import { getCachedMessages, getClientName, mergeCachedMessages, setCachedMessages, setClientName, getProfiles, saveProfile, getClientId } from './storage.js';

const chatState = {
    isSubmitting: false,
    isPanelOpen: false,
    nextAllowedSubmitAt: 0,
    messages: getCachedMessages(),
    syncController: null,
    onboardingState: 'none',
    pendingMessage: '',
    lastAutoReplyAt: 0
};

// Section: Automated Reassurance Replies Configuration.
// Note: Hardcoded auto replies have been successfully migrated to the backend via Gemini 2.5 Flash!

// Section: Production-grade conditional logger.
const chatLogger = {
    log(...args) {
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.localStorage.getItem('chat_debug') === 'true') {
            console.log(...args);
        }
    },
    warn(...args) {
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.localStorage.getItem('chat_debug') === 'true') {
            console.warn(...args);
        }
    },
    error(...args) {
        console.error(...args);
    }
};

// Section: Auto-reply validation helpers.
function looksLikePhone(text) {
    const clean = String(text || '').replace(/[^\d+]/g, '');
    const digitCount = clean.replace(/\D/g, '').length;
    return digitCount >= 8 && digitCount <= 16;
}

function isMobileCaptured() {
    return chatState.messages.some(m => 
        m.senderType === 'system' && 
        (m.messageText.includes('Your contact has been noted') || m.messageText.includes('Done.'))
    );
}

// Section: Viewport behavior helpers.
function isDesktopChatViewport() {
    return window.matchMedia(`(min-width: ${BACKEND_BREAKPOINTS.CHAT_MOBILE + 1}px)`).matches;
}

function isMobileChatViewport() {
    return !isDesktopChatViewport();
}

function updateMobileViewportMetrics(elements) {
    if (!elements?.shell) {
        return;
    }

    if (isDesktopChatViewport()) {
        elements.shell.style.setProperty('--chat-mobile-viewport-height', '100dvh');
        elements.shell.style.setProperty('--chat-mobile-keyboard-offset', '0px');
        elements.shell.style.setProperty('--chat-mobile-offset-top', '0px');
        return;
    }

    const visualViewport = window.visualViewport;
    if (!visualViewport) {
        elements.shell.style.setProperty('--chat-mobile-viewport-height', '100dvh');
        elements.shell.style.setProperty('--chat-mobile-keyboard-offset', '0px');
        elements.shell.style.setProperty('--chat-mobile-offset-top', '0px');
        return;
    }

    const viewportHeight = Math.round(visualViewport.height);
    const offsetTop = Math.round(visualViewport.offsetTop);
    const keyboardOffset = Math.max(
        0,
        Math.round(window.innerHeight - visualViewport.height - visualViewport.offsetTop)
    );

    elements.shell.style.setProperty('--chat-mobile-viewport-height', `${viewportHeight}px`);
    elements.shell.style.setProperty('--chat-mobile-keyboard-offset', `${keyboardOffset}px`);
    elements.shell.style.setProperty('--chat-mobile-offset-top', `${offsetTop}px`);
}

function scrollComposerIntoView(elements) {
    if (!elements?.messageInput || !chatState.isPanelOpen || !isMobileChatViewport()) {
        return;
    }

    window.setTimeout(() => {
        updateMobileViewportMetrics(elements);
        elements.messageInput.scrollIntoView({
            block: 'nearest',
            inline: 'nearest'
        });
    }, 120);
}

// Section: Widget rendering.
function createChatWidgetMarkup() {
    const shell = document.createElement('section');
    shell.className = 'portfolio-chat-shell';
    shell.setAttribute('aria-label', 'Say Hello chat');

    shell.innerHTML = `
        <button
            class="portfolio-chat-toggle"
            type="button"
            aria-expanded="false"
            aria-controls="portfolio-chat-panel"
            aria-label="Open Live Chat"
        >
            <div class="portfolio-chat-toggle-content">
                <svg class="portfolio-chat-toggle-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                    <circle cx="9" cy="10" r="1" fill="currentColor"></circle>
                    <circle cx="12" cy="10" r="1" fill="currentColor"></circle>
                    <circle cx="15" cy="10" r="1" fill="currentColor"></circle>
                </svg>
                <span class="portfolio-chat-toggle-text">Let's Talk</span>
            </div>
        </button>

        <div
            id="portfolio-chat-panel"
            class="portfolio-chat-panel"
            role="dialog"
            aria-label="Send a message"
            aria-hidden="true"
        >
            <div class="portfolio-chat-panel-header">
                <button class="portfolio-chat-back" type="button" aria-label="Back">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
                </button>
                <div class="portfolio-chat-header-content">
                    <p class="portfolio-chat-kicker">
                        Live Chat
                        <span class="portfolio-chat-online-dot"></span>
                    </p>
                    <h2>Let's Talk</h2>
                </div>
                <button type="button" class="portfolio-chat-identity-display" data-chat-identity-display data-chat-edit-btn aria-label="Switch User">
                    <span class="portfolio-chat-identity-name" data-chat-identity></span>
                    <div class="portfolio-chat-avatar" data-chat-avatar></div>
                </button>
            </div>
            
            <div class="portfolio-chat-identity-row">
                <div class="portfolio-chat-name-field" data-chat-name-field>
                    <div class="portfolio-chat-profiles-list" data-chat-profiles-list></div>
                    <div class="portfolio-chat-new-user-row">
                        <input
                            class="portfolio-chat-input portfolio-chat-name-input"
                            type="text"
                            name="clientName"
                            maxlength="${CHAT_CONFIG.MAX_NAME_LENGTH}"
                            placeholder="Tell us your name"
                            autocomplete="name"
                        />
                        <button type="button" class="portfolio-chat-new-user-btn" data-chat-add-btn>Save</button>
                        <button type="button" class="portfolio-chat-cancel-btn" data-chat-cancel-btn>Cancel</button>
                    </div>
                </div>
            </div>

            <div class="portfolio-chat-thread" data-chat-thread></div>

            <form class="portfolio-chat-form" novalidate>
                <div class="portfolio-chat-input-row">
                    <textarea
                        class="portfolio-chat-textarea"
                        name="messageText"
                        maxlength="${CHAT_CONFIG.MAX_MESSAGE_LENGTH}"
                        placeholder="Message..."
                        rows="1"
                        required
                    ></textarea>
                    <button class="portfolio-chat-submit" type="submit" aria-label="Send">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                    </button>
                </div>
                <p class="portfolio-chat-privacy-notice">
                    <a href="/legal/" class="portfolio-chat-legal-link" target="_blank">Privacy Policy &bull; Terms of Service</a>
                </p>
            </form>
        </div>
    `;

    document.body.appendChild(shell);
    return shell;
}

function createChatElements(shell) {
    return {
        shell,
        toggle: shell.querySelector('.portfolio-chat-toggle'),
        panel: shell.querySelector('.portfolio-chat-panel'),
        closeButton: shell.querySelector('.portfolio-chat-close'),
        identityDisplay: shell.querySelector('[data-chat-identity-display]'),
        editNameBtn: shell.querySelector('[data-chat-edit-btn]'),
        identity: shell.querySelector('[data-chat-identity]'),
        avatar: shell.querySelector('[data-chat-avatar]'),
        cancelBtn: shell.querySelector('[data-chat-cancel-btn]'),
        thread: shell.querySelector('[data-chat-thread]'),
        form: shell.querySelector('.portfolio-chat-form'),
        nameField: shell.querySelector('[data-chat-name-field]'),
        nameInput: shell.querySelector('input[name="clientName"]'),
        addBtn: shell.querySelector('[data-chat-add-btn]'),
        profilesList: shell.querySelector('[data-chat-profiles-list]'),
        messageInput: shell.querySelector('textarea[name="messageText"]'),
        submitButton: shell.querySelector('.portfolio-chat-submit')
    };
}

function ensureChatWidget() {
    const existingShell = document.querySelector('.portfolio-chat-shell');
    const shell = existingShell || createChatWidgetMarkup();
    return createChatElements(shell);
}

// Section: UI helpers.
function setPanelOpen(elements, isOpen, skipHistory = false) {
    if (chatState.isPanelOpen === isOpen) return;

    chatState.isPanelOpen = isOpen;
    elements.shell.classList.toggle('is-open', isOpen);
    elements.shell.classList.toggle('is-desktop-open', isOpen && isDesktopChatViewport());
    elements.toggle.setAttribute('aria-expanded', String(isOpen));
    elements.panel.setAttribute('aria-hidden', String(!isOpen));
    
    const isMobileOpen = isOpen && !isDesktopChatViewport();
    document.documentElement.classList.toggle('chat-is-open-mobile', isMobileOpen);
    document.body.classList.toggle('chat-is-open-mobile', isMobileOpen);
    
    updateMobileViewportMetrics(elements);

    if (!skipHistory) {
        if (isOpen) {
            history.pushState({ chatOpen: true }, '', '');
        } else if (history.state?.chatOpen) {
            history.back();
        }
    }

    if (isOpen && elements.messageInput) {
        elements.messageInput.focus();
    }
}

function updateChatStatus(elements, message, tone = 'default') {
    if (tone === 'error') {
        chatLogger.error(`Live Chat: ${message}`);
    } else {
        chatLogger.log(`Live Chat: ${message}`);
    }
}

function setFormBusy(elements, isBusy) {
    if (elements.submitButton) {
        elements.submitButton.disabled = isBusy;
    }
    // We intentionally avoid disabling text inputs (like messageInput) 
    // because doing so forces mobile browsers to instantly hide the keyboard.
}

async function switchChatProfile(profileId, elements) {
    const profiles = getProfiles();
    const target = profiles.find(p => p.id === profileId);
    if (!target) return;
    
    chatLogger.log(`[Live Chat] Switching profile to ID: "${target.id}" (Name: "${target.name}")`);
    resetSession();
    window.localStorage.setItem(STORAGE_KEYS.CLIENT_ID, target.id);
    window.localStorage.setItem(STORAGE_KEYS.CLIENT_NAME, target.name);
    
    chatState.messages = [];
    renderMessages(elements);
    renderIdentity(elements);
    
    await initSession();
    await chatState.syncController?.syncNow();
}

async function createChatProfile(name, elements, keepMessages = false) {
    chatLogger.log(`[Live Chat] Creating new profile with name: "${name}"`);
    resetSession();
    const newId = (window.crypto && window.crypto.randomUUID) 
        ? window.crypto.randomUUID() 
        : 'client_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9); 
    window.localStorage.setItem(STORAGE_KEYS.CLIENT_ID, newId);
    setClientName(name);
    saveProfile(newId, name);
    
    if (!keepMessages) {
        chatState.messages = [];
        renderMessages(elements);
    }
    renderIdentity(elements);
    
    await initSession();
    if (!keepMessages) {
        await chatState.syncController?.syncNow();
    }
}

function renderIdentity(elements) {
    try {
        const clientName = getClientName();
        const clientId = getClientId();
        chatLogger.log(`[Live Chat] Identity loaded. Name: "${clientName || 'Anonymous'}" | ID: "${clientId || 'None'}"`);

        if (clientName) {
            elements.identity.textContent = clientName;
            if (elements.avatar) {
                const initial = clientName.trim().charAt(0).toUpperCase();
                elements.avatar.textContent = initial;
            }
            elements.identityDisplay.style.display = 'flex';
            elements.nameField.style.display = 'none';
            elements.nameInput.value = '';
        } else {
            elements.identity.textContent = '';
            if (elements.avatar) {
                elements.avatar.textContent = '';
            }
            elements.identityDisplay.style.display = 'none';
            elements.nameField.style.display = 'none';
        }
        
        const profiles = getProfiles();
        elements.profilesList.replaceChildren();
        
        if (profiles.length > 0) {
            profiles.forEach(p => {
                if (p.id === clientId) return;
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'portfolio-chat-profile-btn';
                btn.textContent = `Switch to ${p.name}`;
                btn.onclick = () => switchChatProfile(p.id, elements);
                elements.profilesList.appendChild(btn);
            });
        }
    } catch (err) {
        chatLogger.error("renderIdentity error:", err);
    }
}

function formatChatTime(isoString) {
    if (!isoString) return '';
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return '';
    let hours = date.getHours();
    let minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    minutes = minutes < 10 ? '0' + minutes : minutes;
    return `${hours}:${minutes} ${ampm}`;
}

function formatChatDate(isoString) {
    if (!isoString) return '';
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return '';
    
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    if (date.toDateString() === today.toDateString()) {
        return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
        return 'Yesterday';
    } else {
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
}

function createMessageBubble(message, hideLabel = false) {
    const article = document.createElement('article');
    const isClientMessage = message.senderType === SENDER_TYPES.CLIENT;
    const isSystemMessage = message.senderType === SENDER_TYPES.SYSTEM;

    let bubbleClass = 'portfolio-chat-bubble-admin';
    if (isClientMessage) {
        bubbleClass = 'portfolio-chat-bubble-visitor';
    } else if (isSystemMessage) {
        bubbleClass = 'portfolio-chat-bubble-system';
    }

    article.className = `portfolio-chat-bubble ${bubbleClass}`;
    if (message.id) article.dataset.messageId = message.id;

    if (!hideLabel) {
        const label = document.createElement('p');
        label.className = 'portfolio-chat-bubble-label';
        if (isClientMessage) {
            label.textContent = 'You';
        } else if (isSystemMessage) {
            label.textContent = 'System';
        } else {
            label.textContent = CHAT_DISPLAY.ADMIN_NAME;
        }
        article.appendChild(label);
    }

    const text = document.createElement('p');
    text.className = 'portfolio-chat-bubble-text';
    text.textContent = message.messageText;

    article.appendChild(text);
    
    if (message.createdAt) {
        const time = document.createElement('time');
        time.className = 'portfolio-chat-bubble-time';
        time.textContent = formatChatTime(message.createdAt);
        time.dateTime = message.createdAt;
        article.appendChild(time);
    }

    return article;
}

const CHAT_SUGGESTIONS = [
    "Are you available for freelance work?",
    "What technologies do you specialize in?",
    "I have a project idea for you.",
    "Just stopping by to say hi! 👋",
    "Can we schedule a quick call?",
    "Loved your recent projects!",
    "Are you open to full-time roles?"
];

function getDynamicGreeting() {
    const hours = new Date().getHours();
    const name = getClientName();
    const namePart = name ? `, ${name}` : '';
    if (hours < 12) return `Good morning${namePart}! 👋`;
    if (hours < 17) return `Good afternoon${namePart}! ☀️`;
    return `Good evening${namePart}! 🌙`;
}

function getRandomSuggestions(count) {
    const shuffled = [...CHAT_SUGGESTIONS].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
}

function hasTemporaryMessageId(value) {
    return String(value || '').startsWith('temp_msg_');
}

function shouldRebuildThread(elements) {
    const renderedBubbles = Array.from(elements.thread.querySelectorAll('[data-message-id]'));

    if (!renderedBubbles.length) {
        return false;
    }

    const renderedIds = new Set(renderedBubbles.map((node) => String(node.dataset.messageId || '')));
    const desiredIds = new Set(chatState.messages.map((message) => String(message.id || '')));

    for (const renderedId of renderedIds) {
        if (!desiredIds.has(renderedId)) {
            return true;
        }
    }

    return false;
}

function renderMessages(elements) {
    if (!chatState.messages.length) {
        if (!elements.thread.querySelector('.portfolio-chat-empty-state')) {
            elements.thread.replaceChildren();
            
            const container = document.createElement('div');
            container.className = 'portfolio-chat-empty-state';
            
            const greeting = document.createElement('h3');
            greeting.className = 'portfolio-chat-empty-greeting';
            greeting.textContent = getDynamicGreeting();
            
            const chipContainer = document.createElement('div');
            chipContainer.className = 'portfolio-chat-empty-chips';
            
            getRandomSuggestions(3).forEach(suggestion => {
                const chip = document.createElement('button');
                chip.type = 'button';
                chip.className = 'portfolio-chat-chip';
                chip.textContent = suggestion;
                chip.addEventListener('click', () => {
                    elements.messageInput.value = suggestion;
                    if (typeof elements.form.requestSubmit === 'function') {
                        elements.form.requestSubmit();
                    } else {
                        elements.submitButton.click();
                    }
                });
                chipContainer.appendChild(chip);
            });
            
            container.append(greeting, chipContainer);
            elements.thread.appendChild(container);
        }
        return;
    }

    const empty = elements.thread.querySelector('.portfolio-chat-empty-state');
    if (empty) empty.remove();

    // Perform in-place DOM ID reconciliation for optimistic/temporary messages
    // to prevent visual layout thrashing ("jerks") when swapping temporary IDs for DB IDs.
    const renderedBubbles = Array.from(elements.thread.querySelectorAll('[data-message-id]'));
    if (renderedBubbles.length > 0) {
        chatState.messages.forEach(message => {
            if (!message.id) return;
            
            const match = renderedBubbles.find(node => {
                const textNode = node.querySelector('.portfolio-chat-bubble-text');
                const text = textNode ? textNode.textContent.trim() : '';
                const isClientNode = node.classList.contains('portfolio-chat-bubble-visitor');
                const isClientMsg = message.senderType === SENDER_TYPES.CLIENT;
                return text === String(message.messageText || '').trim() && isClientNode === isClientMsg;
            });
            
            if (match && match.dataset.messageId !== String(message.id)) {
                match.dataset.messageId = String(message.id);
            }
        });
    }

    const rebuildThread = shouldRebuildThread(elements);
    
    const isNearBottom = elements.thread.scrollHeight - elements.thread.scrollTop - elements.thread.clientHeight < 50;

    if (rebuildThread) {
        elements.thread.replaceChildren();
    }

    let appended = false;
    chatState.messages.forEach((message, index) => {
        if (!message.id) return;

        const previousMessage = index > 0 ? chatState.messages[index - 1] : null;
        const currentDateString = formatChatDate(message.createdAt);
        const previousDateString = previousMessage ? formatChatDate(previousMessage.createdAt) : null;

        if (currentDateString !== previousDateString && currentDateString) {
            const existingDivider = elements.thread.querySelector(`[data-date-divider="${currentDateString}"]`);
            if (!existingDivider) {
                const divider = document.createElement('div');
                divider.className = 'portfolio-chat-date-divider';
                divider.dataset.dateDivider = currentDateString;
                divider.textContent = currentDateString;
                elements.thread.appendChild(divider);
            }
        }

        const isConsecutive = previousMessage && previousMessage.senderType === message.senderType && (currentDateString === previousDateString);
        const existingBubble = elements.thread.querySelector(`[data-message-id="${message.id}"]`);
        if (!existingBubble) {
            elements.thread.appendChild(createMessageBubble(message, isConsecutive));
            appended = true;
        }
    });

    if (appended || (rebuildThread && (isNearBottom || elements.thread.scrollHeight === 0))) {
        elements.thread.scrollTop = elements.thread.scrollHeight;
    }
}

// Section: Data helpers.
function normalizeMessage(message) {
    return {
        id: message?.id,
        senderType: message?.senderType || message?.sender_type || '',
        messageText: message?.messageText || message?.message_text || '',
        createdAt: message?.createdAt || message?.created_at || ''
    };
}

function applyMessages(elements, messages) {
    chatState.messages = mergeCachedMessages(chatState.messages, messages.map(normalizeMessage));
    renderMessages(elements);
}

function sanitizeName(rawName) {
    return String(rawName || '').trim().slice(0, CHAT_CONFIG.MAX_NAME_LENGTH);
}

function sanitizeMessage(rawMessage) {
    return String(rawMessage || '').trim().slice(0, CHAT_CONFIG.MAX_MESSAGE_LENGTH);
}

async function fetchLatestMessages() {
    await ensureSession();
    const context = getSessionContext();

    if (!context.clientId || !context.conversationId) {
        return chatState.messages;
    }

    const response = await getBackendMessages({
        clientId: context.clientId,
        sessionId: context.sessionId,
        conversationId: context.conversationId
    });

    syncSessionSnapshot(response);

    const messages = Array.isArray(response?.messages) ? response.messages.map(normalizeMessage) : [];
    chatState.messages = mergeCachedMessages(chatState.messages, messages);
    return chatState.messages;
}

// Section: Event wiring.
function attachPanelEvents(elements) {
    elements.toggle.addEventListener('click', async () => {
        const nextOpenState = !chatState.isPanelOpen;
        setPanelOpen(elements, nextOpenState);

        if (nextOpenState) {
            await trackChatOpen();
            await chatState.syncController?.syncNow();
        }
    });

    if (elements.closeButton) {
        elements.closeButton.addEventListener('click', () => {
            setPanelOpen(elements, false);
        });
    }

    document.addEventListener('pointerdown', (event) => {
        if (!chatState.isPanelOpen) {
            return;
        }

        if (elements.shell.contains(event.target)) {
            return;
        }

        setPanelOpen(elements, false);
    });

    window.addEventListener('popstate', (event) => {
        if (chatState.isPanelOpen && !event.state?.chatOpen) {
            setPanelOpen(elements, false, true);
        }
    });

    elements.editNameBtn.addEventListener('click', () => {
        elements.identityDisplay.style.display = 'none';
        elements.nameField.style.display = 'block';
        elements.nameInput.focus();
    });

    if (elements.cancelBtn) {
        elements.cancelBtn.addEventListener('click', () => {
            elements.nameField.style.display = 'none';
            elements.identityDisplay.style.display = 'flex';
            elements.nameInput.value = '';
        });
    }

    elements.addBtn.addEventListener('click', () => {
        const newName = sanitizeName(elements.nameInput.value);
        if (newName) {
            createChatProfile(newName, elements);
        }
    });

    elements.nameInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            elements.addBtn.click();
        } else if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            if (elements.cancelBtn) {
                elements.cancelBtn.click();
            }
        }
    });

    let scrollTimeout;
    elements.thread.addEventListener('scroll', () => {
        elements.thread.classList.add('is-scrolling');
        window.clearTimeout(scrollTimeout);
        scrollTimeout = window.setTimeout(() => {
            elements.thread.classList.remove('is-scrolling');
        }, 1000);
    });

    elements.messageInput.addEventListener('input', () => {
        elements.messageInput.style.height = 'auto';
        elements.messageInput.style.height = Math.min(elements.messageInput.scrollHeight, 120) + 'px';
        updateMobileViewportMetrics(elements);
    });


    const backBtn = elements.panel.querySelector('.portfolio-chat-back');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            setPanelOpen(elements, false);
        });
    }

    elements.messageInput.addEventListener('focus', () => {
        scrollComposerIntoView(elements);
    });

    elements.messageInput.addEventListener('click', () => {
        scrollComposerIntoView(elements);
    });

    elements.messageInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            if (typeof elements.form.requestSubmit === 'function') {
                elements.form.requestSubmit();
            } else {
                // Fallback for extremely old browsers, though requestSubmit is widely supported now
                elements.submitButton.click();
            }
        }
    });

    elements.submitButton.addEventListener('pointerdown', (event) => {
        event.preventDefault(); // Prevent focus shift to keep the mobile keyboard open
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            setPanelOpen(elements, false);
        }
    });

    window.addEventListener('resize', () => {
        elements.shell.classList.toggle('is-desktop-open', chatState.isPanelOpen && isDesktopChatViewport());
        updateMobileViewportMetrics(elements);
    });

    // Shrink chat toggle capsule to just the icon on scroll.
    // On desktop: shrink after the first viewport is moved up.
    // On mobile: shrink almost immediately (e.g. 50px scroll).
    const handleScroll = () => {
        const isMobile = window.innerWidth <= 720;
        const threshold = isMobile ? 50 : (window.innerHeight || 800);
        if (window.scrollY > threshold) {
            elements.toggle.classList.add('is-shrunk');
        } else {
            elements.toggle.classList.remove('is-shrunk');
        }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll(); // Run immediately to capture initial page scroll state

    if (window.visualViewport) {
        const handleViewportChange = () => {
            updateMobileViewportMetrics(elements);
            if (chatState.isPanelOpen && isMobileChatViewport()) {
                elements.thread.scrollTop = elements.thread.scrollHeight;
            }
        };

        window.visualViewport.addEventListener('resize', handleViewportChange);
        window.visualViewport.addEventListener('scroll', handleViewportChange);
    }
}

async function executeMessageSend(messageText, clientName, elements, options = {}) {
    chatLogger.log(`[Live Chat] Sending message. Length: ${messageText.length} characters. Sender: "${clientName || 'Anonymous'}"`);
    try {
        chatState.isSubmitting = true;
        setFormBusy(elements, true);
        updateChatStatus(elements, 'Sending your message...', 'default');

        const storedClientName = setClientName(clientName);
        renderIdentity(elements);

        await ensureSession();
        const context = getSessionContext();
        const response = await sendBackendMessage({
            clientId: context.clientId,
            sessionId: context.sessionId,
            conversationId: context.conversationId,
            senderType: SENDER_TYPES.CLIENT,
            messageType: MESSAGE_TYPES.TEXT,
            messageText,
            clientName: storedClientName,
            persistOnboardingFlow: options.persistOnboardingFlow === true,
            automatedMessages: options.automatedMessages
        });

        syncSessionSnapshot(response);

        // Section: Sync backend-validated client name with local storage and identity headers
        if (response?.clientName) {
            setClientName(response.clientName);
            saveProfile(context.clientId, response.clientName);
            renderIdentity(elements);
        }

        const conversationMessages = Array.isArray(response?.messages)
            ? response.messages.map(normalizeMessage)
            : [];
        const sentMessage = normalizeMessage(response?.message || {});
        
        if (sentMessage.id) {
            const exists = conversationMessages.some(m => String(m.id) === String(sentMessage.id));
            if (!exists) {
                conversationMessages.push(sentMessage);
            }
        }
        
        if (conversationMessages.length && !options.silentRender) {
            chatState.messages = setCachedMessages(conversationMessages);
        } else if (options.tempMessageId) {
            const tempMsg = chatState.messages.find(m => m.id === options.tempMessageId);
            if (tempMsg) {
                tempMsg.id = sentMessage.id;
                const domNode = elements.thread.querySelector(`[data-message-id="${options.tempMessageId}"]`);
                if (domNode) {
                    domNode.dataset.messageId = sentMessage.id;
                }
            } else if (!options.silentRender) {
                chatState.messages.push(sentMessage);
            }
        } else if (!options.silentRender) {
            chatState.messages = mergeCachedMessages(chatState.messages, [sentMessage]);
        }
        
        if (!options.silentRender) {
            renderMessages(elements);
        }

        elements.form.reset();
        elements.messageInput.style.height = 'auto';
        elements.nameInput.value = storedClientName;
        chatLogger.log(`[Live Chat] Message sent successfully. Database Message ID: ${sentMessage.id}`);
        updateChatStatus(elements, 'Message sent. Syncing replies...', 'success');
        chatState.nextAllowedSubmitAt = Date.now() + CHAT_CONFIG.SEND_COOLDOWN_MS;

        await trackMessageSend(messageText);
        if (!options.skipSync) {
            await chatState.syncController?.syncNow();
        }
        return response;
    } catch (error) {
        chatLogger.error('Unable to send chat message.', error);
        
        // Remove the temporary message bubble that failed
        if (options.tempMessageId) {
            chatState.messages = chatState.messages.filter(m => m.id !== options.tempMessageId);
        }
        
        // Add a visual system error warning inside the chat thread
        chatState.messages.push({
            id: 'error_msg_' + Date.now(),
            senderType: SENDER_TYPES.SYSTEM,
            messageText: `⚠️ ${error.message || 'Unable to send your message right now.'}`,
            createdAt: new Date().toISOString()
        });
        renderMessages(elements);
        
        // Restore the message text back to the input box so the user doesn't lose it
        if (elements.messageInput) {
            elements.messageInput.value = messageText;
            elements.messageInput.focus();
        }

        updateChatStatus(elements, error.message || 'Unable to send your message right now.', 'error');
        return null;
    } finally {
        chatState.isSubmitting = false;
        
        const cooldownRemaining = Math.max(0, chatState.nextAllowedSubmitAt - Date.now());
        if (cooldownRemaining > 0) {
            setTimeout(() => {
                setFormBusy(elements, false);
            }, cooldownRemaining);
        } else {
            setFormBusy(elements, false);
        }
    }
}



const ONBOARDING_TEMPLATES = {
    COLLECT_NAME_PROMPT: {
        text: "Thanks for reaching out! 😊\nBefore I forward this to Anand,\nmay I get your name?",
        delayMs: 1500
    },
    getConfirmation: (name) => `Hi ${name} 👋\nYour message has been shared with Anand. He'll reply here soon.`,
    CONFIRMATION_DELAY_MS: 1000,
    
    CALLBACK_PROMPT: {
        text: "Prefer a callback over chat?\nDrop your contact below.",
        delayMs: 5000
    }
};

function attachSubmitHandler(elements) {
    elements.form.addEventListener('submit', async (event) => {
        event.preventDefault();

        const now = Date.now();
        if (chatState.isSubmitting || now < chatState.nextAllowedSubmitAt) {
            return;
        }

        const messageText = sanitizeMessage(elements.messageInput.value);
        if (!messageText) return;

        const existingClientName = getClientName();

        if (!existingClientName) {
            if (chatState.onboardingState === 'none') {
                chatState.onboardingState = 'awaiting_name';
                chatState.pendingMessage = messageText;
                
                elements.messageInput.value = '';
                elements.messageInput.style.height = 'auto';
                
                chatState.messages.push({
                    id: 'temp_msg_1',
                    senderType: SENDER_TYPES.CLIENT,
                    messageText: messageText,
                    createdAt: new Date().toISOString()
                });
                renderMessages(elements);
                
                setTimeout(() => {
                    chatState.messages.push({
                        id: 'temp_msg_2',
                        senderType: SENDER_TYPES.SYSTEM,
                        messageText: ONBOARDING_TEMPLATES.COLLECT_NAME_PROMPT.text,
                        createdAt: new Date().toISOString()
                    });
                    renderMessages(elements);
                    elements.messageInput.placeholder = "Type your name...";
                    elements.messageInput.focus();
                }, ONBOARDING_TEMPLATES.COLLECT_NAME_PROMPT.delayMs);
                
                return;
            } else if (chatState.onboardingState === 'awaiting_name') {
                chatState.onboardingState = 'none';
                const extractedName = sanitizeName(messageText);
                
                if (!extractedName) return;
                
                elements.messageInput.value = '';
                elements.messageInput.style.height = 'auto';
                elements.messageInput.placeholder = "Message...";
                
                // 1. Show the client's name reply instantly
                chatState.messages.push({
                    id: 'temp_msg_3',
                    senderType: SENDER_TYPES.CLIENT,
                    messageText: extractedName,
                    createdAt: new Date().toISOString()
                });
                renderMessages(elements);
                
                // 2. Execute profile creation and backend database sync completely asynchronously in the background
                const originalMessage = chatState.pendingMessage;
                chatState.pendingMessage = '';
                
                (async () => {
                    try {
                        await createChatProfile(extractedName, elements, true);
                        await executeMessageSend(originalMessage, extractedName, elements, {
                            tempMessageId: 'temp_msg_1',
                            silentRender: true,
                            persistOnboardingFlow: true,
                            skipSync: true, // We skip the immediate sync to allow delayed messages to play out naturally
                            automatedMessages: [
                                {
                                    senderType: 'admin',
                                    messageText: ONBOARDING_TEMPLATES.COLLECT_NAME_PROMPT.text,
                                    metadata: {
                                        displayVariant: 'system',
                                        automationKey: 'collect_name_prompt'
                                    }
                                },
                                {
                                    senderType: 'client',
                                    messageText: extractedName,
                                    metadata: {
                                        automationKey: 'collected_name_reply',
                                        captureType: 'client_name'
                                    }
                                },
                                {
                                    senderType: 'admin',
                                    messageText: ONBOARDING_TEMPLATES.getConfirmation(extractedName),
                                    metadata: {
                                        displayVariant: 'system',
                                        automationKey: 'message_forwarded_confirmation'
                                    }
                                },
                                {
                                    senderType: 'admin',
                                    messageText: ONBOARDING_TEMPLATES.CALLBACK_PROMPT.text,
                                    metadata: {
                                        displayVariant: 'system',
                                        automationKey: 'callback_prompt'
                                    }
                                }
                            ]
                        });
                    } catch (err) {
                        chatLogger.error("Background message dispatch failed:", err);
                    }
                })();
                
                // 3. Play the first bot reply (Confirmation) after configured delay (e.g. 1s)
                setTimeout(() => {
                    const confirmText = ONBOARDING_TEMPLATES.getConfirmation(extractedName);
                    const confirmExists = chatState.messages.some(m => m.messageText === confirmText);
                    
                    if (!confirmExists) {
                        chatState.messages.push({
                            id: 'temp_msg_4',
                            senderType: SENDER_TYPES.SYSTEM,
                            messageText: confirmText,
                            createdAt: new Date().toISOString()
                        });
                        renderMessages(elements);
                    }
                    
                    // 4. Play the second bot reply (Callback prompt) after second configured delay (e.g. 1.5s)
                    setTimeout(() => {
                        const callbackText = ONBOARDING_TEMPLATES.CALLBACK_PROMPT.text;
                        const callbackExists = chatState.messages.some(m => m.messageText === callbackText);
                        
                        if (!callbackExists) {
                            chatState.messages.push({
                                id: 'temp_msg_5',
                                senderType: SENDER_TYPES.SYSTEM,
                                messageText: callbackText,
                                createdAt: new Date().toISOString()
                            });
                            renderMessages(elements);
                        }
                        
                        // 5. Cleanly sync up with the database to swap out temporary IDs for real ones
                        chatState.syncController?.syncNow().catch(err => {
                            chatLogger.error("Post-delay database sync failed:", err);
                        });
                    }, ONBOARDING_TEMPLATES.CALLBACK_PROMPT.delayMs);
                    
                }, ONBOARDING_TEMPLATES.CONFIRMATION_DELAY_MS);
                
                return;
            }
        } else {
            // Named user sending a message!
            const nextClientName = existingClientName;
            
            // Check if this is the first message in the current conversation
            // (We check client messages to see if they are empty in local memory)
            const clientMessages = chatState.messages.filter(m => m.senderType === SENDER_TYPES.CLIENT);
            const isFirstMessage = clientMessages.length === 0;
            
            if (isFirstMessage) {
                // Show the client's message instantly
                chatState.messages.push({
                    id: 'temp_msg_1',
                    senderType: SENDER_TYPES.CLIENT,
                    messageText: messageText,
                    createdAt: new Date().toISOString()
                });
                renderMessages(elements);
                
                elements.messageInput.value = '';
                elements.messageInput.style.height = 'auto';
                
                // 1. Dispatch message send to backend asynchronously in the background
                (async () => {
                    try {
                        await executeMessageSend(messageText, nextClientName, elements, {
                            tempMessageId: 'temp_msg_1',
                            silentRender: true,
                            persistOnboardingFlow: false,
                            skipSync: true, // Let the delayed bot replies play out smoothly first
                            automatedMessages: [
                                {
                                    senderType: 'admin',
                                    messageText: ONBOARDING_TEMPLATES.getConfirmation(nextClientName),
                                    metadata: {
                                        displayVariant: 'system',
                                        automationKey: 'message_forwarded_confirmation'
                                    }
                                },
                                {
                                    senderType: 'admin',
                                    messageText: ONBOARDING_TEMPLATES.CALLBACK_PROMPT.text,
                                    metadata: {
                                        displayVariant: 'system',
                                        automationKey: 'callback_prompt'
                                    }
                                }
                            ]
                        });
                    } catch (err) {
                        chatLogger.error("Background message dispatch failed:", err);
                    }
                })();
                
                // 2. Play the automated bot confirmation and callback prompt trickling delays
                setTimeout(() => {
                    const confirmText = ONBOARDING_TEMPLATES.getConfirmation(nextClientName);
                    const confirmExists = chatState.messages.some(m => m.messageText === confirmText);
                    
                    if (!confirmExists) {
                        chatState.messages.push({
                            id: 'temp_msg_4',
                            senderType: SENDER_TYPES.SYSTEM,
                            messageText: confirmText,
                            createdAt: new Date().toISOString()
                        });
                        renderMessages(elements);
                    }
                    
                    setTimeout(() => {
                        const callbackText = ONBOARDING_TEMPLATES.CALLBACK_PROMPT.text;
                        const callbackExists = chatState.messages.some(m => m.messageText === callbackText);
                        
                        if (!callbackExists) {
                            chatState.messages.push({
                                id: 'temp_msg_5',
                                senderType: SENDER_TYPES.SYSTEM,
                                messageText: callbackText,
                                createdAt: new Date().toISOString()
                            });
                            renderMessages(elements);
                        }
                        
                        chatState.syncController?.syncNow().catch(err => {
                            chatLogger.error("Post-delay database sync failed:", err);
                        });
                    }, ONBOARDING_TEMPLATES.CALLBACK_PROMPT.delayMs);
                    
                }, ONBOARDING_TEMPLATES.CONFIRMATION_DELAY_MS);
                
                return;
            } else {
                // Subsequent messages: check phone capture and apply auto-reply with 10s cooldown
                const isPhoneMessage = looksLikePhone(messageText) && !isMobileCaptured();
                
                if (isPhoneMessage) {
                    // Letting server process the phone number and auto-respond with official contact confirmation
                    const tempId = 'temp_msg_' + Date.now();
                    chatState.messages.push({
                        id: tempId,
                        senderType: SENDER_TYPES.CLIENT,
                        messageText: messageText,
                        createdAt: new Date().toISOString()
                    });
                    renderMessages(elements);
                    
                    elements.messageInput.value = '';
                    elements.messageInput.style.height = 'auto';

                    await executeMessageSend(messageText, nextClientName, elements, {
                        tempMessageId: tempId,
                        persistOnboardingFlow: false
                    });
                } else {
                    // Regular message: route directly to the backend for real-time Gemini generation
                    const tempId = 'temp_msg_' + Date.now();
                    chatState.messages.push({
                        id: tempId,
                        senderType: SENDER_TYPES.CLIENT,
                        messageText: messageText,
                        createdAt: new Date().toISOString()
                    });
                    renderMessages(elements);

                    elements.messageInput.value = '';
                    elements.messageInput.style.height = 'auto';

                    await executeMessageSend(messageText, nextClientName, elements, {
                        tempMessageId: tempId,
                        persistOnboardingFlow: false
                    });
                }
            }
        }
    });
}

// Section: Public initializer.
export async function initChatWidget() {
    chatLogger.log("[Live Chat] Initializing widget...");
    const elements = ensureChatWidget();

    updateMobileViewportMetrics(elements);
    renderIdentity(elements);
    chatState.messages = setCachedMessages(chatState.messages);
    renderMessages(elements);

    // Show tooltip after a brief delay if they haven't opened chat yet
    setTimeout(() => {
        const tooltip = elements.shell.querySelector('.portfolio-chat-tooltip');
        if (tooltip && !chatState.isPanelOpen) {
            tooltip.classList.add('is-visible');
            
            // Hide it again after 10 seconds to not be permanently distracting
            setTimeout(() => {
                tooltip.classList.remove('is-visible');
            }, 10000);
        }
    }, 3500);

    attachPanelEvents(elements);
    attachSubmitHandler(elements);

    chatState.syncController = startMessageSync({
        fetchMessages: fetchLatestMessages,
        onMessages(messages) {
            chatState.messages = setCachedMessages(messages);
            renderMessages(elements);
            updateChatStatus(elements, 'Connected to the latest conversation state.', 'success');
        },
        onError(error) {
            chatLogger.error('Unable to sync chat messages.', error);
            updateChatStatus(elements, 'Unable to sync the latest messages right now.', 'error');
        },
        isPanelOpen() {
            return chatState.isPanelOpen;
        }
    });


    const contactLinks = document.querySelectorAll('.open-chat-btn');
    contactLinks.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            if (!chatState.isPanelOpen) {
                elements.toggle.click();
            }
        });
    });

    // Deep-linking: Automatically open the chat widget if the URL hash is #chat
    const checkHashAndOpen = (isInitialLoad = false) => {
        if (window.location.hash === '#chat') {
            // Enforce a premium 1.2-second minimum loading display duration
            const elapsed = Date.now() - (window.__chat_launcher_start || Date.now());
            const minDuration = 2000; // 2 seconds minimum display window
            const remaining = Math.max(0, minDuration - elapsed);

            const performOpen = () => {
                // 1. Instantly open the chat panel in the background behind the loader
                if (!chatState.isPanelOpen) {
                    if (isInitialLoad) {
                        elements.shell.classList.add('no-transitions');
                        setPanelOpen(elements, true);
                        elements.shell.offsetHeight; // Force DOM reflow
                        elements.shell.classList.remove('no-transitions');
                    } else {
                        setPanelOpen(elements, true);
                    }
                }

                // 2. Clear absolute fallback timeout
                if (window.__chat_fallback_timeout) {
                    clearTimeout(window.__chat_fallback_timeout);
                }

                // 3. Clean up style rules to render the landing page underneath
                const styleNode = document.getElementById('chat-launcher-styles');
                if (styleNode) styleNode.remove();
                document.documentElement.style.visibility = '';

                // 4. Smoothly fade out the launcher loader screen
                const screenNode = document.getElementById('chat-launcher-screen');
                if (screenNode) {
                    screenNode.classList.add('fade-out');
                    // Fully delete the loader element from the DOM after its transition completes (300ms)
                    setTimeout(() => {
                        screenNode.remove();
                    }, 300);
                }
            };

            if (isInitialLoad && remaining > 0) {
                setTimeout(performOpen, remaining);
            } else {
                performOpen();
            }
        }
    };

    // Run instantly on load to capture the hidden document state and open the panel immediately
    checkHashAndOpen(true);

    // Dynamic layout settle backup to cleanly restore elements in case of unexpected delays
    setTimeout(() => {
        const styleNode = document.getElementById('chat-launcher-styles');
        if (styleNode) styleNode.remove();
        const screenNode = document.getElementById('chat-launcher-screen');
        if (screenNode) screenNode.remove();
        document.documentElement.style.visibility = '';
    }, 4000);

    // Listen for dynamic hash changes while the user is actively on the page
    window.addEventListener('hashchange', () => checkHashAndOpen(false));
}
