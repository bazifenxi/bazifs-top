/**
 * 八字工具付费墙系统
 * 
 * 功能：
 * 1. 对付费卡片添加模糊遮罩
 * 2. 支付弹窗（分享解锁/微信支付）
 * 3. 激活码验证
 * 4. localStorage 存储激活状态
 * 5. MutationObserver 监听动态卡片
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

    // 后端API地址（部署到腾讯云后修改）
    const API_BASE_URL = 'https://bazi.zhongyi-note.top/bazi-api/pay';

    // localStorage 键名
    const STORAGE_KEY = 'bazi_premium_activated';
    const SHARE_COUNT_KEY = 'bazi_share_count';
    const ACTIVATION_CODE_KEY = 'bazi_activation_code';

    // ==================== 状态管理 ====================

    let isPremiumActivated = false;
    let shareCount = 0;
    let activationCode = '';

    /**
     * 初始化付费墙系统
     */
    function initPaywall() {
        // 从localStorage读取激活状态
        loadActivationStatus();
        
        // 监听DOM变化（处理动态创建的卡片）
        observeDynamicCards();
        
        // 监听分析完成事件
        setupAnalysisCompleteListener();
    }

    /**
     * 从localStorage加载激活状态
     */
    function loadActivationStatus() {
        try {
            const activated = localStorage.getItem(STORAGE_KEY);
            if (activated === 'true') {
                isPremiumActivated = true;
            }
            
            const shareStr = localStorage.getItem(SHARE_COUNT_KEY);
            shareCount = shareStr ? parseInt(shareStr, 10) || 0 : 0;
            
            activationCode = localStorage.getItem(ACTIVATION_CODE_KEY) || '';
        } catch (e) {
            console.error('读取激活状态失败:', e);
        }
    }

    /**
     * 保存激活状态到localStorage
     */
    function saveActivationStatus() {
        try {
            localStorage.setItem(STORAGE_KEY, isPremiumActivated ? 'true' : 'false');
            localStorage.setItem(SHARE_COUNT_KEY, shareCount.toString());
            if (activationCode) {
                localStorage.setItem(ACTIVATION_CODE_KEY, activationCode);
            }
        } catch (e) {
            console.error('保存激活状态失败:', e);
        }
    }

    /**
     * 激活付费功能
     * @param {string} method - 激活方式：'share' | 'pay188' | 'pay388' | 'code'
     * @param {string} code - 激活码（可选）
     */
    function activatePremium(method, code) {
        isPremiumActivated = true;
        if (code) {
            activationCode = code;
        }
        saveActivationStatus();
        
        // 移除所有遮罩
        removeAllPaywalls();
        
        // 显示成功提示
        showToast('🎉 解锁成功！所有付费内容已开放');
    }

    // ==================== 遮罩处理 ====================

    /**
     * 对所有付费卡片应用遮罩
     */
    function applyPaywallsToPremiumCards() {
        // 如果已激活，直接返回
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
     * 对单个卡片应用遮罩
     * @param {HTMLElement} card - 卡片元素
     */
    function applyPaywallToCard(card) {
        // 避免重复添加
        if (card.dataset.hasPaywall === 'true') {
            return;
        }
        card.dataset.hasPaywall = 'true';

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
     * 移除所有付费遮罩
     */
    function removeAllPaywalls() {
        const overlays = document.querySelectorAll('.paywall-overlay');
        overlays.forEach(overlay => {
            overlay.remove();
        });
        
        // 重置卡片标记
        PREMIUM_CARDS.forEach(cardId => {
            const card = document.getElementById(cardId);
            if (card) {
                card.dataset.hasPaywall = 'false';
            }
        });
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
            // 先调用原始函数
            if (originalDisplayResults) {
                originalDisplayResults.apply(this, arguments);
            }
            
            // 延迟应用遮罩，确保所有卡片都已生成
            setTimeout(function() {
                applyPaywallsToPremiumCards();
            }, 100);
        };

        // 也监听 handleAnalyze 中的 setTimeout
        const originalHandleAnalyze = window.handleAnalyze;
        
        if (originalHandleAnalyze) {
            window.handleAnalyze = function() {
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
                        支持以下方式解锁全部付费分析内容
                    </p>
                    
                    <div class="paywall-options">
                        <!-- 分享解锁 -->
                        <div class="paywall-option paywall-option-share" onclick="handleShareUnlock()">
                            <div class="option-icon">📱</div>
                            <div class="option-title">分享解锁</div>
                            <div class="option-desc">分享到2个微信群即可免费解锁</div>
                            <div class="option-status" id="shareStatus">
                                ${shareCount >= 2 ? '✓ 已解锁' : `已分享 ${shareCount}/2 次`}
                            </div>
                        </div>
                        
                        <!-- 随喜188 -->
                        <div class="paywall-option paywall-option-188" onclick="handlePayment(188)">
                            <div class="option-icon">💰</div>
                            <div class="option-title">随喜 ¥188</div>
                            <div class="option-desc">基础版解锁</div>
                            <div class="option-tag">推荐</div>
                        </div>
                        
                        <!-- 随喜388 -->
                        <div class="paywall-option paywall-option-388" onclick="handlePayment(388)">
                            <div class="option-icon">💎</div>
                            <div class="option-title">随喜 ¥388</div>
                            <div class="option-desc">高级版解锁 + 专属解读</div>
                            <div class="option-tag vip">VIP</div>
                        </div>
                    </div>
                    
                    <div class="paywall-divider">
                        <span>或输入激活码</span>
                    </div>
                    
                    <div class="paywall-code-section">
                        <input type="text" id="activationCodeInput" placeholder="请输入激活码" class="paywall-code-input">
                        <button onclick="handleCodeActivation()" class="paywall-code-btn">激活</button>
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

        // 检查是否支持分享API
        if (navigator.share) {
            // 使用原生分享API
            navigator.share({
                title: '八字分析系统 - 命理解读',
                text: '快来试试这个八字分析工具，帮你解读命运！',
                url: window.location.href
            }).then(() => {
                incrementShareCount();
            }).catch(err => {
                // 用户取消分享，显示提示
                if (err.name !== 'AbortError') {
                    showSharePrompt();
                }
            });
        } else {
            // 不支持原生分享，显示引导提示
            showSharePrompt();
        }
    }

    /**
     * 显示分享提示弹窗
     */
    function showSharePrompt() {
        const prompt = document.createElement('div');
        prompt.className = 'share-prompt';
        prompt.innerHTML = `
            <div class="share-prompt-content">
                <div class="share-prompt-icon">📱</div>
                <h3>分享到微信群</h3>
                <p>请将八字分析工具分享到</p>
                <p><strong>2个大于50人的微信群</strong></p>
                <p class="share-prompt-hint">分享完成后，点击下方"已完成分享"按钮</p>
                <div class="share-prompt-actions">
                    <button class="share-prompt-btn-cancel" onclick="this.closest('.share-prompt').remove()">稍后再说</button>
                    <button class="share-prompt-btn-confirm" onclick="handleShareComplete()">已完成分享 ✓</button>
                </div>
            </div>
        `;
        document.body.appendChild(prompt);
        setTimeout(() => prompt.classList.add('active'), 10);
    }

    /**
     * 处理分享完成
     */
    function handleShareComplete() {
        // 移除提示
        const prompt = document.querySelector('.share-prompt');
        if (prompt) {
            prompt.classList.remove('active');
            setTimeout(() => prompt.remove(), 300);
        }
        
        incrementShareCount();
    }

    /**
     * 增加分享次数
     */
    function incrementShareCount() {
        shareCount++;
        saveActivationStatus();
        
        // 更新状态显示
        const statusEl = document.getElementById('shareStatus');
        if (statusEl) {
            if (shareCount >= 2) {
                statusEl.innerHTML = '✓ 已解锁';
                statusEl.className = 'option-status unlocked';
            } else {
                statusEl.innerHTML = `已分享 ${shareCount}/2 次`;
            }
        }
        
        // 如果达到2次，激活付费
        if (shareCount >= 2) {
            setTimeout(() => {
                activatePremium('share');
            }, 500);
        } else {
            showToast(`已记录分享 ${shareCount}/2，还需分享 ${2 - shareCount} 个群`);
        }
    }

    // ==================== 微信支付 ====================

    /**
     * 处理微信支付
     * @param {number} amount - 支付金额
     */
    function handlePayment(amount) {
        showLoading('正在创建订单...');
        
        // 模拟支付流程（实际应调用后端API）
        // 虎皮椒对接代码（预留）
        createPaymentOrder(amount)
            .then(orderInfo => {
                hideLoading();
                showPaymentQRCode(orderInfo);
            })
            .catch(err => {
                hideLoading();
                showError('创建订单失败: ' + err.message);
            });
    }

    /**
     * 创建支付订单
     * @param {number} amount - 支付金额
     * @returns {Promise} 订单信息
     */
    function createPaymentOrder(amount) {
        // TODO: 替换为实际API调用
        // return fetch(API_BASE_URL + '/create-order', {
        //     method: 'POST',
        //     headers: { 'Content-Type': 'application/json' },
        //     body: JSON.stringify({ amount: amount })
        // }).then(res => res.json());

        // Mock模式：模拟订单创建
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve({
                    orderId: 'MOCK_' + Date.now(),
                    amount: amount,
                    qrcodeUrl: 'weixin://wxpay/bizpayurl?pr=mock',
                    mockMode: true
                });
            }, 500);
        });
    }

    /**
     * 显示支付二维码
     * @param {Object} orderInfo - 订单信息
     */
    function showPaymentQRCode(orderInfo) {
        const modal = document.getElementById('paywallModal');
        const body = modal ? modal.querySelector('.paywall-modal-body') : null;
        
        if (!body) return;

        // 保存当前订单信息
        window.currentPaymentOrder = orderInfo;

        body.innerHTML = `
            <div class="qrcode-section">
                <div class="qrcode-header">
                    <h3>微信支付</h3>
                    <p>扫描下方二维码完成支付</p>
                </div>
                <div class="qrcode-amount">¥${orderInfo.amount}</div>
                <div class="qrcode-box" id="qrcodeBox">
                    <div class="qrcode-placeholder">
                        <div class="qrcode-icon">📱</div>
                        <p>支付二维码</p>
                        <p class="qrcode-hint">（Mock模式演示）</p>
                    </div>
                </div>
                <div class="qrcode-tip">
                    <p>💡 支付完成后点击"已完成支付"按钮</p>
                </div>
                <div class="qrcode-actions">
                    <button class="qrcode-btn-cancel" onclick="checkPaymentStatus()">已完成支付 ✓</button>
                    <button class="qrcode-btn-back" onclick="location.reload()">返回重试</button>
                </div>
                ${orderInfo.mockMode ? '<p class="mock-notice">⚠️ 当前为Mock模式，请输入激活码测试</p>' : ''}
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

        showLoading('检查支付状态...');
        
        // 实际应调用后端API查询订单状态
        // checkOrderStatus(order.orderId)
        
        // Mock模式：直接激活
        setTimeout(() => {
            hideLoading();
            activatePremium(order.amount === 388 ? 'pay388' : 'pay188', 'MOCK_' + order.orderId);
        }, 1000);
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
        
        // 验证激活码
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
        // TODO: 替换为实际API调用
        // return fetch(API_BASE_URL + '/verify-code?code=' + code)
        //     .then(res => res.json());

        // Mock模式：支持测试码
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
                } else if (code.length >= 6) {
                    // 尝试调用后端验证
                    fetch(API_BASE_URL + '/verify-code?code=' + code)
                        .then(res => res.json())
                        .then(data => resolve(data))
                        .catch(() => resolve({ valid: false, message: '激活码无效' }));
                } else {
                    resolve({ valid: false, message: '激活码格式不正确' });
                }
            }, 500);
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
            showToast(message);
        }
    }

    // ==================== 公开API ====================

    // 将关键函数暴露到全局
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
