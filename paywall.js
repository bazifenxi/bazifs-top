/**
 * 八字工具付费墙系统
 * 功能：付费遮罩、分享解锁、微信支付、激活码验证
 * 付费解锁后全文开放
 */
(function() {
    'use strict';

    const PREMIUM_CARDS = [
        'familyCard', 'healthCard', 'ganzhiRelationsCard', 'yunweiCard',
        'dayunCard', 'liunianCard', 'liuyueCard', 'plainLanguageCard',
        'combinationCard', 'gejuCard', 'careerCard'
    ];

    const API_BASE_URL = 'https://bazi.zhongyi-note.top/bazi-api/pay';
    const STORAGE_KEY = 'bazi_premium_activated';
    const ACTIVATION_METHOD_KEY = 'bazi_activation_method';
    const ACTIVATION_CODE_KEY = 'bazi_activation_code';
    const SHARE_COUNT_SESSION_KEY = 'bazi_share_count';

    let isPremiumActivated = false;
    let activationMethod = '';
    let shareCount = 0;
    let activationCode = '';
    let currentLockedCardId = null;
    let currentShareToken = '';
    let sharePollTimer = null;
    let mutationObserver = null;
    const savedCardContent = new Map();

    function initPaywall() {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('reset') === '1') {
            localStorage.removeItem(STORAGE_KEY);
            localStorage.removeItem(ACTIVATION_METHOD_KEY);
            localStorage.removeItem(ACTIVATION_CODE_KEY);
            window.history.replaceState({}, document.title, window.location.pathname);
        }
        loadActivationStatus();
        checkShareVisit();
        observeDynamicCards();
        setupAnalysisCompleteListener();
    }

    function checkShareVisit() {
        const urlParams = new URLSearchParams(window.location.search);
        const shareToken = urlParams.get('share');
        if (shareToken && shareToken.startsWith('SH')) {
            fetch(API_BASE_URL + '/share/visit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: shareToken })
            }).catch(() => {});
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    }

    function loadActivationStatus() {
        try {
            const method = localStorage.getItem(ACTIVATION_METHOD_KEY) || '';
            activationMethod = method;
            if (method && method !== 'share') {
                if (localStorage.getItem(STORAGE_KEY) === 'true') isPremiumActivated = true;
            } else {
                localStorage.removeItem(STORAGE_KEY);
                localStorage.removeItem(ACTIVATION_METHOD_KEY);
            }
            const shareStr = sessionStorage.getItem(SHARE_COUNT_SESSION_KEY);
            shareCount = shareStr ? parseInt(shareStr, 10) || 0 : 0;
            activationCode = localStorage.getItem(ACTIVATION_CODE_KEY) || '';
        } catch (e) { console.error('读取激活状态失败:', e); }
    }

    function saveActivationStatus(persist) {
        try {
            if (persist) {
                localStorage.setItem(STORAGE_KEY, isPremiumActivated ? 'true' : 'false');
                localStorage.setItem(ACTIVATION_METHOD_KEY, activationMethod);
                if (activationCode) localStorage.setItem(ACTIVATION_CODE_KEY, activationCode);
            }
            sessionStorage.setItem(SHARE_COUNT_SESSION_KEY, shareCount.toString());
        } catch (e) { console.error('保存激活状态失败:', e); }
    }

    function activatePremium(method, code) {
        isPremiumActivated = true;
        activationMethod = method;
        if (code) activationCode = code;
        saveActivationStatus(method !== 'share');
        removeAllPaywalls();
        showToast(method === 'share' ? '🎉 分享解锁成功！本次分析内容已开放' : '🎉 解锁成功！所有付费内容已开放');
    }

    function resetShareActivation() {
        if (activationMethod === 'share') {
            isPremiumActivated = false;
            activationMethod = '';
            sessionStorage.removeItem(SHARE_COUNT_SESSION_KEY);
            shareCount = 0;
        }
    }

    // ==================== 遮罩处理 ====================

    function applyPaywallsToPremiumCards() {
        if (isPremiumActivated) return;
        PREMIUM_CARDS.forEach(cardId => {
            const card = document.getElementById(cardId);
            if (card) applyPaywallToCard(card);
        });
    }

    function applyPaywallToCard(card) {
        if (isPremiumActivated) return;
        if (card.dataset.hasPaywall === 'true') return;
        card.dataset.hasPaywall = 'true';

        const contentEl = card.querySelector('.card-content');
        if (contentEl && contentEl.innerHTML.trim()) {
            savedCardContent.set(card.id, contentEl.innerHTML);
            contentEl.innerHTML = '';
        }

        const overlay = document.createElement('div');
        overlay.className = 'paywall-overlay';
        overlay.innerHTML = '<div class="paywall-icon">🔒</div><div class="paywall-text">付费内容</div><div class="paywall-hint">点击解锁查看完整分析</div>';
        overlay.addEventListener('click', function(e) {
            e.stopPropagation();
            showPaymentModal(card.id);
        });
        card.appendChild(overlay);
    }

    function removeAllPaywalls() {
        document.querySelectorAll('.paywall-overlay').forEach(o => o.remove());
        PREMIUM_CARDS.forEach(cardId => {
            const card = document.getElementById(cardId);
            if (card) {
                card.dataset.hasPaywall = 'false';
                if (savedCardContent.has(cardId)) {
                    const contentEl = card.querySelector('.card-content');
                    if (contentEl) contentEl.innerHTML = savedCardContent.get(cardId);
                }
            }
        });
        savedCardContent.clear();
    }

    // ==================== 动态卡片监听 ====================

    function observeDynamicCards() {
        if (mutationObserver) mutationObserver.disconnect();
        mutationObserver = new MutationObserver(function(mutations) {
            if (isPremiumActivated) return;
            mutations.forEach(function(mutation) {
                mutation.addedNodes.forEach(function(node) {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        if (PREMIUM_CARDS.includes(node.id)) applyPaywallToCard(node);
                        if (node.querySelectorAll) {
                            node.querySelectorAll(PREMIUM_CARDS.map(id => '#' + id).join(',')).forEach(applyPaywallToCard);
                        }
                    }
                });
            });
        });
        const resultSection = document.getElementById('resultSection');
        if (resultSection) mutationObserver.observe(resultSection, { childList: true, subtree: true });
    }

    function setupAnalysisCompleteListener() {
        const originalDisplayResults = window.displayResults;
        window.displayResults = function(bazi) {
            resetShareActivation();
            removeAllPaywalls();
            if (originalDisplayResults) originalDisplayResults.apply(this, arguments);
            setTimeout(function() {
                PREMIUM_CARDS.forEach(cardId => {
                    const card = document.getElementById(cardId);
                    if (card) card.dataset.hasPaywall = '';
                });
                applyPaywallsToPremiumCards();
            }, 500);
        };
    }

    // ==================== 支付弹窗 ====================

    function showPaymentModal(cardId) {
        currentLockedCardId = cardId;
        const modal = document.createElement('div');
        modal.id = 'paywallModal';
        modal.className = 'paywall-modal';
        modal.innerHTML = '<div class="paywall-modal-content"><div class="paywall-modal-header"><h2>解锁付费内容</h2><span class="paywall-modal-close" onclick="closePaywallModal()">&times;</span></div><div class="paywall-modal-body"><p class="paywall-modal-desc">✨ 随喜即刻为您解锁全文十二大区域内容！</p><div class="paywall-code-section" style="margin-bottom:15px;"><input type="text" id="activationCodeInput" placeholder="已有激活码？直接输入" class="paywall-code-input"><button onclick="handleCodeActivation()" class="paywall-code-btn">激活</button></div><div class="paywall-divider"><span>或选择其他方式</span></div><div class="paywall-options"><div class="paywall-option paywall-option-share" onclick="handleShareUnlock()"><div class="option-icon">📱</div><div class="option-title">分享解锁</div><div class="option-desc">分享到2个微信群即可免费解锁本次分析</div><div class="option-status" id="shareStatus">' + (shareCount >= 2 ? '✓ 已解锁' : '已分享 ' + shareCount + '/2 次') + '</div></div><div class="paywall-option paywall-option-188" onclick="handlePayment(188)"><div class="option-icon">💰</div><div class="option-title">大众随喜 ¥188</div><div class="option-desc">全部分析解锁（永久有效）</div></div><div class="paywall-option paywall-option-388" onclick="handlePayment(388)"><div class="option-icon">💎</div><div class="option-title">贵人随喜 ¥388</div><div class="option-desc">全部分析解锁 + 功德加倍（永久有效）</div></div></div><div class="paywall-error" id="paywallError" style="display:none;"></div></div></div>';
        document.body.appendChild(modal);
        setTimeout(() => modal.classList.add('active'), 10);
        document.addEventListener('keydown', handleEscKey);
    }

    function closePaywallModal() {
        const modal = document.getElementById('paywallModal');
        if (modal) { modal.classList.remove('active'); setTimeout(() => modal.remove(), 300); }
        document.removeEventListener('keydown', handleEscKey);
        currentLockedCardId = null;
    }

    function handleEscKey(e) { if (e.key === 'Escape') closePaywallModal(); }

    // ==================== 分享解锁 ====================

    function handleShareUnlock() {
        if (shareCount >= 2) { activatePremium('share'); return; }
        showLoading('正在生成分享链接...');
        fetch(API_BASE_URL + '/share/init', { method: 'POST' })
        .then(res => res.json())
        .then(data => {
            hideLoading();
            if (data.success && data.token) { currentShareToken = data.token; showSharePrompt(data.token); }
            else showError('生成分享链接失败，请重试');
        })
        .catch(() => { hideLoading(); showError('网络错误，请重试'); });
    }

    function showSharePrompt(token) {
        const shareUrl = 'https://bazifs.top?share=' + token;
        const prompt = document.createElement('div');
        prompt.className = 'share-prompt';
        prompt.innerHTML = '<div class="share-prompt-content"><div class="share-prompt-icon">📱</div><h3>分享到微信群</h3><p>将八字分析工具分享到 <strong>2个微信群</strong></p><p>有2个不同的人点开链接，即可解锁</p><div class="share-prompt-actions" style="flex-direction:column;gap:10px;"><button id="shareCopyBtn" class="share-prompt-btn-confirm" onclick="_shareCopy()">📋 复制分享链接</button><button class="share-prompt-btn-confirm" onclick="_shareCard()" style="background:#4a1a8a;">🖼️ 生成命理卡片（推荐）</button><p style="font-size:12px;color:#aaa;margin:5px 0;">💡 生成卡片后截图保存到相册，发给朋友扫码即可</p></div><div id="shareVisitStatus" style="text-align:center;margin-top:15px;font-size:14px;color:#ffd700;">当前访问: ' + shareCount + '/2 人</div><p style="font-size:11px;color:#666;margin-top:10px;">⚠️ 分享解锁仅对本次分析有效，换八字需重新分享</p><div style="display:flex;gap:10px;margin-top:15px;"><button class="share-prompt-btn-cancel" onclick="closeSharePrompt()">稍后再说</button><button class="share-prompt-btn-confirm" onclick="checkShareStatus()">查看分享结果 ✓</button></div></div>';
        document.body.appendChild(prompt);
        setTimeout(() => prompt.classList.add('active'), 10);

        window._shareCopy = function() {
            const btn = document.getElementById('shareCopyBtn');
            copyToClipboard('八字分析系统 - 命理解读 | 我能比你更了解你自己！ ' + shareUrl, btn);
        };
        window._shareCard = function() { generateShareCard(shareUrl); };
        startSharePoll(token);
    }

    function closeSharePrompt() {
        const prompt = document.querySelector('.share-prompt');
        if (prompt) { prompt.classList.remove('active'); setTimeout(() => prompt.remove(), 300); }
        stopSharePoll();
    }

    function startSharePoll(token) {
        stopSharePoll();
        sharePollTimer = setInterval(() => {
            fetch(API_BASE_URL + '/share/status?token=' + encodeURIComponent(token))
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    shareCount = data.visit_count;
                    sessionStorage.setItem(SHARE_COUNT_SESSION_KEY, shareCount.toString());
                    const statusEl = document.getElementById('shareVisitStatus');
                    if (statusEl) {
                        if (shareCount >= 2) { statusEl.innerHTML = '✅ 已有2人访问，解锁成功！'; statusEl.style.color = '#4ecdc4'; statusEl.style.fontWeight = 'bold'; }
                        else statusEl.textContent = '当前访问: ' + shareCount + '/2 人';
                    }
                    if (shareCount >= 2) {
                        stopSharePoll();
                        setTimeout(() => {
                            const p = document.querySelector('.share-prompt');
                            if (p) { p.classList.remove('active'); setTimeout(() => p.remove(), 300); }
                            activatePremium('share');
                        }, 800);
                    }
                }
            }).catch(() => {});
        }, 5000);
    }

    function stopSharePoll() { if (sharePollTimer) { clearInterval(sharePollTimer); sharePollTimer = null; } }

    function checkShareStatus() {
        if (!currentShareToken) { showError('分享信息丢失'); return; }
        showLoading('检查分享状态...');
        fetch(API_BASE_URL + '/share/status?token=' + encodeURIComponent(currentShareToken))
        .then(res => res.json())
        .then(data => {
            hideLoading();
            if (data.success) {
                shareCount = data.visit_count;
                sessionStorage.setItem(SHARE_COUNT_SESSION_KEY, shareCount.toString());
                if (shareCount >= 2) { closeSharePrompt(); activatePremium('share'); }
                else showToast('已有' + shareCount + '人访问，还需' + (2 - shareCount) + '人');
            }
        }).catch(() => { hideLoading(); showError('网络错误，请重试'); });
    }

    function copyToClipboard(text, btn) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(() => {
                btn.textContent = '✅ 已复制！去微信群粘贴';
                setTimeout(() => { btn.textContent = '📋 复制分享链接'; }, 3000);
            }).catch(() => fallbackCopy(text, btn));
        } else fallbackCopy(text, btn);
    }

    function fallbackCopy(text, btn) {
        const ta = document.createElement('textarea');
        ta.value = text; ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0;';
        document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); btn.textContent = '✅ 已复制！去微信群粘贴'; setTimeout(() => { btn.textContent = '📋 复制分享链接'; }, 3000); }
        catch(e) { btn.textContent = '❌ 复制失败，请手动复制'; }
        document.body.removeChild(ta);
    }

    function generateShareCard(shareUrl) {
        window._shareOverrideUrl = shareUrl;
        const shareModal = document.getElementById('shareModal');
        if (shareModal) { document.body.appendChild(shareModal); shareModal.style.zIndex = '99999'; }
        const pm = document.getElementById('paywallModal'); if (pm) pm.remove();
        const sp = document.querySelector('.share-prompt'); if (sp) sp.remove();
        stopSharePoll(); currentLockedCardId = null;
        if (typeof generateShareImage === 'function') generateShareImage();
        else showError('卡片生成不可用，请使用复制链接方式');
    }

    // ==================== 微信支付 ====================

    function handlePayment(amount) {
        showLoading('正在创建订单...');
        fetch(API_BASE_URL + '/create-order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount: amount })
        })
        .then(res => { if (!res.ok) return res.json().then(d => { throw new Error(d.error || '服务器错误'); }); return res.json(); })
        .then(orderInfo => {
            hideLoading();
            if (orderInfo.success && (orderInfo.url || orderInfo.url_qrcode)) {
                const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
                if (isMobile && orderInfo.url) {
                    try { sessionStorage.setItem('bazi_payment_order', JSON.stringify(orderInfo)); } catch(e) {}
                    window.location.href = orderInfo.url;
                } else showPaymentQRCode(orderInfo);
            } else showError(orderInfo.error || '创建订单失败，请稍后重试');
        })
        .catch(err => { hideLoading(); showError('创建订单失败: ' + (err.message || '网络错误')); });
    }

    function showPaymentQRCode(orderInfo) {
        const modal = document.getElementById('paywallModal');
        const body = modal ? modal.querySelector('.paywall-modal-body') : null;
        if (!body) return;
        window.currentPaymentOrder = orderInfo;
        const qrcodeUrl = orderInfo.url_qrcode || '';
        const orderId = orderInfo.order_id || orderInfo.orderId || '';
        body.innerHTML = '<div class="qrcode-section"><div class="qrcode-header"><h3>微信支付</h3><p>截图保存，打开微信扫一扫从相册识别</p></div><div class="qrcode-amount">¥' + (orderInfo.amount || '') + '</div>' + (qrcodeUrl ? '<div class="qrcode-box"><img src="' + qrcodeUrl + '" alt="支付二维码" style="width:200px;height:200px;"></div>' : '<div class="qrcode-box"><div class="qrcode-placeholder"><div class="qrcode-icon">📱</div><p>支付二维码</p></div></div>') + '<div class="qrcode-tip"><p>💡 支付完成后点击"已完成支付"按钮</p></div><div class="qrcode-actions"><button class="qrcode-btn-cancel" onclick="checkPaymentStatus()">已完成支付 ✓</button><button class="qrcode-btn-back" onclick="closePaywallModal()">返回</button></div><p style="font-size:11px;color:#666;margin-top:10px;">订单号: ' + orderId + '</p></div>';
    }

    function checkPaymentStatus() {
        const order = window.currentPaymentOrder;
        if (!order) { showError('订单信息丢失'); return; }
        showLoading('正在验证支付状态...');
        fetch(API_BASE_URL + '/status?order_id=' + encodeURIComponent(order.order_id || order.orderId || ''))
        .then(res => res.json())
        .then(data => {
            hideLoading();
            if (data.status === 'paid') activatePremium(order.amount === 388 ? 'pay388' : 'pay188', data.activation_code || '');
            else showError('未检测到支付，请完成支付后再试');
        })
        .catch(() => { hideLoading(); showError('网络错误，请稍后重试'); });
    }

    // ==================== 激活码 ====================

    function handleCodeActivation() {
        const input = document.getElementById('activationCodeInput');
        const code = input ? input.value.trim().toUpperCase() : '';
        if (!code) { showError('请输入激活码'); return; }
        showLoading('验证激活码...');
        fetch(API_BASE_URL + '/verify-code?code=' + encodeURIComponent(code))
        .then(res => res.json())
        .then(data => { hideLoading(); if (data.valid) activatePremium('code', code); else showError(data.message || '激活码无效或已过期'); })
        .catch(() => { hideLoading(); showError('验证失败，请重试'); });
    }

    // ==================== UI辅助 ====================

    function showToast(message, duration) {
        duration = duration || 2000;
        const toast = document.createElement('div');
        toast.className = 'paywall-toast'; toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => toast.classList.add('active'), 10);
        setTimeout(() => { toast.classList.remove('active'); setTimeout(() => toast.remove(), 300); }, duration);
    }

    function showLoading(message) {
        hideLoading();
        const loading = document.createElement('div');
        loading.className = 'paywall-loading'; loading.id = 'paywallLoading';
        loading.innerHTML = '<div class="loading-spinner"></div><p>' + message + '</p>';
        document.body.appendChild(loading);
    }

    function hideLoading() { const l = document.getElementById('paywallLoading'); if (l) l.remove(); }

    function showError(message) {
        const e = document.getElementById('paywallError');
        if (e) { e.textContent = message; e.style.display = 'block'; setTimeout(() => { e.style.display = 'none'; }, 3000); }
        else showToast(message, 3000);
    }

    // ==================== 全局暴露 ====================

    window.handleCodeActivation = handleCodeActivation;
    window.handlePayment = handlePayment;
    window.handleShareUnlock = handleShareUnlock;
    window.closePaywallModal = closePaywallModal;
    window.closeSharePrompt = closeSharePrompt;
    window.checkShareStatus = checkShareStatus;
    window.checkPaymentStatus = checkPaymentStatus;

    window._showRefundModal = function() {
        const existing = document.getElementById('refundModal'); if (existing) existing.remove();
        const modal = document.createElement('div'); modal.id = 'refundModal';
        modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);z-index:999999;display:flex;align-items:center;justify-content:center;padding:20px;';
        modal.innerHTML = '<div style="background:#1a1a2e;border-radius:16px;padding:25px;max-width:400px;width:100%;color:#fff;"><h3 style="margin:0 0 15px;">📋 申请退款</h3><input id="refundOrderId" placeholder="订单号（选填）" style="width:100%;padding:10px;margin-bottom:10px;background:#2a2a3e;border:1px solid #444;border-radius:8px;color:#fff;box-sizing:border-box;"><textarea id="refundReason" placeholder="退款原因 *" style="width:100%;padding:10px;margin-bottom:10px;background:#2a2a3e;border:1px solid #444;border-radius:8px;color:#fff;min-height:60px;box-sizing:border-box;"></textarea><input id="refundContact" placeholder="联系方式 *（微信号或手机号）" style="width:100%;padding:10px;margin-bottom:15px;background:#2a2a3e;border:1px solid #444;border-radius:8px;color:#fff;box-sizing:border-box;"><button onclick="_submitRefund()" style="width:100%;padding:12px;background:linear-gradient(135deg,#4a1a8a,#6b21a8);color:#ffd700;border:none;border-radius:8px;font-size:16px;cursor:pointer;">提交退款申请</button><p style="font-size:11px;color:#666;margin-top:8px;text-align:center;">提交后将在24小时内处理</p></div>';
        document.body.appendChild(modal);
        modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
    };
    window._closeRefundModal = function() { const m = document.getElementById('refundModal'); if (m) m.remove(); };
    window._submitRefund = function() {
        var orderId = document.getElementById('refundOrderId').value.trim();
        var reason = document.getElementById('refundReason').value.trim();
        var contact = document.getElementById('refundContact').value.trim();
        if (!reason) { showToast('请填写退款原因'); return; }
        if (!contact) { showToast('请填写联系方式'); return; }
        fetch(API_BASE_URL + '/refund/apply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order_id: orderId, reason: reason, contact: contact }) })
        .then(function(res) { return res.json(); })
        .then(function(data) { if (data.success) { showToast('✅ 退款申请已提交'); _closeRefundModal(); } else showToast(data.error || '提交失败'); })
        .catch(function() { showToast('网络错误，请重试'); });
    };

    window.PaywallSystem = { init: initPaywall, isActivated: function() { return isPremiumActivated; }, activate: activatePremium, showModal: showPaymentModal, closeModal: closePaywallModal };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initPaywall);
    else initPaywall();
})();
