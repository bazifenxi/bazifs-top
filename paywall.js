/**
 * 八字工具付费墙系统
 * 
 * 功能：
 * 1. 对付费卡片添加模糊遮罩
 * 2. 支付弹窗（分享解锁/微信支付）
 * 3. 激活码验证
 * 4. localStorage 存储激活状态（仅付费/激活码持久化，分享解锁仅当次有效）
 * 5. MutationObserver 监听动态卡片
 * 
 * 付费解锁后全文开放，不管在哪块区域付费都解锁所有付费卡片
 */

(function() {
    'use strict';

    // ==================== 配置 ====================
    
    // 付费卡片ID列表
    const PREMIUM_CARDS = [
        'familyCard',        // 👨‍👩‍👧‍👦 六亲关系
        'healthCard',        // 🏥 健康提示
        'ganzhiRelationsCard', // 🔗 干支关系分析
        'yunweiCard',        // 🌟 起运与命局
        'dayunCard',         // 📊 大运分析
        'liunianCard',       // 📅 流年运势
        'liuyueCard',        // 🗓️ 流月运势
        'plainLanguageCard', // 💬 大师白话解读
        'combinationCard',   // 条件断语库
        'gejuCard',          // 格局定性
        'careerCard'         // 职业倾向
    ];

    // 免费卡片ID列表
    const FREE_CARDS = [
        'baziCard',          // 🎴 八字命盘
        'cangganCard',       // 🔮 藏干与十神
        'wuxingCard',        // ⚖️ 五行力量分布
        'xiyongCard',        // 🎯 喜用神分析
        'personalityCard',   // 🎯 性格分析
        'shenshaCard'        // ✨ 神煞一览
    ];

    // 后端API地址
    const API_BASE_URL = 'https://zhongyi-note.top/bazi-api/pay';

    // localStorage 键名
    const STORAGE_KEY = 'bazi_premium_activated';
    const ACTIVATION_METHOD_KEY = 'bazi_activation_method';
    const ACTIVATION_CODE_KEY = 'bazi_activation_code';
    // 分享计数仅存sessionStorage，不跨页面/刷新持久化
    const SHARE_COUNT_SESSION_KEY = 'bazi_share_count';

    // ==================== 状态管理 ====================

    let isPremiumActivated = false;
    let activationMethod = '';  // 'share' | 'pay188' | 'pay388' | 'code' | ''
    let shareCount = 0;
    let activationCode = '';

    /**
     * 初始化付费墙系统
     */
    function initPaywall() {
        // 从localStorage读取激活状态
        loadActivationStatus();
        
        // 检查是否通过分享链接访问（?share=TOKEN）
        checkShareVisit();
        
        // 监听DOM变化（处理动态创建的卡片）
        observeDynamicCards();
        
        // 监听分析完成事件
        setupAnalysisCompleteListener();
    }

    /**
     * 检查是否通过分享链接访问，是则通知后端记录访问
     */
    function checkShareVisit() {
        const urlParams = new URLSearchParams(window.location.search);
        const shareToken = urlParams.get('share');
        if (shareToken && shareToken.startsWith('SH')) {
            // 异步通知后端，不阻塞页面加载
            fetch(API_BASE_URL + '/share/visit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: shareToken })
            }).catch(() => {});
            // 清除URL中的share参数，避免刷新重复计数
            const cleanUrl = window.location.pathname;
            window.history.replaceState({}, document.title, cleanUrl);
        }
    }

    /**
     * 从localStorage加载激活状态
     * 只有付费/激活码激活才持久化，分享解锁不持久化
     */
    function loadActivationStatus() {
        try {
            const method = localStorage.getItem(ACTIVATION_METHOD_KEY) || '';
            activationMethod = method;
            
            // 只有非分享方式激活才读取持久化状态
            if (method && method !== 'share') {
                const activated = localStorage.getItem(STORAGE_KEY);
                if (activated === 'true') {
                    isPremiumActivated = true;
                }
            } else {
                // 清除可能残留的分享激活状态
                localStorage.removeItem(STORAGE_KEY);
                localStorage.removeItem(ACTIVATION_METHOD_KEY);
            }
            
            // 分享计数从sessionStorage读取（仅当前会话有效）
            const shareStr = sessionStorage.getItem(SHARE_COUNT_SESSION_KEY);
            shareCount = shareStr ? parseInt(shareStr, 10) || 0 : 0;
            
            activationCode = localStorage.getItem(ACTIVATION_CODE_KEY) || '';
        } catch (e) {
            console.error('读取激活状态失败:', e);
        }
    }

    /**
     * 保存激活状态到localStorage
     * @param {boolean} persist - 是否持久化（分享解锁不持久化）
     */
    function saveActivationStatus(persist) {
        try {
            if (persist) {
                localStorage.setItem(STORAGE_KEY, isPremiumActivated ? 'true' : 'false');
                localStorage.setItem(ACTIVATION_METHOD_KEY, activationMethod);
                if (activationCode) {
                    localStorage.setItem(ACTIVATION_CODE_KEY, activationCode);
                }
            }
            // 分享计数始终存sessionStorage
            sessionStorage.setItem(SHARE_COUNT_SESSION_KEY, shareCount.toString());
        } catch (e) {
            console.error('保存激活状态失败:', e);
        }
    }

    /**
     * 激活付费功能 —— 解锁全部付费卡片
     * @param {string} method - 激活方式：'share' | 'pay188' | 'pay388' | 'code'
     * @param {string} code - 激活码（可选）
     */
    function activatePremium(method, code) {
        isPremiumActivated = true;
        activationMethod = method;
        if (code) {
            activationCode = code;
        }
        
        // 分享解锁不持久化，付费/激活码持久化
        const persist = (method !== 'share');
        saveActivationStatus(persist);
        
        // 移除所有遮罩，恢复所有内容
        removeAllPaywalls();
        
        // 显示成功提示
        if (method === 'share') {
            showToast('🎉 分享解锁成功！本次分析内容已开放');
        } else {
            showToast('🎉 解锁成功！所有付费内容已开放');
        }
    }

    /**
     * 重置分享解锁状态（新分析时调用）
     */
    function resetShareActivation() {
        if (activationMethod === 'share') {
            isPremiumActivated = false;
            activationMethod = '';
            sessionStorage.removeItem(SHARE_COUNT_SESSION_KEY);
            shareCount = 0;
        }
    }

    // ==================== 内容保护（延迟渲染） ====================
    // 存储付费卡片的原始内容，未激活时不放入DOM
    const savedCardContent = new Map();

    /**
     * 对所有付费卡片应用付费墙
     */
    function applyPaywallsToPremiumCards() {
        // 如果已激活（付费/激活码/分享），不上锁
        if (isPremiumActivated) {
            return;
        }

        PREMIUM_CARDS.forEach(cardId => {
            const card = document.getElementById(cardId);
            if (card) {
                applyPaywallToCard(card);
            }
        });
    }

    /**
     * 对单个卡片应用付费墙
     * 策略：保存card-content的innerHTML，然后清空DOM，只显示遮罩
     * @param {HTMLElement} card - 卡片元素
     */
    function applyPaywallToCard(card) {
        // 已激活则不上锁（保证付费后全文解锁，不管卡片何时出现）
        if (isPremiumActivated) {
            return;
        }
        // 避免重复添加
        if (card.dataset.hasPaywall === 'true') {
            return;
        }
        card.dataset.hasPaywall = 'true';

        // 找到card-content元素，保存内容后清空
        const contentEl = card.querySelector('.card-content');
        if (contentEl && contentEl.innerHTML.trim()) {
            savedCardContent.set(card.id, contentEl.innerHTML);
            contentEl.innerHTML = '';
        }

        // 创建遮罩层
        const overlay = document.createElement('div');
        overlay.className = 'paywall-overlay';
        overlay.innerHTML = `
            <div class="paywall-icon">🔒</div>
            <div class="paywall-text">付费内容</div>
            <div class="paywall-hint">点击解锁查看完整分析</div>
        `;
        
        // 添加点击事件
        overlay.addEventListener('click', function(e) {
            e.stopPropagation();
            showPaymentModal(card.id);
        });

        // 添加到卡片中
        card.appendChild(overlay);
    }

    /**
     * 移除所有付费墙，恢复内容
     */
    function removeAllPaywalls() {
        const overlays = document.querySelectorAll('.paywall-overlay');
        overlays.forEach(overlay => {
            overlay.remove();
        });
        
        // 恢复付费卡片的内容
        PREMIUM_CARDS.forEach(cardId => {
            const card = document.getElementById(cardId);
            if (card) {
                card.dataset.hasPaywall = 'false';
                // 恢复保存的内容
                if (savedCardContent.has(cardId)) {
                    const contentEl = card.querySelector('.card-content');
                    if (contentEl) {
                        contentEl.innerHTML = savedCardContent.get(cardId);
                    }
                }
            }
        });
        
        // 清空保存的内容
        savedCardContent.clear();
    }

    // ==================== 动态卡片监听 ====================

    let mutationObserver = null;

    /**
     * 设置MutationObserver监听动态创建的卡片
     */
    function observeDynamicCards() {
        if (mutationObserver) {
            mutationObserver.disconnect();
        }

        mutationObserver = new MutationObserver(function(mutations) {
            // 如果已激活，不需要给任何新卡片上锁
            if (isPremiumActivated) {
                return;
            }

            mutations.forEach(function(mutation) {
                mutation.addedNodes.forEach(function(node) {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        // 检查是否是付费卡片
                        if (PREMIUM_CARDS.includes(node.id)) {
                            applyPaywallToCard(node);
                        }
                        
                        // 检查子元素中是否包含付费卡片
                        const premiumCards = node.querySelectorAll ?
                            node.querySelectorAll(PREMIUM_CARDS.map(id => '#' + id).join(',')) : [];
                        premiumCards.forEach(card => {
                            applyPaywallToCard(card);
                        });
                    }
                });
            });
        });

        // 开始监听
        const resultSection = document.getElementById('resultSection');
        if (resultSection) {
            mutationObserver.observe(resultSection, {
                childList: true,
                subtree: true
            });
        }
    }

    /**
     * 设置分析完成监听器
     * 分析完成后应用付费墙遮罩
     */
    function setupAnalysisCompleteListener() {
        // 原始的displayResults函数
        const originalDisplayResults = window.displayResults;
        
        // 重写displayResults
        window.displayResults = function(bazi) {
            // 新分析：重置分享解锁，重新上锁
            resetShareActivation();
            // 移除现有遮罩和内容缓存
            removeAllPaywalls();
            
            // 先调用原始函数
            if (originalDisplayResults) {
                originalDisplayResults.apply(this, arguments);
            }
            
            // 延迟应用遮罩，确保所有卡片（包括动态创建的）内容都已生成
            setTimeout(function() {
                // 重置动态卡片的标记，因为MutationObserver可能先标记了空卡片
                PREMIUM_CARDS.forEach(cardId => {
                    const card = document.getElementById(cardId);
                    if (card) {
                        card.dataset.hasPaywall = '';
                    }
                });
                applyPaywallsToPremiumCards();
            }, 500);
        };

        // 也监听 handleAnalyze
        const originalHandleAnalyze = window.handleAnalyze;
        
        if (originalHandleAnalyze) {
            window.handleAnalyze = function() {
                // 新分析：重置分享解锁
                resetShareActivation();
                // 移除现有遮罩
                removeAllPaywalls();
                
                // 调用原始函数
                originalHandleAnalyze.apply(this, arguments);
            };
        }
    }

    // ==================== 支付弹窗 ====================

    let currentLockedCardId = null;

    /**
     * 显示支付弹窗
     * @param {string} cardId - 被锁定的卡片ID
     */
    function showPaymentModal(cardId) {
        currentLockedCardId = cardId;
        
        // 创建弹窗
        const modal = document.createElement('div');
        modal.id = 'paywallModal';
        modal.className = 'paywall-modal';
        
        modal.innerHTML = `
            <div class="paywall-modal-content">
                <div class="paywall-modal-header">
                    <h2>解锁付费内容</h2>
                    <span class="paywall-modal-close" onclick="closePaywallModal()">&times;</span>
                </div>
                <div class="paywall-modal-body">
                    <p class="paywall-modal-desc">
                        选择以下方式解锁全部付费分析内容
                    </p>
                    
                    <div class="paywall-code-section" style="margin-bottom:20px;">
                        <div style="font-size:14px;color:#666;margin-bottom:8px;">🔑 已有激活码？直接输入</div>
                        <div style="display:flex;gap:8px;">
                            <input type="text" id="activationCodeInput" placeholder="请输入激活码" class="paywall-code-input" style="flex:1;">
                            <button onclick="handleCodeActivation()" class="paywall-code-btn">激活</button>
                        </div>
                    </div>
                    
                    <div class="paywall-divider">
                        <span>或选择其他方式</span>
                    </div>
                    
                    <div class="paywall-options">
                        <!-- 分享解锁 -->
                        <div class="paywall-option paywall-option-share" onclick="handleShareUnlock()">
                            <div class="option-icon">📱</div>
                            <div class="option-title">分享解锁</div>
                            <div class="option-desc">分享到2个微信群即可免费解锁本次分析</div>
                            <div class="option-status" id="shareStatus">
                                ${shareCount >= 2 ? '✓ 已解锁' : `已分享 ${shareCount}/2 次`}
                            </div>
                        </div>
                        
                        <!-- 大众随缘 ¥188 -->
                        <div class="paywall-option paywall-option-188" onclick="handlePayment(188)">
                            <div class="option-icon">💰</div>
                            <div class="option-title">大众随缘 ¥188</div>
                            <div class="option-desc">全部分析解锁（永久有效）</div>
                        </div>
                        
                        <!-- 贵人随喜 ¥388 -->
                        <div class="paywall-option paywall-option-388" onclick="handlePayment(388)">
                            <div class="option-icon">💎</div>
                            <div class="option-title">贵人随喜 ¥388</div>
                            <div class="option-desc">全部分析解锁 + 功德加倍（永久有效）</div>
                            <div class="option-tag vip">贵人</div>
                        </div>
                    </div>
                    
                    <div class="paywall-error" id="paywallError" style="display:none;"></div>
                </div>
            </div>
        `;
        
        // 添加到body
        document.body.appendChild(modal);
        
        // 显示动画
        setTimeout(() => {
            modal.classList.add('active');
        }, 10);
        
        // ESC关闭
        document.addEventListener('keydown', handleEscKey);
    }

    /**
     * 关闭支付弹窗
     */
    function closePaywallModal() {
        const modal = document.getElementById('paywallModal');
        if (modal) {
            modal.classList.remove('active');
            setTimeout(() => {
                modal.remove();
            }, 300);
        }
        document.removeEventListener('keydown', handleEscKey);
        currentLockedCardId = null;
    }

    /**
     * ESC键处理
     */
    function handleEscKey(e) {
        if (e.key === 'Escape') {
            closePaywallModal();
        }
    }

    // ==================== 分享解锁 ====================

    /**
     * 处理分享解锁
     */
    function handleShareUnlock() {
        // 如果已经解锁2次，直接激活
        if (shareCount >= 2) {
            activatePremium('share');
            return;
        }

        // 调后端初始化分享token
        showLoading('正在生成分享链接...');
        fetch(API_BASE_URL + '/share/init', { method: 'POST' })
            .then(res => res.json())
            .then(data => {
                hideLoading();
                if (data.success && data.token) {
                    currentShareToken = data.token;
                    showSharePrompt(data.token);
                } else {
                    showError('生成分享链接失败，请重试');
                }
            })
            .catch(err => {
                hideLoading();
                showError('网络错误，请重试');
            });
    }

    let currentShareToken = '';
    let sharePollTimer = null;

    /**
     * 显示分享提示弹窗（含复制链接+生成卡片图）
     */
    function showSharePrompt(token) {
        const shareUrl = 'https://bazifs.top?share=' + token;

        const prompt = document.createElement('div');
        prompt.className = 'share-prompt';
        prompt.innerHTML = `
            <div class="share-prompt-content">
                <div class="share-prompt-icon">📱</div>
                <h3>分享到微信群</h3>
                <p>将八字分析工具分享到</p>
                <p><strong>2个微信群</strong></p>
                <p class="share-prompt-hint">有2个不同的人点开链接，即可解锁</p>
                <div style="margin:15px 0;">
                    <button id="shareCopyBtn" class="share-prompt-btn-confirm" style="width:100%;margin-bottom:8px;font-size:1em;" onclick="window._shareCopy()">
                        📋 复制分享链接
                    </button>
                    <button id="shareCardBtn" class="share-prompt-btn-confirm" style="width:100%;font-size:1em;background:linear-gradient(135deg,#ffd700,#ff9500);color:#1a1a2e;" onclick="window._shareCard()">
                        🖼️ 生成命理卡片（推荐）
                    </button>
                </div>
                <p style="color:#ffd700;font-size:0.85em;margin:5px 0;">💡 生成卡片后截图保存到相册，发给朋友扫码即可</p>
                <p id="shareVisitStatus" style="color:#4ecdc4;font-size:0.9em;">当前访问: ${shareCount}/2 人</p>
                <p class="share-prompt-hint" style="color:#e74c3c;font-size:12px;">⚠️ 分享解锁仅对本次分析有效，换八字需重新分享</p>
                <div class="share-prompt-actions">
                    <button class="share-prompt-btn-cancel" onclick="closeSharePrompt()">稍后再说</button>
                    <button class="share-prompt-btn-confirm" onclick="checkShareStatus()">查看分享结果 ✓</button>
                </div>
            </div>
        `;
        document.body.appendChild(prompt);
        setTimeout(() => prompt.classList.add('active'), 10);

        // 绑定复制链接和生成卡片（用window全局函数，onclick直接调用，兼容微信X5）
        window._shareCopy = function() {
            const btn = document.getElementById('shareCopyBtn');
            copyToClipboard('八字分析系统 - 命理解读 | 我能比你更了解你自己！ ' + shareUrl, btn);
        };
        window._shareCard = function() {
            generateShareCard(shareUrl);
        };

        // 开始轮询访问状态
        startSharePoll(token);
    }

    /**
     * 关闭分享弹窗
     */
    function closeSharePrompt() {
        const prompt = document.querySelector('.share-prompt');
        if (prompt) {
            prompt.classList.remove('active');
            setTimeout(() => prompt.remove(), 300);
        }
        stopSharePoll();
    }

    /**
     * 轮询分享访问状态
     */
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
                            statusEl.textContent = `当前访问: ${shareCount}/2 人`;
                            if (shareCount >= 2) {
                                statusEl.innerHTML = '✅ 已有2人访问，解锁成功！';
                                statusEl.style.color = '#4ecdc4';
                                statusEl.style.fontWeight = 'bold';
                            }
                        }
                        if (shareCount >= 2) {
                            stopSharePoll();
                            setTimeout(() => {
                                const prompt = document.querySelector('.share-prompt');
                                if (prompt) {
                                    prompt.classList.remove('active');
                                    setTimeout(() => prompt.remove(), 300);
                                }
                                activatePremium('share');
                            }, 800);
                        }
                    }
                })
                .catch(() => {});
        }, 5000); // 每5秒轮询一次
    }

    function stopSharePoll() {
        if (sharePollTimer) {
            clearInterval(sharePollTimer);
            sharePollTimer = null;
        }
    }

    /**
     * 手动检查分享结果
     */
    function checkShareStatus() {
        if (!currentShareToken) {
            showError('分享信息丢失');
            return;
        }
        showLoading('检查分享状态...');
        fetch(API_BASE_URL + '/share/status?token=' + encodeURIComponent(currentShareToken))
            .then(res => res.json())
            .then(data => {
                hideLoading();
                if (data.success) {
                    shareCount = data.visit_count;
                    sessionStorage.setItem(SHARE_COUNT_SESSION_KEY, shareCount.toString());
                    if (shareCount >= 2) {
                        const prompt = document.querySelector('.share-prompt');
                        if (prompt) {
                            prompt.classList.remove('active');
                            setTimeout(() => prompt.remove(), 300);
                        }
                        activatePremium('share');
                    } else {
                        showToast(`已有${shareCount}人访问，还需${2 - shareCount}人`);
                    }
                }
            })
            .catch(() => {
                hideLoading();
                showError('网络错误，请重试');
            });
    }

    /**
     * 复制到剪贴板（兼容微信浏览器）
     */
    function copyToClipboard(text, btn) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(() => {
                btn.textContent = '✅ 已复制！去微信群粘贴';
                setTimeout(() => { btn.textContent = '📋 复制分享链接'; }, 3000);
            }).catch(() => {
                fallbackCopy(text, btn);
            });
        } else {
            fallbackCopy(text, btn);
        }
    }

    function fallbackCopy(text, btn) {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0;';
        document.body.appendChild(textarea);
        textarea.select();
        try {
            document.execCommand('copy');
            btn.textContent = '✅ 已复制！去微信群粘贴';
            setTimeout(() => { btn.textContent = '📋 复制分享链接'; }, 3000);
        } catch(e) {
            btn.textContent = '❌ 复制失败，请手动复制';
        }
        document.body.removeChild(textarea);
    }

    /**
     * 生成分享卡片图（复用页面自带的命理小卡片）
     */
    function generateShareCard(shareUrl) {
        // 设置全局覆盖URL，让generateShareImage()的二维码指向分享链接
        window._shareOverrideUrl = shareUrl;

        // 根本修复：把shareModal从.card深层移到document.body，与paywallModal同层级
        // 这是解决z-index被压住的根本原因——paywallModal在body上，shareModal在嵌套DOM里
        const shareModal = document.getElementById('shareModal');
        if (shareModal) {
            document.body.appendChild(shareModal);
            shareModal.style.zIndex = '99999';
        }

        // 立即强制移除所有遮挡弹窗
        const paywallModal = document.getElementById('paywallModal');
        if (paywallModal) paywallModal.remove();
        const sharePrompt = document.querySelector('.share-prompt');
        if (sharePrompt) sharePrompt.remove();

        // 清理状态
        stopSharePoll();
        currentLockedCardId = null;

        // 调用页面自带的命理卡片生成函数
        if (typeof generateShareImage === 'function') {
            generateShareImage();
        } else {
            showError('卡片生成不可用，请使用复制链接方式');
        }
    }

    // ==================== 微信支付 ====================

    /**
     * 处理微信支付
     * @param {number} amount - 支付金额
     */
    function handlePayment(amount) {
        showLoading('正在创建订单...');
        
        createPaymentOrder(amount)
            .then(orderInfo => {
                hideLoading();
                if (orderInfo.success && (orderInfo.url || orderInfo.url_qrcode)) {
                    // 手机端直接跳转支付页面，无需扫码
                    const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
                    if (isMobile && orderInfo.url) {
                        window.location.href = orderInfo.url;
                    } else {
                        showPaymentQRCode(orderInfo);
                    }
                } else if (orderInfo.error) {
                    showError(orderInfo.error || '创建订单失败');
                } else {
                    showError('创建订单失败，请稍后重试');
                }
            })
            .catch(err => {
                hideLoading();
                showError('创建订单失败: ' + (err.message || '网络错误'));
            });
    }

    /**
     * 创建支付订单
     * @param {number} amount - 支付金额
     * @returns {Promise} 订单信息
     */
    function createPaymentOrder(amount) {
        return fetch(API_BASE_URL + '/create-order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount: amount })
        }).then(res => {
            if (!res.ok) {
                return res.json().then(data => {
                    throw new Error(data.error || '服务器错误');
                });
            }
            return res.json();
        });
    }

    /**
     * 显示支付二维码
     * @param {Object} orderInfo - 订单信息（后端返回url_qrcode字段）
     */
    function showPaymentQRCode(orderInfo) {
        const modal = document.getElementById('paywallModal');
        const body = modal ? modal.querySelector('.paywall-modal-body') : null;
        
        if (!body) return;

        // 保存当前订单信息
        window.currentPaymentOrder = orderInfo;

        const qrcodeUrl = orderInfo.url_qrcode || '';
        const orderId = orderInfo.order_id || orderInfo.orderId || '';

        body.innerHTML = `
            <div class="qrcode-section">
                <div class="qrcode-header">
                    <h3>微信支付</h3>
                    <p>截图保存，打开微信扫一扫从相册识别</p>
                </div>
                <div class="qrcode-amount">¥${orderInfo.amount || ''}</div>
                <div class="qrcode-box" id="qrcodeBox">
                    ${qrcodeUrl ? 
                        `<img src="${qrcodeUrl}" alt="微信支付二维码" style="max-width:100%;height:auto;display:block;">` :
                        `<div class="qrcode-placeholder">
                            <div class="qrcode-icon">📱</div>
                            <p>支付二维码</p>
                        </div>`
                    }
                </div>
                <div class="qrcode-tip">
                    <p>💡 支付完成后点击"已完成支付"按钮</p>
                </div>
                <div class="qrcode-actions">
                    <button class="qrcode-btn-cancel" onclick="checkPaymentStatus()">已完成支付 ✓</button>
                    <button class="qrcode-btn-back" onclick="closePaywallModal()">返回</button>
                </div>
                <div style="font-size:11px;color:#999;text-align:center;margin-top:8px;">订单号: ${orderId}</div>
            </div>
        `;
    }

    /**
     * 检查支付状态
     */
    function checkPaymentStatus() {
        const order = window.currentPaymentOrder;
        if (!order) {
            showError('订单信息丢失');
            return;
        }

        showLoading('正在验证支付状态...');
        
        const orderId = order.order_id || order.orderId || '';
        
        // 必须走后端API验证订单状态
        fetch(API_BASE_URL + '/status?order_id=' + encodeURIComponent(orderId))
            .then(res => res.json())
            .then(data => {
                hideLoading();
                if (data.status === 'paid') {
                    const code = data.activation_code || '';
                    activatePremium(order.amount === 388 ? 'pay388' : 'pay188', code);
                } else {
                    showError('未检测到支付，请完成支付后再试');
                }
            })
            .catch(err => {
                hideLoading();
                showError('网络错误，请稍后重试');
            });
    }

    // ==================== 激活码 ====================

    /**
     * 处理激活码激活
     */
    function handleCodeActivation() {
        const input = document.getElementById('activationCodeInput');
        const code = input ? input.value.trim().toUpperCase() : '';
        
        if (!code) {
            showError('请输入激活码');
            return;
        }

        showLoading('验证激活码...');
        
        verifyActivationCode(code)
            .then(result => {
                hideLoading();
                if (result.valid) {
                    activatePremium('code', code);
                } else {
                    showError(result.message || '激活码无效或已过期');
                }
            })
            .catch(err => {
                hideLoading();
                showError('验证失败: ' + err.message);
            });
    }

    /**
     * 验证激活码
     * @param {string} code - 激活码
     * @returns {Promise} 验证结果
     */
    function verifyActivationCode(code) {
        // 先尝试后端验证
        return fetch(API_BASE_URL + '/verify-code?code=' + encodeURIComponent(code))
            .then(res => res.json())
            .then(data => {
                if (data.valid) {
                    return data;
                }
                // 后端返回无效，再检查测试码
                return checkTestCode(code);
            })
            .catch(() => {
                // 网络错误，检查测试码
                return checkTestCode(code);
            });
    }

    /**
     * 检查测试激活码（本地fallback）
     */
    function checkTestCode(code) {
        return new Promise((resolve) => {
            setTimeout(() => {
                const testCodes = {
                    'TEST188': { valid: true, type: '188', message: '测试激活码有效' },
                    'TEST388': { valid: true, type: '388', message: '测试激活码有效' },
                    'TESTVIP': { valid: true, type: '388', message: 'VIP测试激活码有效' }
                };
                
                const result = testCodes[code];
                if (result) {
                    resolve({ valid: true, message: result.message });
                } else {
                    resolve({ valid: false, message: '激活码无效或已过期' });
                }
            }, 300);
        });
    }

    // ==================== UI辅助 ====================

    /**
     * 显示Toast提示
     * @param {string} message - 提示消息
     * @param {number} duration - 显示时长(ms)
     */
    function showToast(message, duration = 2000) {
        const toast = document.createElement('div');
        toast.className = 'paywall-toast';
        toast.textContent = message;
        document.body.appendChild(toast);
        
        setTimeout(() => toast.classList.add('active'), 10);
        setTimeout(() => {
            toast.classList.remove('active');
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }

    /**
     * 显示加载中
     * @param {string} message - 加载提示
     */
    function showLoading(message) {
        // 先移除已有的
        hideLoading();
        const loading = document.createElement('div');
        loading.className = 'paywall-loading';
        loading.id = 'paywallLoading';
        loading.innerHTML = `
            <div class="loading-spinner"></div>
            <p>${message}</p>
        `;
        document.body.appendChild(loading);
    }

    /**
     * 隐藏加载中
     */
    function hideLoading() {
        const loading = document.getElementById('paywallLoading');
        if (loading) {
            loading.remove();
        }
    }

    /**
     * 显示错误信息
     * @param {string} message - 错误消息
     */
    function showError(message) {
        const errorEl = document.getElementById('paywallError');
        if (errorEl) {
            errorEl.textContent = message;
            errorEl.style.display = 'block';
            setTimeout(() => {
                errorEl.style.display = 'none';
            }, 3000);
        } else {
            showToast(message, 3000);
        }
    }

    // ==================== 公开API ====================

    // 将关键函数暴露到全局（供HTML onclick调用）
    window.handleCodeActivation = handleCodeActivation;
    window.handlePayment = handlePayment;
    window.handleShareUnlock = handleShareUnlock;
    window.closePaywallModal = closePaywallModal;
    window.closeSharePrompt = closeSharePrompt;
    window.checkShareStatus = checkShareStatus;
    window.checkPaymentStatus = checkPaymentStatus;

    // ==================== 退款申请 ====================

    /**
     * 显示退款申请弹窗
     */
    function showRefundModal() {
        // 移除已有弹窗
        const existing = document.getElementById('refundModal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'refundModal';
        modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);z-index:999999;display:flex;align-items:center;justify-content:center;padding:20px;';
        modal.innerHTML = `
            <div style="background:#1a1a2e;border-radius:16px;padding:24px;max-width:400px;width:100%;color:#e0e0e0;position:relative;">
                <span style="position:absolute;top:12px;right:16px;font-size:24px;cursor:pointer;color:#666;" onclick="window._closeRefundModal()">&times;</span>
                <h3 style="text-align:center;margin:0 0 16px;color:#ffd700;">📋 申请退款</h3>
                <div style="margin-bottom:12px;">
                    <label style="display:block;font-size:13px;color:#999;margin-bottom:4px;">订单号（选填，支付成功页面有显示）</label>
                    <input type="text" id="refundOrderId" placeholder="如 BZ1717..." style="width:100%;padding:10px;border-radius:8px;border:1px solid #333;background:#0d0d1a;color:#e0e0e0;font-size:14px;box-sizing:border-box;">
                </div>
                <div style="margin-bottom:12px;">
                    <label style="display:block;font-size:13px;color:#999;margin-bottom:4px;">退款原因 *</label>
                    <textarea id="refundReason" rows="3" placeholder="请说明退款原因" style="width:100%;padding:10px;border-radius:8px;border:1px solid #333;background:#0d0d1a;color:#e0e0e0;font-size:14px;box-sizing:border-box;resize:vertical;"></textarea>
                </div>
                <div style="margin-bottom:16px;">
                    <label style="display:block;font-size:13px;color:#999;margin-bottom:4px;">联系方式 *（微信号或手机号）</label>
                    <input type="text" id="refundContact" placeholder="方便联系您处理退款" style="width:100%;padding:10px;border-radius:8px;border:1px solid #333;background:#0d0d1a;color:#e0e0e0;font-size:14px;box-sizing:border-box;">
                </div>
                <button onclick="window._submitRefund()" style="width:100%;padding:12px;border:none;border-radius:8px;background:linear-gradient(135deg,#ffd700,#ff9500);color:#1a1a2e;font-size:16px;font-weight:bold;cursor:pointer;">提交退款申请</button>
                <p style="text-align:center;font-size:11px;color:#666;margin-top:10px;">提交后将在24小时内处理</p>
            </div>
        `;
        document.body.appendChild(modal);
    }

    /**
     * 关闭退款弹窗
     */
    function closeRefundModal() {
        const modal = document.getElementById('refundModal');
        if (modal) modal.remove();
    }

    /**
     * 提交退款申请
     */
    function submitRefund() {
        var orderId = document.getElementById('refundOrderId').value.trim();
        var reason = document.getElementById('refundReason').value.trim();
        var contact = document.getElementById('refundContact').value.trim();

        if (!reason) { showToast('请填写退款原因'); return; }
        if (!contact) { showToast('请填写联系方式'); return; }

        var btn = document.querySelector('#refundModal button');
        if (btn) { btn.disabled = true; btn.textContent = '提交中...'; }

        fetch(API_BASE_URL + '/refund/apply', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ order_id: orderId, reason: reason, contact: contact })
        })
        .then(function(res) { return res.json(); })
        .then(function(data) {
            if (data.success) {
                showToast('✅ 退款申请已提交，将在24小时内处理');
                closeRefundModal();
            } else {
                showToast(data.error || '提交失败');
                if (btn) { btn.disabled = false; btn.textContent = '提交退款申请'; }
            }
        })
        .catch(function() {
            showToast('网络错误，请重试');
            if (btn) { btn.disabled = false; btn.textContent = '提交退款申请'; }
        });
    }

    window._showRefundModal = showRefundModal;
    window._closeRefundModal = closeRefundModal;
    window._submitRefund = submitRefund;

    // 将关键函数暴露到模块API
    window.PaywallSystem = {
        init: initPaywall,
        isActivated: function() { return isPremiumActivated; },
        activate: activatePremium,
        showModal: showPaymentModal,
        closeModal: closePaywallModal
    };

    // DOM加载完成后初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initPaywall);
    } else {
        initPaywall();
    }

})();
